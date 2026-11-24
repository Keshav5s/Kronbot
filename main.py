
import os
from pathlib import Path

import requests

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


# =====================================
# KRONBOT 1.0 CONFIGURATION
# =====================================

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(
    title="Kronbot API",
    description="Kronbot 1.0 - Personal AI Assistant",
    version="1.0.0"
)

# Gemini API configuration
API_KEY = os.getenv("GEMINI_API_KEY", "").strip()

MODEL = "gemini-3.8-flash"

GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/"
    f"v1beta/models/{MODEL}:generateContent"
)


# =====================================
# SYSTEM PROMPT
# =====================================

SYSTEM_PROMPT = """
You are Kronbot, a helpful and intelligent AI assistant.

Your personality:
- Friendly, professional and intelligent.
- Give accurate and useful answers.
- Explain difficult topics simply.
- Use headings and bullet points.
- Write code in properly formatted code blocks.
- Never make up facts.
- Respond in the language used by the user.
- Keep simple answers concise.

You were created as Kronbot 1.0.
"""


# =====================================
# PREDEFINED QUESTIONS AND ANSWERS
# =====================================

FAQ = {
    "what is kronbot":
        "Kronbot is a personal AI chatbot powered by Google's Gemini AI.",

    "who created you":
        "I am Kronbot 1.0, a personal AI assistant.",

    "what can you do":
        "I can answer questions, explain programming, generate code, "
        "write content and help with learning.",

    "which ai model do you use":
        "I use Google's Gemini AI model.",

    "what is python":
        "Python is a popular programming language known for its "
        "simple syntax and versatility."
}


# =====================================
# REQUEST MODEL
# =====================================

class ChatRequest(BaseModel):

    message: str = Field(
        min_length=1,
        max_length=10000
    )

    history: list[dict] = Field(
        default_factory=list
    )

    temperature: float = Field(
        default=0.7,
        ge=0,
        le=1
    )

    response_style: str = "balanced"


# =====================================
# GEMINI API FUNCTION
# =====================================

def generate_response(contents, temperature, style):

    if not API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is missing in environment variables."
        )

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY
    }

    payload = {

        "systemInstruction": {
            "parts": [
                {
                    "text": SYSTEM_PROMPT + "\n" + style
                }
            ]
        },

        "contents": contents,

        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": 4096
        }
    }

    try:

        response = requests.post(
            GEMINI_URL,
            headers=headers,
            json=payload,
            timeout=60
        )

        if response.status_code != 200:

            try:
                error_data = response.json()
                error_message = error_data.get(
                    "error", {}
                ).get(
                    "message",
                    "Unknown Gemini API error."
                )
            except ValueError:
                error_message = "Invalid response from Gemini."

            print(
                "Gemini API Error:",
                response.status_code,
                error_message
            )

            if response.status_code == 401:
                raise HTTPException(
                    502,
                    "Gemini authentication failed. "
                    "Check your API key."
                )

            if response.status_code == 403:
                raise HTTPException(
                    502,
                    "Gemini API access denied. "
                    "Check API permissions."
                )

            if response.status_code == 404:
                raise HTTPException(
                    502,
                    "Gemini model not found. Check model access."
                )

            if response.status_code == 429:
                raise HTTPException(
                    429,
                    "Gemini API quota exceeded. Try again later."
                )

            raise HTTPException(
                502,
                f"Gemini API error: {error_message}"
            )

        data = response.json()

        candidates = data.get("candidates", [])

        if not candidates:
            raise HTTPException(
                502,
                "Gemini did not return any response."
            )

        parts = candidates[0].get(
            "content", {}
        ).get(
            "parts", []
        )

        answer = "".join(
            part.get("text", "")
            for part in parts
            if "text" in part
        )

        if not answer.strip():
            raise HTTPException(
                502,
                "Gemini returned an empty response."
            )

        return answer

    except requests.Timeout:

        raise HTTPException(
            504,
            "Gemini API request timed out."
        )

    except requests.RequestException as error:

        print("Connection error:", str(error))

        raise HTTPException(
            502,
            "Unable to connect to Gemini API."
        )


# =====================================
# HOMEPAGE
# =====================================

@app.get("/")
async def home():

    return FileResponse(
        BASE_DIR / "index.html"
    )


# =====================================
# API STATUS
# =====================================

@app.get("/api")
async def api_home():

    return {
        "name": "Kronbot API",
        "version": "1.0",
        "status": "online"
    }


# =====================================
# API KEY CHECK
# =====================================

@app.get("/api/check")
async def check_api():

    return {
        "api_key_configured": bool(API_KEY),
        "authentication_method": "x-goog-api-key",
        "model": MODEL
    }


# =====================================
# GEMINI CONNECTION TEST
# =====================================

@app.get("/api/test-gemini")
async def test_gemini():

    answer = generate_response(
        contents=[
            {
                "role": "user",
                "parts": [
                    {"text": "Reply with exactly: Kronbot connected"}
                ]
            }
        ],
        temperature=0,
        style="Give only the requested short response."
    )

    return {
        "status": "success",
        "gemini_connected": True,
        "reply": answer
    }


# =====================================
# FAQ
# =====================================

@app.get("/api/faq")
async def get_faq():

    return FAQ


# =====================================
# CHAT ENDPOINT
# =====================================

@app.post("/api/chat")
async def chat(request: ChatRequest):

    message = request.message.strip()

    if not message:
        raise HTTPException(
            400,
            "Message cannot be empty."
        )

    # Predefined answers
    question = message.lower()

    if question in FAQ:

        return {
            "reply": FAQ[question],
            "source": "faq"
        }

    # Conversation history
    contents = []

    for item in request.history[-20:]:

        role = item.get("role")
        content = item.get("content", "")

        if (
            role in ["user", "model"]
            and isinstance(content, str)
            and content.strip()
        ):

            contents.append({
                "role": role,
                "parts": [
                    {"text": content[:10000]}
                ]
            })

    # Current message
    contents.append({
        "role": "user",
        "parts": [
            {"text": message}
        ]
    })

    # Response styles
    styles = {

        "short":
            "Give short and direct answers.",

        "balanced":
            "Give balanced answers with useful details.",

        "detailed":
            "Give detailed explanations and examples."

    }

    style = styles.get(
        request.response_style,
        styles["balanced"]
    )

    # Generate response
    answer = generate_response(
        contents=contents,
        temperature=request.temperature,
        style=style
    )

    return {
        "reply": answer,
        "source": "gemini",
        "model": MODEL
    }


# =====================================
# STATIC FILES
# =====================================

app.mount(
    "/static",
    StaticFiles(
        directory=str(BASE_DIR / "static")
    ),
    name="static"
)
