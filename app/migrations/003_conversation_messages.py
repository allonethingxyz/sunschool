"""
003_conversation_messages.py — Create conversation_messages relational table.

Stores individual messages in conversations. The Conversation node lives in
the AGE graph; messages are relational for efficient querying and pagination.

Idempotent: safe to run multiple times. Uses IF NOT EXISTS.
"""

import os
import sys
import logging

import psycopg2

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL")

CONVERSATION_MESSAGES_DDL = """
CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

CONVERSATION_MESSAGES_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_conv_msg_conversation ON conversation_messages (conversation_id);",
    "CREATE INDEX IF NOT EXISTS idx_conv_msg_created ON conversation_messages (conversation_id, created_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_conv_msg_role ON conversation_messages (conversation_id, role);",
]


def run_migration():
    """Create the conversation_messages table and indexes."""
    if not DATABASE_URL:
        logger.error("DATABASE_URL environment variable is not set.")
        sys.exit(1)

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            logger.info("=== Creating conversation_messages table ===")
            cur.execute(CONVERSATION_MESSAGES_DDL)
            logger.info("conversation_messages table ensured.")

            for idx_sql in CONVERSATION_MESSAGES_INDEXES:
                cur.execute(idx_sql)
            logger.info("conversation_messages indexes ensured.")

            logger.info("=== Migration 003 complete ===")
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
