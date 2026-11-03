"""Margin API entry point: `uvicorn app.main:app --reload`."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.modules.grading.router import router as grading_router
from app.modules.system.router import router as system_router

API_PREFIX = "/v1"


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Margin API",
        version="0.1.0",
        # Interactive docs only outside production.
        docs_url=None if settings.environment == "production" else "/docs",
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Authorization"],
    )

    app.include_router(system_router)
    app.include_router(grading_router, prefix=API_PREFIX)

    return app


app = create_app()
