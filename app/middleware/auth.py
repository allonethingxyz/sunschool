"""Google OAuth2 authentication middleware for FastAPI.

Verifies Google ID tokens from the Authorization header and provides
the authenticated user as a FastAPI dependency via ``CurrentUser``.

In development mode (SUNSCHOOL_ENVIRONMENT=development), a dev bypass allows
setting user identity via X-Dev-User-* headers for local testing.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import settings

logger = logging.getLogger("sunschool.auth")

# ---------------------------------------------------------------------------
# Google OAuth2 token verification
# ---------------------------------------------------------------------------

GOOGLE_CLIENT_ID = settings.google_oauth_client_id


def verify_google_token(token: str) -> dict:
    """Verify a Google OAuth2 ID token and return the decoded claims.

    Raises ValueError if the token is invalid or not issued for our client.
    """
    idinfo = id_token.verify_oauth2_token(
        token,
        google_requests.Request(),
        GOOGLE_CLIENT_ID,
    )
    return idinfo  # has 'sub', 'email', 'name', 'picture'


def _is_dev_mode() -> bool:
    """Return True if running in development mode (auth bypass allowed)."""
    return settings.environment == "development"


# ---------------------------------------------------------------------------
# User dataclass
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class User:
    """Authenticated user information extracted from a Google ID token."""

    uid: str
    email: str | None = None
    role: str = "parent"
    display_name: str | None = None
    extra: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------


async def _get_current_user(request: Request) -> User:
    """FastAPI dependency that extracts and verifies the authenticated user.

    1. Extracts Bearer token from the Authorization header.
    2. Verifies the token with Google OAuth2.
    3. Returns a ``User`` with uid, email, role, and display_name.

    In development mode (SUNSCHOOL_ENVIRONMENT=development), accepts
    ``X-Dev-User-*`` headers as a bypass for local testing.

    Raises:
        HTTPException 401: Missing or invalid token.
    """
    # ------------------------------------------------------------------
    # Dev bypass: only when environment is development
    # ------------------------------------------------------------------
    if _is_dev_mode():
        dev_uid = request.headers.get("X-Dev-User-Id")
        if dev_uid:
            logger.debug("Dev bypass: authenticating as uid=%s", dev_uid)
            return User(
                uid=dev_uid,
                email=request.headers.get("X-Dev-User-Email", "dev@sunschool.test"),
                role=request.headers.get("X-Dev-User-Role", "parent"),
                display_name=request.headers.get("X-Dev-User-Name", "Dev User"),
            )

    # ------------------------------------------------------------------
    # Production path: verify Google ID token
    # ------------------------------------------------------------------
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Expect "Bearer <token>"
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header format. Expected: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = parts[1]

    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth client ID not configured",
        )

    try:
        idinfo = verify_google_token(token)
    except ValueError as exc:
        logger.warning("Google token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    uid: str = idinfo.get("sub", "")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing sub claim",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email: str | None = idinfo.get("email")
    display_name: str | None = idinfo.get("name")

    # Default role — no custom claims in plain Google tokens
    role = "parent"

    return User(
        uid=uid,
        email=email,
        role=role,
        display_name=display_name,
        extra={
            "email_verified": idinfo.get("email_verified", False),
            "picture": idinfo.get("picture"),
        },
    )


# Annotated dependency — use as a type hint in route handlers:
#   async def my_route(user: CurrentUser): ...
CurrentUser = Annotated[User, Depends(_get_current_user)]
