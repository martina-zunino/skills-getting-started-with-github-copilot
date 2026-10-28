from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

import src.app as app_module


ACTIVITIES = {
    "Chess Club": {
        "description": "Learn strategies and compete in chess tournaments",
        "schedule": "Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 12,
        "participants": ["existing@mergington.edu"],
    }
}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(app_module, "activities", deepcopy(ACTIVITIES))

    with TestClient(app_module.app) as test_client:
        yield test_client


def test_root_redirects_to_static_index(client):
    response = client.get("/", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/static/index.html"


def test_get_activities_returns_activity_data(client):
    response = client.get("/activities")

    assert response.status_code == 200
    assert response.json() == ACTIVITIES


def test_signup_adds_participant(client):
    response = client.post(
        "/activities/Chess Club/signup",
        params={"email": "new@mergington.edu"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "Signed up new@mergington.edu for Chess Club"
    }
    assert app_module.activities["Chess Club"]["participants"] == [
        "existing@mergington.edu",
        "new@mergington.edu",
    ]


def test_signup_returns_not_found_for_unknown_activity(client):
    response = client.post(
        "/activities/Unknown Club/signup",
        params={"email": "new@mergington.edu"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Activity not found"}


def test_signup_rejects_duplicate_participant(client):
    response = client.post(
        "/activities/Chess Club/signup",
        params={"email": "existing@mergington.edu"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Student is already signed up"}


def test_signup_requires_email(client):
    response = client.post("/activities/Chess Club/signup")

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["query", "email"]


def test_unregister_removes_participant(client):
    response = client.delete(
        "/activities/Chess Club/participants",
        params={"email": "existing@mergington.edu"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "Unregistered existing@mergington.edu from Chess Club"
    }
    assert app_module.activities["Chess Club"]["participants"] == []


def test_unregister_returns_not_found_for_unknown_activity(client):
    response = client.delete(
        "/activities/Unknown Club/participants",
        params={"email": "existing@mergington.edu"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Activity not found"}


def test_unregister_returns_not_found_for_unregistered_participant(client):
    response = client.delete(
        "/activities/Chess Club/participants",
        params={"email": "unknown@mergington.edu"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Student is not signed up"}