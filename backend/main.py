import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

from api.analyze import router as analyze_router
from api.chat import router as chat_router



app = FastAPI(
    title="DocTrace API",
    description="Rule-based document extraction and evidence tracing",
    version="1.0.0"
)


# Allow the React frontend to communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    *([os.environ["FRONTEND_ORIGIN"]] if os.getenv("FRONTEND_ORIGIN") else []),
],
    allow_origin_regex=r"https://[a-zA-Z0-9-]+\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Register API routes
app.include_router(analyze_router)
app.include_router(chat_router)

@app.get("/")
def home():
    return {
        "message": "DocTrace Backend is running",
        "status": "ok"
    }
