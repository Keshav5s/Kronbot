"""Kronbot 1.0 - FastAPI backend (Gemini streaming chat)."""
import json
import os
from typing import List, Literal, Optional

from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from google import genai
from google.genai import types


APP_VERSION = "1.0"
DEFAULT_MODEL = 'gemini-2.5-flash'
GEMINI_API_KEY = 'AQ.Ab8RN6KgEcZpxtTFpCz5Ok7JAJjBPiMgTzjzK2593RRwAKfGxg'
MODELS = {
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
}
BASE_PROMPT = (
    "You are Kronbot, a clear, helpful and concise AI assistant. "
    "Use Markdown (lists, tables, fenced code blocks) when it helps readability. "
    "Reply in the language the user writes in."
)

app = FastAPI(title="Kronbot", version=APP_VERSION, docs_url=None, redoc_url=None)


class Msg(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=20000)


class ChatRequest(BaseModel):
    messages: List[Msg] = Field(min_length=1, max_length=60)
    model: Optional[str] = None
    temperature: float = Field(0.7, ge=0, le=2)
    max_tokens: int = Field(2048, ge=64, le=8192)
    system_prompt: str = Field("", max_length=2000)


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def friendly_error(exc: Exception) -> str:
    msg = str(exc).lower()
    if "api key" in msg or "permission" in msg or "unauthenticated" in msg or "403" in msg or "401" in msg:
        return "The Gemini API key was rejected. Check GEMINI_API_KEY on the server."
    if "429" in msg or "quota" in msg or "resource_exhausted" in msg:
        return "Rate limit reached. Wait a moment and try again."
    if "safety" in msg or "blocked" in msg:
        return "That request was blocked by Gemini's safety filters. Try rephrasing it."
    return "Something went wrong while contacting Gemini. Please try again."


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "Kronbot", "version": APP_VERSION}


@app.get("/api/models")
def models():
    return {"default": DEFAULT_MODEL, "models": [{"id": k, "name": v} for k, v in MODELS.items()]}


@app.post("/api/chat")
def chat(req: ChatRequest):
    key = GEMINI_API_KEY
    if not key:
        return JSONResponse({"error": "Server is missing GEMINI_API_KEY."}, status_code=500)

    model = req.model if req.model in MODELS else DEFAULT_MODEL
    system = BASE_PROMPT + (f"\n\nUser's custom instructions:\n{req.system_prompt.strip()}" if req.system_prompt.strip() else "")

    contents = [
        types.Content(role="user" if m.role == "user" else "model", parts=[types.Part(text=m.content)])
        for m in req.messages
    ]
    cfg = dict(system_instruction=system, temperature=req.temperature, max_output_tokens=req.max_tokens)
    if "pro" not in model:  # keep thinking tokens from eating the output budget
        cfg["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
    config = types.GenerateContentConfig(**cfg)

    def stream():
        try:
            client = genai.Client(api_key=key)
            for chunk in client.models.generate_content_stream(model=model, contents=contents, config=config):
                if chunk.text:
                    yield sse({"t": chunk.text})
            yield sse({"done": True})
        except Exception as exc:  # noqa: BLE001
            yield sse({"error": friendly_error(exc)})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
)
