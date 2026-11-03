"""AI grading endpoints.

Grading logic is being ported from the extension (frontend/extension/src/app/services/ai)
and the Cloudflare Worker. Until then the endpoints answer 501.
"""

from fastapi import APIRouter, HTTPException, status

from app.modules.grading.schemas import JournalGradeRequest, JournalGradeResponse

router = APIRouter(prefix="/grade", tags=["grading"])


@router.post("/journal", response_model=JournalGradeResponse)
def grade_journal(request: JournalGradeRequest) -> JournalGradeResponse:
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED,
        "Journal grading is not available yet.",
    )
