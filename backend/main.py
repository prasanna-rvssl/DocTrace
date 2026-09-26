from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.analyze import router as analyze_router
from api.chat import router as chat_router



app = FastAPI(
    title="DocTrace API",
    description="AI-powered document intelligence and evidence tracing",
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
],
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