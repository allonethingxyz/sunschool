"""Authentication middleware for Sunschool API.

Provides Firebase/GIP JWT verification with a dev-mode bypass.
When SUNSCHOOL_ENVIRONMENT=development and no Firebase service account is
configured, requests are authenticated with a synthetic dev user so the
API can be smoke-tested without a full identity-provider setup.

Usage in routes:
    from app.middleware.auth import CurrentUser

    @router.get("/protected")
    async def protected(user: CurrentUser):
        ...
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.config import settings

logger = logging.getLogger("sunschool.auth")


@dataclass
class AuthenticatedUser:
    """Represents an authenticated user extracted from the request."""

    uid: str
    email: str = ""
    name: str = ""
    role: str = "learner"


def _is_dev_bypass_enabled() -> bool:
    """Check whether the dev auth bypass should be active.

    Dev bypass is enabled when:
    - SUNSCHOOL_ENVIRONMENT is "development" (or not set, which defaults to dev)
    - No Firebase service account JSON is configured
    """
    return (
        settings.environment in ("development", "dev", "test")
        and not settings.firebase_service_account_json
    )


async def _get_current_user(request: Request) -> AuthenticatedUser:
    """Extract and verify the current user from the request.

    In dev bypass mode, returns a synthetic user without checking tokens.
    In production mode, verifies the Firebase JWT from the Authorization header.
    """
    # --- Dev bypass ---
    if _is_dev_bypass_enabled():
        # Allow callers to optionally specify a dev user via headers
        dev_uid = request.headers.get("X-Dev-User-Id", "dev-user-001")
        dev_email = request.headers.get("X-Dev-User-Email", "dev@sunschool.test")
        dev_name = request.headers.get("X-Dev-User-Name", "Dev User")
        dev_role = request.headers.get("X-Dev-User-Role", "parent")
        logger.debug(
            "Dev auth bypass: uid=%s email=%s role=%s", dev_uid, dev_email, dev_role
        )
        return AuthenticatedUser(
            uid=dev_uid, email=dev_email, name=dev_name, role=dev_role
        )

    # --- Production: Firebase JWT verification ---
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header.split("Bearer ", 1)[1]

    try:
        import firebase_admin
        from firebase_admin import auth as firebase_auth

        # Initialize Firebase app if not already done
        if not firebase_admin._apps:
            import json

            cred_data = json.loads(settings.firebase_service_account_json)
            cred = firebase_admin.credentials.Certificate(cred_data)
            firebase_admin.initialize_app(cred)

        decoded = firebase_auth.verify_id_token(token)
        return AuthenticatedUser(
            uid=decoded["uid"],
            email=decoded.get("email", ""),
            name=decoded.get("name", ""),
            role=decoded.get("role", "learner"),
        )
    except ImportError:
        logger.error("firebase-admin not installed but production auth required")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service misconfigured",
        )
    except Exception as exc:
        logger.warning("JWT verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# Type alias for FastAPI dependency injection
CurrentUser = Annotated[AuthenticatedUser, Depends(_get_current_user)]
