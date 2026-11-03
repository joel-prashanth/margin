from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_without_database():
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "not_configured"


def test_journal_grading_not_implemented_yet():
    response = client.post(
        "/v1/grade/journal",
        json={"content": {"experience": "Built an ER model.", "conclusion": "Plan first."}},
    )

    assert response.status_code == 501


def test_journal_grading_validates_request():
    response = client.post("/v1/grade/journal", json={"content": "not an object"})

    assert response.status_code == 422
