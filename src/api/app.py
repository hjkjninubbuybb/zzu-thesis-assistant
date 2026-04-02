"""FastAPI 应用入口。"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import knowledge, document, chat

app = FastAPI(title="RAG 1.0 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(knowledge.router)
app.include_router(document.router)
app.include_router(chat.router)


@app.get("/health")
def health():
    return {"status": "ok"}
