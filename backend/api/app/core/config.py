"""Application settings, read from environment variables (and .env locally)."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["local", "staging", "production"] = "local"

    # Neon Postgres, e.g. postgresql+psycopg://user:pass@host/db?sslmode=require
    database_url: str | None = None

    cors_origins: Annotated[list[str], NoDecode] = []

    gemini_api_key: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("database_url", "gemini_api_key", mode="before")
    @classmethod
    def blank_to_none(cls, value: object) -> object:
        return value or None


@lru_cache
def get_settings() -> Settings:
    return Settings()
