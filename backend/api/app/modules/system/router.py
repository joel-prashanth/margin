"""Liveness/readiness endpoints for the host platform and uptime checks."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.db import check_database

router = APIRouter(tags=["system"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    environment: str
    database: Literal["not_configured", "ok", "error"]


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        environment=get_settings().environment,
        database=check_database(),
    )
