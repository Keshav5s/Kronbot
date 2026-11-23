"""Local dev server:  uvicorn dev:app --reload  ->  http://localhost:8000"""
from fastapi.staticfiles import StaticFiles
from api.index import app

app.mount("/", StaticFiles(directory="public", html=True), name="static")
