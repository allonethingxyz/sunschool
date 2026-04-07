"""
004_age_graph_schema.py — Initialize Apache AGE graph schema for Sunschool.

Sets up the AGE extension, creates the 'sunschool_graph' graph with all node labels,
creates the relational prompt_audit table, and inserts the default MVP tutor
Character node.

Idempotent: safe to run multiple times. Uses IF NOT EXISTS / ON CONFLICT.

Run: python sunschool/app/migrations/004_age_graph_schema.py
Requires: DATABASE_URL environment variable.
"""

import os
import sys
import logging

import psycopg2

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL")

# -- Step 1 & 2: Extension + search_path ---------------------------------

AGE_EXTENSION_SQL = "CREATE EXTENSION IF NOT EXISTS age;"

AGE_INIT_SQL = """
LOAD 'age';
SET search_path = ag_catalog, "$user", public;
"""

# -- Step 3: Create graph -------------------------------------------------

CREATE_GRAPH_SQL = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ag_catalog.ag_graph WHERE name = 'sunschool_graph'
    ) THEN
        PERFORM create_graph('sunschool_graph');
    END IF;
END
$$;
"""

# -- Step 4: Node labels --------------------------------------------------

NODE_LABELS = [
    "Character",
    "Conversation",
    "Lesson",
    "Concept",
    "Quiz",
    "Media",
    "Learner",
    "Gate",
    "User",
    "Standard",
]

# -- Step 5: prompt_audit relational table --------------------------------

PROMPT_AUDIT_DDL = """
CREATE TABLE IF NOT EXISTS prompt_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID,
    conversation_id UUID,
    prompt_type TEXT CHECK (prompt_type IN ('lesson_gen', 'quiz_gen', 'assessment', 'character_dialog')),
    system_message TEXT,
    user_message TEXT,
    model TEXT,
    response_preview TEXT,
    tokens_used INT,
    cost_estimate DECIMAL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"""

PROMPT_AUDIT_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_prompt_audit_learner ON prompt_audit (learner_id);",
    "CREATE INDEX IF NOT EXISTS idx_prompt_audit_conversation ON prompt_audit (conversation_id);",
    "CREATE INDEX IF NOT EXISTS idx_prompt_audit_created ON prompt_audit (created_at);",
]

# -- Step 6: Default Character node (MVP tutor) ---------------------------

CHECK_CHARACTER_CYPHER = """
SELECT * FROM cypher('sunschool_graph', $$
    MATCH (c:Character {id: 'sunny'})
    RETURN c
$$) AS (v agtype);
"""

CREATE_CHARACTER_CYPHER = """
SELECT * FROM cypher('sunschool_graph', $$
    CREATE (c:Character {
        id: 'sunny',
        name: 'Sunny',
        era: 'modern',
        expertise: '["general"]',
        personality_prompt: 'You are Sunny, a friendly and encouraging AI tutor who loves helping kids learn. You are patient, use simple language, and make learning fun with examples and questions.',
        knowledge_bounds: '[]',
        active: true
    })
    RETURN c
$$) AS (v agtype);
"""


def _create_label_if_not_exists(cur, label: str) -> None:
    """Create a vertex label in the sunschool graph if it doesn't already exist."""
    # Cannot use %s inside DO $$ blocks; use Python string formatting.
    # Label names are from a hardcoded list so this is safe from injection.
    cur.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM ag_catalog.ag_label
                WHERE graph = (SELECT graphid FROM ag_catalog.ag_graph WHERE name = 'sunschool_graph')
                  AND name = '{label}'
                  AND kind = 'v'
            ) THEN
                PERFORM ag_catalog.create_vlabel('sunschool_graph', '{label}');
            END IF;
        END
        $$;
        """
    )


def run_migration():
    """Run the full AGE graph schema migration."""
    if not DATABASE_URL:
        logger.error("DATABASE_URL environment variable is not set.")
        sys.exit(1)

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            # 1. Create AGE extension
            logger.info("=== Step 1: Creating AGE extension ===")
            cur.execute(AGE_EXTENSION_SQL)
            logger.info("AGE extension ensured.")

            # 2. Load AGE and set search_path
            logger.info("=== Step 2: Loading AGE + setting search_path ===")
            cur.execute(AGE_INIT_SQL)
            logger.info("AGE loaded, search_path set.")

            # 3. Create graph
            logger.info("=== Step 3: Creating 'sunschool_graph' graph ===")
            cur.execute(CREATE_GRAPH_SQL)
            logger.info("sunschool_graph graph ensured.")

            # 4. Create all node labels
            logger.info("=== Step 4: Creating node labels ===")
            for label in NODE_LABELS:
                _create_label_if_not_exists(cur, label)
                logger.info("  Label '%s' ensured.", label)
            logger.info("All node labels created.")

            # 5. Create prompt_audit table + indexes
            logger.info("=== Step 5: Creating prompt_audit table ===")
            cur.execute(PROMPT_AUDIT_DDL)
            for idx_sql in PROMPT_AUDIT_INDEXES:
                cur.execute(idx_sql)
            logger.info("prompt_audit table and indexes ensured.")

            # 6. Create default Character node if not exists
            logger.info("=== Step 6: Creating default Character node ===")
            cur.execute(CHECK_CHARACTER_CYPHER)
            if not cur.fetchone():
                cur.execute(CREATE_CHARACTER_CYPHER)
                logger.info("Default 'Sunny' tutor character created.")
            else:
                logger.info("Default 'Sunny' tutor character already exists.")

            logger.info("=== Migration 004 complete ===")
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
