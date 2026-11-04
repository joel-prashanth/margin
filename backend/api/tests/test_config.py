import pytest

from app.core.config import Settings


@pytest.mark.parametrize(
    "given",
    [
        "postgresql://user:pass@host/db?sslmode=require",
        "postgres://user:pass@host/db?sslmode=require",
        "postgresql+psycopg://user:pass@host/db?sslmode=require",
    ],
)
def test_database_url_uses_psycopg_driver(given):
    settings = Settings(database_url=given)

    assert settings.database_url == "postgresql+psycopg://user:pass@host/db?sslmode=require"


def test_blank_database_url_is_none():
    assert Settings(database_url="").database_url is None
