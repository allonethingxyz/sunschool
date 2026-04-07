"""
005_missing_node_labels.py — Add missing AGE node labels and default Character.

The deployed DB only has User, Learner, Conversation, Concept labels.
Migration 004 originally targeted the wrong graph name ('sunschool' instead of
'sunschool_graph'). This migration adds the missing labels to the correct graph
and creates the default 'Sunny' Character node for MVP.

Missing labels: Character, Lesson, Quiz, Media, Gate, Standard

Idempotent: safe to run multiple times. Uses IF NOT EXISTS / MERGE.

Run: python sunschool/app/migrations/005_missing_node_labels.py
Requires: DATABASE_URL environment variable.
"""

import os
import sys
import logging

import psycopg2

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL")

GRAPH_NAME = "sunschool_graph"

AGE_INIT_SQL = """
LOAD 'age';
SET search_path = ag_catalog, "$user", public;
"""

# Labels that should exist but are missing from deployed DB
MISSING_LABELS = [
    "Character",
    "Lesson",
    "Quiz",
    "Media",
    "Gate",
    "Standard",
]

# Default Character node for MVP — check then create (AGE doesn't support MERGE ON CREATE SET)
CHECK_CHARACTER_CYPHER = f"""
SELECT * FROM cypher('{GRAPH_NAME}', $$
    MATCH (c:Character {{id: 'sunny'}})
    RETURN c
$$) AS (v agtype);
"""

CREATE_CHARACTER_CYPHER = f"""
SELECT * FROM cypher('{GRAPH_NAME}', $$
    CREATE (c:Character {{
        id: 'sunny',
        name: 'Sunny',
        era: 'modern',
        expertise: '["general"]',
        personality_prompt: 'You are Sunny, a friendly and encouraging AI tutor who loves helping kids learn. You are patient, use simple language, and make learning fun with examples and questions.',
        knowledge_bounds: '[]',
        clockchain_refs: '[]',
        active: true
    }})
    RETURN c
$$) AS (v agtype);
"""


def _create_label_if_not_exists(cur, label: str) -> None:
    """Create a vertex label in the sunschool_graph if it doesn't already exist."""
    cur.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM ag_catalog.ag_label
                WHERE graph = (SELECT graphid FROM ag_catalog.ag_graph WHERE name = '{GRAPH_NAME}')
                  AND name = '{label}'
                  AND kind = 'v'
            ) THEN
                PERFORM ag_catalog.create_vlabel('{GRAPH_NAME}', '{label}');
            END IF;
        END
        $$;
        """
    )


def run_migration():
    """Add missing node labels and default Character to the deployed graph."""
    if not DATABASE_URL:
        logger.error("DATABASE_URL environment variable is not set.")
        sys.exit(1)

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            # 1. Load AGE and set search_path
            logger.info("=== Loading AGE + setting search_path ===")
            cur.execute(AGE_INIT_SQL)

            # 2. Verify graph exists
            cur.execute(
                "SELECT 1 FROM ag_catalog.ag_graph WHERE name = %s",
                (GRAPH_NAME,),
            )
            if not cur.fetchone():
                logger.error("Graph '%s' does not exist! Run migration 004 first.", GRAPH_NAME)
                sys.exit(1)
            logger.info("Graph '%s' confirmed.", GRAPH_NAME)

            # 3. Create missing node labels
            logger.info("=== Creating missing node labels ===")
            for label in MISSING_LABELS:
                _create_label_if_not_exists(cur, label)
                logger.info("  Label '%s' ensured.", label)

            # 4. Also ensure the existing labels are present (idempotent)
            for label in ["User", "Learner", "Conversation", "Concept"]:
                _create_label_if_not_exists(cur, label)
                logger.info("  Label '%s' verified.", label)

            logger.info("All 10 node labels ensured.")

            # 5. Create default 'Sunny' Character node if not exists
            logger.info("=== Creating default 'Sunny' Character node ===")
            cur.execute(CHECK_CHARACTER_CYPHER)
            if not cur.fetchone():
                cur.execute(CREATE_CHARACTER_CYPHER)
                logger.info("Default 'Sunny' character (id='sunny') created.")
            else:
                logger.info("Default 'Sunny' character (id='sunny') already exists.")

            logger.info("=== Migration 005 complete ===")
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
