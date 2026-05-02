"""
005_parent_guidelines.py — Create parent_guidelines relational table.

Stores per-user content guidelines set by parents.

Idempotent: safe to run multiple times. Uses IF NOT EXISTS.

Run: python sunschool/app/migrations/005_parent_guidelines.py
Requires: DATABASE_URL environment variable.
"""

import os
import sys
import logging

import psycopg2

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL")

PARENT_GUIDELINES_DDL = """
CREATE TABLE IF NOT EXISTS parent_guidelines (
    user_uid TEXT PRIMARY KEY,
    guidelines TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT now()
);
"""


def run_migration():
    """Create the parent_guidelines table."""
    if not DATABASE_URL:
        logger.error("DATABASE_URL environment variable is not set.")
        sys.exit(1)

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            logger.info("=== Creating parent_guidelines table ===")
            cur.execute(PARENT_GUIDELINES_DDL)
            logger.info("parent_guidelines table ensured.")
            logger.info("=== Migration 005 complete ===")
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
