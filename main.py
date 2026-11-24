
import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

app = FastAPI(
    title="Kronbot API",
    description="Kronbot 1.0 - Personal AI Assistant",
    version="1.0.0"
)

# Gemini API key
# Set GEMINI_API_KEY in Vercel Environment Variables
API_KEY = os.getenv("AQ.Ab8RN6KgEcZpxtTFpCz5Ok7JAJjBPiMgTzjzK2593RRwAKfGxg")

if API_KEY:
    client = genai.Client(api_key=API_KEY)
else:
    client = None

MODEL = "gemini-3.8-flash"

SYSTEM_PROMPT = """
You are Kronbot, a helpful and intelligent AI assistant.

Your personality:
- Friendly, professional and intelligent.
- Give clear and accurate answers.
- Explain difficult concepts in simple language.
- Use headings and bullet points when appropriate.
- Write code in properly formatted code blocks.
- Do not make up facts.
- Respond in the language used by the user.
- Keep simple answers concise.

You were created as Kronbot 1.0.
"""

# Predefined questions and answers
FAQ = {
    "what is kronbot":
        "Kronbot is a personal AI chatbot powered by Google's Gemini AI.",

    "who created you":
        "I am Kronbot 1.0, a personal AI assistant project.",

    "what can you do":
        "I can answer questions, explain programming, generate code, "
        "write content, brainstorm ideas and help with learning.",

    "which ai model do you use":
        "I use Google's Gemini AI model.",

    "what is python":
        "Python is a popular programming language known for its "
        "simple syntax and versatility."
}


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)
    history: list[dict] = Field(default_factory=list)
    temperature: float = Field(default=0.7, ge=0, le=1)
    response_style: str = "balanced"


@app.get("/")
async def home():
    return FileResponse("index.html")


@app.get("/api")
async def api_home():
    return {
        "name": "Kronbot API",
        "version": "1.0",
        "status": "online"
    }


@app.get("/api/faq")
async def get_faq():
    return FAQ


@app.post("/api/chat")
async def chat(request: ChatRequest):

    if not request.message.strip():
        raise HTTPException(400, "Message cannot be empty.")

    # Predefined answers
    question = request.message.strip().lower()

    if question in FAQ:
        return {
            "reply": FAQ[question],
            "source": "faq"
        }

    if client is None:
        raise HTTPException(
            500,
            "Gemini API key is not configured."
        )

    # Keep only recent valid conversation messages
    history = []

    for item in request.history[-20:]:
        role = item.get("role")
        content = item.get("content", "")

        if role in ["user", "model"] and isinstance(content, str):
            if content.strip():
                history.append({
                    "role": role,
                    "parts": [{"text": content[:10000]}]
                })

    history.append({
        "role": "user",
        "parts": [{"text": request.message.strip()}]
    })

    style_instructions = {
        "balanced": "Use a balanced amount of detail.",
        "short": "Give short and direct answers.",
        "detailed": "Give detailed explanations and examples."
    }

    style = style_instructions.get(
        request.response_style,
        style_instructions["balanced"]
    )

    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=history,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT + "\n" + style,
                temperature=request.temperature,
                max_output_tokens=4096
            )
        )

        answer = response.text

        if not answer:
            raise HTTPException(
                502,
                "Gemini returned an empty response."
            )

        return {
            "reply": answer,
            "source": "gemini",
            "model": MODEL
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Gemini error:", str(e))
        raise HTTPException(
            502,
            "Unable to generate a response. Please try again."
        )


app.mount(
    "/static",
    StaticFiles(directory="static"),
    name="static"
)
