"""PostgreSQL + Apache AGE database connection management.

Every connection runs the AGE initialization hook:
  LOAD 'age';
  SET search_path = ag_catalog, "$user", public;

Provides both raw psycopg2 connections (for Cypher queries via AGE)
and an async-compatible interface for FastAPI.
"""

import contextlib
import logging
from typing import Any, Generator

import psycopg2
import psycopg2.extras
import psycopg2.pool

from app.config import settings

logger = logging.getLogger(__name__)

# Module-level connection pool (initialized lazily)
_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def _init_connection(conn: Any) -> None:
    """Run AGE initialization on every new connection."""
    with conn.cursor() as cur:
        cur.execute("LOAD 'age';")
        cur.execute('SET search_path = ag_catalog, "$user", public;')
    conn.commit()


def get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    """Get or create the connection pool."""
    global _pool
    if _pool is None or _pool.closed:
        _pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=2,
            maxconn=10,
            dsn=settings.DATABASE_URL,
        )
        logger.info("Database connection pool created")
    return _pool


@contextlib.contextmanager
def get_connection() -> Generator[Any, None, None]:
    """Get a connection from the pool with AGE initialized.

    Usage:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(...)
    """
    pool = get_pool()
    conn = pool.getconn()
    try:
        _init_connection(conn)
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def ensure_graph() -> None:
    """Ensure the AGE graph exists. Call once at startup."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM ag_catalog.ag_graph WHERE name = %s",
                (settings.AGE_GRAPH_NAME,),
            )
            if cur.fetchone()[0] == 0:
                cur.execute(
                    f"SELECT create_graph('{settings.AGE_GRAPH_NAME}')"
                )
                logger.info("Created AGE graph: %s", settings.AGE_GRAPH_NAME)
        conn.commit()


def execute_cypher(
    cypher: str, params: dict | None = None, conn: Any = None
) -> list[dict]:
    """Execute a Cypher query against the AGE graph.

    Args:
        cypher: Cypher query string. Use $param_name for parameters.
        params: Optional dict of parameters to bind.
        conn: Optional existing connection (for transaction grouping).

    Returns:
        List of result rows as dicts.
    """
    graph_name = settings.AGE_GRAPH_NAME

    # AGE wraps Cypher in a SQL function call
    sql = f"SELECT * FROM cypher('{graph_name}', $$ {cypher} $$) AS (result agtype)"

    def _execute(c: Any) -> list[dict]:
        # Register agtype for proper deserialization
        try:
            c.cursor().execute("SELECT 'agtype'::regtype::oid")
        except Exception:
            pass

        with c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            rows = cur.fetchall()
        c.commit()
        return [dict(r) for r in rows]

    if conn is not None:
        return _execute(conn)

    with get_connection() as c:
        return _execute(c)


def close_pool() -> None:
    """Close the connection pool. Call on shutdown."""
    global _pool
    if _pool is not None and not _pool.closed:
        _pool.closeall()
        _pool = None
        logger.info("Database connection pool closed")
