import os

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    All vars are prefixed with SUNSCHOOL_ by default, but AGE_DATABASE_URL
    is also accepted as a direct override for the database connection string
    (since Railway provisions it under that name).
    """

    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/sunschool"

    # CORS -- accepts JSON list or comma-separated string
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:8000"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> object:
        if isinstance(v, str) and not v.startswith("["):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    # Environment
    environment: str = "development"
    debug: bool = False

    # OpenRouter
    openrouter_api_key: str = ""

    # Google Identity Platform / Firebase
    firebase_project_id: str = ""
    firebase_api_key: str = ""
    firebase_service_account_json: str = ""

    model_config = {"env_prefix": "SUNSCHOOL_", "env_file": ".env", "extra": "ignore"}


# Build settings, allowing AGE_DATABASE_URL to override database_url
_overrides: dict[str, str] = {}
_age_db_url = os.environ.get("AGE_DATABASE_URL")
if _age_db_url:
    _overrides["database_url"] = _age_db_url

settings = Settings(**_overrides)
