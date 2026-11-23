# Kronbot 1.0

Black & white AI chatbot. Gemini API · FastAPI backend · jQuery frontend · deploys on Vercel.

## Run locally
```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn dev:app --reload
```
Open http://localhost:8000 (the key is read from `.env`).

## Deploy to Vercel
1. Push this folder to GitHub (`.env` is git-ignored, so the key is NOT uploaded).
2. Vercel → Add New Project → import the repo.
3. Settings → Environment Variables → add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`).
4. Deploy. Then replace `https://kronbot.vercel.app` in `public/index.html`, `robots.txt` and `sitemap.xml` with your real domain.

## Structure
- `api/index.py` – FastAPI (`/api/chat` streaming, `/api/models`, `/api/health`)
- `public/` – static frontend (`index.html`, `assets/style.css`, `assets/app.js`, favicon, manifest, SEO files)
- `vercel.json` – routes `/api/*` to FastAPI
