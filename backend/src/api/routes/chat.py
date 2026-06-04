"""对话问答接口（SSE 流式输出）。"""

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from src.api.auth import get_current_user
from src.api.deps import get_chat_service
from src.api.schemas import ChatRequest
from src.exceptions import KnowledgeBaseNotFoundError
from src.services.chat_service import ChatService

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("")
async def chat(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
    chat_service: ChatService = Depends(get_chat_service),
):
    """RAG 对话（SSE 流式）。"""
    try:
        kb_name = chat_service.resolve_kb_name(current_user.get("role", ""))
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=e.http_status, detail=str(e)) from e

    async def event_generator():
        async for event in chat_service.stream_response(
            query=body.query,
            kb_name=kb_name,
            history=body.history or [],
            user_id=current_user["id"],
        ):
            yield {"event": event["event"], "data": event.get("data", "{}")}

    return EventSourceResponse(event_generator())
