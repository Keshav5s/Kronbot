
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

# Project directory
BASE_DIR = Path(__file__).resolve().parent

# FastAPI application
app = FastAPI(
    title="Kronbot API",
    description="Kronbot 1.0 - Personal AI Assistant",
    version="1.0.0"
)

# Gemini API configuration
# Vercel Environment Variable name: GEMINI_API_KEY
API_KEY = os.getenv("GEMINI_API_KEY")

client = genai.Client(api_key=API_KEY) if API_KEY else None

MODEL = "gemini-3.8-flash"

SYSTEM_PROMPT = """
You are Kronbot, a helpful and intelligent AI assistant.

Your personality:
- Friendly, professional and intelligent.
- Give clear and accurate answers.
- Explain difficult concepts simply.
- Use headings and bullet points.
- Write code in properly formatted code blocks.
- Never make up facts.
- Respond in the language used by the user.
- Keep simple answers concise.

You were created as Kronbot 1.0.
"""

# Predefined questions and answers
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


class ChatRequest(BaseModel):

    message: str = Field(min_length=1, max_length=10000)

    history: list[dict] = Field(default_factory=list)

    temperature: float = Field(
        default=0.7,
        ge=0,
        le=1
    )

    response_style: str = "balanced"


# Homepage
@app.get("/")
async def home():

    return FileResponse(BASE_DIR / "index.html")


# API information
@app.get("/api")
async def api_home():

    return {
        "name": "Kronbot API",
        "version": "1.0",
        "status": "online"
    }


# API key diagnostic
@app.get("/api/check")
async def check_api():

    return {
        "api_key_configured": bool(API_KEY),
        "gemini_client_ready": client is not None,
        "model": MODEL
    }


# FAQ endpoint
@app.get("/api/faq")
async def get_faq():

    return FAQ


# Chat endpoint
@app.post("/api/chat")
async def chat(request: ChatRequest):

    message = request.message.strip()

    if not message:
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty."
        )

    # Predefined answers
    question = message.lower()

    if question in FAQ:

        return {
            "reply": FAQ[question],
            "source": "faq"
        }

    # Check API key
    if client is None:

        raise HTTPException(
            status_code=500,
            detail="Gemini API key is not configured."
        )

    # Conversation history
    contents = []

    for item in request.history[-20:]:

        role = item.get("role")
        content = item.get("content", "")

        if role in ["user", "model"]:

            if isinstance(content, str) and content.strip():

                contents.append({
                    "role": role,
                    "parts": [{"text": content[:10000]}]
                })

    # Current message
    contents.append({
        "role": "user",
        "parts": [{"text": message}]
    })

    # Response styles
    styles = {

        "short": "Give short and direct answers.",

        "balanced": "Give balanced answers with useful details.",

        "detailed": "Give detailed explanations and examples."

    }

    style = styles.get(
        request.response_style,
        styles["balanced"]
    )

    try:

        response = client.models.generate_content(

            model=MODEL,

            contents=contents,

            config=types.GenerateContentConfig(

                system_instruction=SYSTEM_PROMPT + "\n" + style,

                temperature=request.temperature,

                max_output_tokens=4096

            )

        )

        answer = response.text

        if not answer:

            raise HTTPException(
                status_code=502,
                detail="Gemini returned an empty response."
            )

        return {

            "reply": answer,

            "source": "gemini",

            "model": MODEL

        }

    except HTTPException:
        raise

    except Exception as error:

        print("Gemini API Error:", str(error))

        raise HTTPException(
            status_code=502,
            detail="Gemini API request failed. Check your API key and model access."
        )


# Static files
app.mount(
    "/static",
    StaticFiles(directory=str(BASE_DIR / "static")),
    name="static"
)
