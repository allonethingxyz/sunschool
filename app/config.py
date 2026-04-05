"""Application configuration via pydantic-settings.

All environment variables use the SUNSCHOOL_ prefix.
Example: SUNSCHOOL_DATABASE_URL, SUNSCHOOL_OPENROUTER_API_KEY
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/sunschool"
    AGE_GRAPH_NAME: str = "sunschool"

    # LLM
    OPENROUTER_API_KEY: str = ""
    DEFAULT_MODEL: str = "google/gemini-2.0-flash-exp:free"
    SCORING_MODEL: str = "google/gemini-2.0-flash-exp:free"
    SUMMARY_MODEL: str = "google/gemini-2.0-flash-exp:free"

    # Auth
    FIREBASE_PROJECT_ID: str = ""

    # Context window management
    CONTEXT_LAST_N_MESSAGES: int = 20
    SUMMARY_EVERY_N_MESSAGES: int = 50

    # Conversation limits
    MAX_MESSAGE_LENGTH: int = 2000

    model_config = {
        "env_prefix": "SUNSCHOOL_",
        "env_file": ".env",
    }


settings = Settings()
