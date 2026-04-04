from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/sunschool"

    # CORS — accepts JSON list or comma-separated string
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
    firebase_service_account_json: str = ""

    model_config = {"env_prefix": "SUNSCHOOL_", "env_file": ".env", "extra": "ignore"}


settings = Settings()
