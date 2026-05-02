"""Sunschool middleware package."""

from app.middleware.auth import CurrentUser

__all__ = ["CurrentUser"]
