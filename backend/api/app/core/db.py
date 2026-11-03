"""Database engine and session (Neon Postgres via SQLAlchemy 2)."""

from collections.abc import Iterator
from functools import lru_cache

from fastapi import HTTPException, status
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Declarative base for all ORM models (imported by Alembic)."""


@lru_cache
def get_engine() -> Engine | None:
    """Returns None when DATABASE_URL is not configured."""
    url = get_settings().database_url
    if not url:
        return None

    # pool_pre_ping: Neon closes idle connections when the compute scales to zero.
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a session; 503 if no database is configured."""
    engine = get_engine()
    if engine is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Database is not configured.")

    with sessionmaker(engine)() as session:
        yield session


def check_database() -> str:
    """'not_configured' | 'ok' | 'error' for the health endpoint."""
    engine = get_engine()
    if engine is None:
        return "not_configured"

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        return "error"

    return "ok"
