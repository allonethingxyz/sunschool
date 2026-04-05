"""
Sunschool Database Backup Service

Daily pg_dump of the sunschool PostgreSQL+AGE database, uploaded to
Cloudflare R2 (S3-compatible). Runs as a Railway cron service.

Retention policy:
  - 7 daily backups
  - 4 weekly backups (kept on Sundays)

Environment variables (set in Railway service):
  PGHOST          - AGE container hostname (e.g. apache-age.railway.internal)
  PGPORT          - PostgreSQL port (default 5432)
  PGUSER          - Database user (default sunschool)
  PGPASSWORD      - Database password
  PGDATABASE      - Database name (default sunschool)
  R2_ENDPOINT_URL - Cloudflare R2 endpoint (e.g. https://<account>.r2.cloudflarestorage.com)
  R2_ACCESS_KEY   - R2 access key ID
  R2_SECRET_KEY   - R2 secret access key
  R2_BUCKET       - R2 bucket name (default sunschool-backups)
"""

import gzip
import logging
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

import boto3
from botocore.config import Config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
log = logging.getLogger("backup")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PGHOST = os.environ.get("PGHOST", "apache-age.railway.internal")
PGPORT = os.environ.get("PGPORT", "5432")
PGUSER = os.environ.get("PGUSER", "sunschool")
PGPASSWORD = os.environ["PGPASSWORD"]  # required — fail loudly if missing
PGDATABASE = os.environ.get("PGDATABASE", "sunschool")

R2_ENDPOINT_URL = os.environ["R2_ENDPOINT_URL"]
R2_ACCESS_KEY = os.environ["R2_ACCESS_KEY"]
R2_SECRET_KEY = os.environ["R2_SECRET_KEY"]
R2_BUCKET = os.environ.get("R2_BUCKET", "sunschool-backups")

DAILY_RETENTION = 7
WEEKLY_RETENTION = 4  # weeks (kept on Sundays)

DAILY_PREFIX = "daily/"
WEEKLY_PREFIX = "weekly/"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT_URL,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def run_pg_dump(dest: Path) -> Path:
    """Run pg_dump and return the path to the gzipped dump file."""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    raw_file = dest / f"sunschool_{timestamp}.sql"
    gz_file = dest / f"sunschool_{timestamp}.sql.gz"

    env = os.environ.copy()
    env["PGPASSWORD"] = PGPASSWORD

    # pg_dump with pre-command to LOAD age extension so AGE catalog is included
    # We use --create to include the CREATE DATABASE statement
    # Custom format is more flexible but plain SQL is more portable for AGE
    log.info("Running pg_dump against %s:%s/%s", PGHOST, PGPORT, PGDATABASE)

    # First: run a quick SQL command to ensure AGE is loaded in the session,
    # then dump. pg_dump doesn't support LOAD directly, but the AGE extension
    # data is captured via pg_dump's normal extension handling. We run a
    # pre-check to verify connectivity and AGE availability.
    check_cmd = [
        "psql",
        "-h", PGHOST,
        "-p", PGPORT,
        "-U", PGUSER,
        "-d", PGDATABASE,
        "-c", "LOAD 'age'; SELECT extversion FROM pg_extension WHERE extname = 'age';",
    ]
    result = subprocess.run(
        check_cmd, env=env, capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        log.error("AGE connectivity check failed: %s", result.stderr)
        raise RuntimeError(f"AGE check failed: {result.stderr}")
    log.info("AGE extension verified: %s", result.stdout.strip().split("\n")[-2].strip())

    # Run pg_dump
    dump_cmd = [
        "pg_dump",
        "-h", PGHOST,
        "-p", PGPORT,
        "-U", PGUSER,
        "-d", PGDATABASE,
        "--no-owner",
        "--no-privileges",
        "--format=plain",
        "-f", str(raw_file),
    ]
    result = subprocess.run(
        dump_cmd, env=env, capture_output=True, text=True, timeout=600
    )
    if result.returncode != 0:
        log.error("pg_dump failed: %s", result.stderr)
        raise RuntimeError(f"pg_dump failed: {result.stderr}")

    raw_size = raw_file.stat().st_size
    log.info("pg_dump complete: %s (%.2f MB)", raw_file.name, raw_size / 1024 / 1024)

    # Gzip compress
    with open(raw_file, "rb") as f_in, gzip.open(gz_file, "wb", compresslevel=6) as f_out:
        while chunk := f_in.read(8192):
            f_out.write(chunk)

    gz_size = gz_file.stat().st_size
    log.info(
        "Compressed: %s (%.2f MB, %.0f%% reduction)",
        gz_file.name,
        gz_size / 1024 / 1024,
        (1 - gz_size / raw_size) * 100 if raw_size > 0 else 0,
    )

    raw_file.unlink()  # remove uncompressed
    return gz_file


def upload_to_r2(s3, local_path: Path, key: str):
    """Upload a file to R2."""
    log.info("Uploading to r2://%s/%s", R2_BUCKET, key)
    s3.upload_file(str(local_path), R2_BUCKET, key)
    log.info("Upload complete: %s", key)


def list_objects(s3, prefix: str) -> list[dict]:
    """List objects under a prefix, sorted by LastModified ascending."""
    objects = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=R2_BUCKET, Prefix=prefix):
        for obj in page.get("Contents", []):
            objects.append(obj)
    objects.sort(key=lambda o: o["LastModified"])
    return objects


def rotate_backups(s3, prefix: str, keep: int):
    """Delete oldest objects under prefix, keeping only `keep` most recent."""
    objects = list_objects(s3, prefix)
    to_delete = objects[: max(0, len(objects) - keep)]
    for obj in to_delete:
        log.info("Rotating out old backup: %s", obj["Key"])
        s3.delete_object(Bucket=R2_BUCKET, Key=obj["Key"])
    if to_delete:
        log.info("Rotated %d old backup(s) from %s", len(to_delete), prefix)
    else:
        log.info("No rotation needed for %s (%d/%d)", prefix, len(objects), keep)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    log.info("=== Sunschool Backup Service starting ===")
    now = datetime.now(timezone.utc)
    log.info("UTC time: %s (weekday: %s)", now.isoformat(), now.strftime("%A"))

    s3 = get_s3_client()

    with TemporaryDirectory() as tmpdir:
        try:
            gz_file = run_pg_dump(Path(tmpdir))
        except Exception:
            log.exception("BACKUP FAILED: pg_dump error")
            sys.exit(1)

        filename = gz_file.name

        # Always upload as a daily backup
        try:
            upload_to_r2(s3, gz_file, f"{DAILY_PREFIX}{filename}")
        except Exception:
            log.exception("BACKUP FAILED: daily upload error")
            sys.exit(1)

        # On Sundays, also keep a weekly copy
        if now.weekday() == 6:  # Sunday
            try:
                upload_to_r2(s3, gz_file, f"{WEEKLY_PREFIX}{filename}")
            except Exception:
                log.exception("BACKUP FAILED: weekly upload error")
                sys.exit(1)

    # Rotate old backups
    try:
        rotate_backups(s3, DAILY_PREFIX, DAILY_RETENTION)
        rotate_backups(s3, WEEKLY_PREFIX, WEEKLY_RETENTION)
    except Exception:
        log.exception("WARNING: Rotation failed (backup itself succeeded)")
        # Don't exit 1 — the backup is safe, rotation is best-effort

    log.info("=== Backup completed successfully ===")


if __name__ == "__main__":
    main()
