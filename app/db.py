"""Database connection pool with Apache AGE initialization hook.

Every PostgreSQL connection to AGE must run:
    LOAD 'age';
    SET search_path = ag_catalog, "$user", public;

This module handles that in the connection pool init hook.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import psycopg2
from psycopg2 import pool

from app.config import settings

_connection_pool: pool.ThreadedConnectionPool | None = None

AGE_INIT_SQL = """
LOAD 'age';
SET search_path = ag_catalog, "$user", public;
"""


def _init_connection(conn: psycopg2.extensions.connection) -> None:
    """Run AGE initialization on a fresh connection."""
    with conn.cursor() as cur:
        cur.execute(AGE_INIT_SQL)
    conn.commit()


def get_pool() -> pool.ThreadedConnectionPool:
    """Get or create the connection pool."""
    global _connection_pool
    if _connection_pool is None:
        dsn = settings.database_url
        print(f"[DB] Creating connection pool with DSN host: {dsn.split('@')[1].split('/')[0] if '@' in dsn else 'unknown'}")
        _connection_pool = pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=10,
            dsn=dsn,
            connect_timeout=5,
        )
    return _connection_pool


@asynccontextmanager
async def get_connection() -> AsyncGenerator[psycopg2.extensions.connection, None]:
    """Get an initialized database connection from the pool.

    The connection has AGE loaded and search_path configured.
    """
    db_pool = get_pool()
    conn = db_pool.getconn()
    try:
        _init_connection(conn)
        yield conn
    finally:
        db_pool.putconn(conn)


def close_pool() -> None:
    """Close all connections in the pool."""
    global _connection_pool
    if _connection_pool is not None:
        _connection_pool.closeall()
        _connection_pool = None
