"""Grading API contract, shared by the website demo and the extension."""

from pydantic import BaseModel, Field

JournalScore = Field(ge=0, le=4)


class JournalContent(BaseModel):
    """The five reflective sections a student writes."""

    experience: str = ""
    feelings: str = ""
    learning: str = ""
    application: str = ""
    conclusion: str = ""


class JournalGradeRequest(BaseModel):
    content: JournalContent


class JournalRubric(BaseModel):
    """Aurora ERP expects a capital C for Conclusion in rubric data."""

    experience: int = JournalScore
    feelings: int = JournalScore
    learning: int = JournalScore
    application: int = JournalScore
    Conclusion: int = JournalScore


class JournalGradeResponse(BaseModel):
    rubric: JournalRubric
    reasoning: dict[str, str] = {}
    feedback: str
    flags: list[str] = []
