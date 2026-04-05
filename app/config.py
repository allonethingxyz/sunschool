"""
Application configuration via pydantic-settings.

All env vars use the SUNSCHOOL_ prefix. Access via:
    from app.config import settings
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Sunschool application settings. Reads SUNSCHOOL_* env vars."""

    model_config = {"env_prefix": "SUNSCHOOL_"}

    # Database
    database_url: str = "postgresql://localhost:5432/sunschool"

    # AI / LLM
    openrouter_api_key: str = ""
    llm_model: str = "google/gemini-2.0-flash-exp:free"

    # Auth
    firebase_project_id: str = ""

    # General
    environment: str = "development"
    log_level: str = "INFO"

    # Content validation
    content_validation_strict: bool = False  # Block on warnings too


settings = Settings()
