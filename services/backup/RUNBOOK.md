# Sunschool Backup & Restore Runbook

## Overview

Daily automated backups of the Sunschool PostgreSQL+AGE database to Cloudflare R2.

- **Schedule:** Daily at 03:00 UTC via Railway cron service
- **Format:** gzipped plain-SQL pg_dump
- **Storage:** Cloudflare R2 bucket `sunschool-backups`
- **Retention:** 7 daily + 4 weekly (Sundays)

## Architecture

```
Railway Cron Service (services/backup/)
  → pg_dump against apache-age.railway.internal:5432
  → gzip compress
  → upload to R2: daily/sunschool_YYYYMMDDTHHMMSSZ.sql.gz
  → on Sundays, also: weekly/sunschool_YYYYMMDDTHHMMSSZ.sql.gz
  → rotate old backups beyond retention limits
```

## Environment Variables

Set these on the Railway backup cron service:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PGHOST` | No | `apache-age.railway.internal` | AGE container host |
| `PGPORT` | No | `5432` | PostgreSQL port |
| `PGUSER` | No | `sunschool` | Database user |
| `PGPASSWORD` | **Yes** | — | Database password |
| `PGDATABASE` | No | `sunschool` | Database name |
| `R2_ENDPOINT_URL` | **Yes** | — | R2 S3-compatible endpoint |
| `R2_ACCESS_KEY` | **Yes** | — | R2 access key ID |
| `R2_SECRET_KEY` | **Yes** | — | R2 secret access key |
| `R2_BUCKET` | No | `sunschool-backups` | R2 bucket name |

## Railway Setup

1. In the Sunschool Railway project, create a new service:
   - **Name:** `backup-cron`
   - **Source:** Same GitHub repo
   - **Root directory:** `services/backup`
   - **Build:** Dockerfile (auto-detected from `services/backup/railway.json`)

2. The `railway.json` configures:
   - Dockerfile build from `services/backup/Dockerfile`
   - Cron schedule: `0 3 * * *` (daily at 03:00 UTC)
   - Restart policy: NEVER (one-shot cron)

3. Set the environment variables listed above on the service.

4. The service must be in the same Railway project/environment as the AGE container to access `apache-age.railway.internal` via Railway's private network.

## Cloudflare R2 Setup

1. Create an R2 bucket named `sunschool-backups` in your Cloudflare account.
2. Create an API token with read/write access to the bucket.
3. Note the S3-compatible endpoint URL (format: `https://<account-id>.r2.cloudflarestorage.com`).

## Monitoring

- Check Railway service logs for the `backup-cron` service.
- Successful runs log: `=== Backup completed successfully ===`
- Failed runs log: `BACKUP FAILED:` and exit with code 1.
- Railway shows cron execution history with pass/fail status.

## Manual Backup

Run the backup container manually from Railway dashboard (trigger the cron service), or locally:

```bash
# Set env vars first, then:
cd services/backup
docker build -t sunschool-backup .
docker run --env-file .env sunschool-backup
```

## Restore Procedure

### 1. Download the backup

```bash
# Install AWS CLI or use any S3-compatible tool
aws s3 cp \
  s3://sunschool-backups/daily/sunschool_YYYYMMDDTHHMMSSZ.sql.gz \
  ./restore.sql.gz \
  --endpoint-url "$R2_ENDPOINT_URL"

gunzip restore.sql.gz
```

### 2. List available backups

```bash
aws s3 ls s3://sunschool-backups/daily/ --endpoint-url "$R2_ENDPOINT_URL"
aws s3 ls s3://sunschool-backups/weekly/ --endpoint-url "$R2_ENDPOINT_URL"
```

### 3. Restore to the AGE container

```bash
# Connect to AGE container (via Railway proxy or direct)
# WARNING: This will overwrite the existing database!

# Drop and recreate the database
psql -h $PGHOST -p $PGPORT -U $PGUSER -d postgres -c "DROP DATABASE IF EXISTS sunschool;"
psql -h $PGHOST -p $PGPORT -U $PGUSER -d postgres -c "CREATE DATABASE sunschool OWNER sunschool;"

# Load the AGE extension first
psql -h $PGHOST -p $PGPORT -U $PGUSER -d sunschool -c "CREATE EXTENSION IF NOT EXISTS age;"
psql -h $PGHOST -p $PGPORT -U $PGUSER -d sunschool -c "LOAD 'age';"

# Restore the dump
psql -h $PGHOST -p $PGPORT -U $PGUSER -d sunschool -f restore.sql
```

### 4. Verify the restore

```bash
psql -h $PGHOST -p $PGPORT -U $PGUSER -d sunschool -c "
  LOAD 'age';
  SET search_path = ag_catalog, \"\$user\", public;
  SELECT * FROM ag_catalog.ag_graph;
"
```

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `BACKUP FAILED: AGE check failed` | AGE container unreachable | Verify AGE service is running; check Railway private network |
| `BACKUP FAILED: pg_dump error` | Auth or permission issue | Check PGPASSWORD; verify user has dump privileges |
| `BACKUP FAILED: upload error` | R2 credentials or network | Verify R2_* env vars; check bucket exists |
| Backup succeeds but no rotation | Rotation is best-effort | Check logs for rotation warnings; manually clean up if needed |
| Old backups not deleted | ListObjects pagination issue | Check R2 bucket directly; rotation uses paginated listing |
