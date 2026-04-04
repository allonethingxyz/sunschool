from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/sunschool"

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:8000"]

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
