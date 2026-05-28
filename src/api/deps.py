"""统一依赖注入工厂函数。

所有 Service 的创建都在这里。换实现时只改这一个文件。
FastAPI 在同一请求内自动缓存相同依赖，不会重复构造 Store。
"""

from fastapi import Depends

from src.services.analytics_service import AnalyticsService
from src.services.chat_service import ChatService
from src.services.config_service import ConfigService
from src.services.document_service import DocumentService
from src.services.faq_service import FAQService
from src.services.knowledge_service import KnowledgeService
from src.services.ticket_service import TicketService
from src.services.user_service import UserService
from src.storage.conversation_store import ConversationStore
from src.storage.doc_store import DocStore
from src.storage.document_store import DocumentStore
from src.storage.faq_store import FAQStore
from src.storage.kb_store import KBStore
from src.storage.settings_store import SettingsStore
from src.storage.ticket_store import TicketStore
from src.storage.user_store import UserStore
from src.storage.vector_store import VectorStore

# ── Store 工厂 ──────────────────────────────────────────────


def get_kb_store() -> KBStore:
    return KBStore()


def get_doc_store() -> DocStore:
    return DocStore()


def get_faq_store() -> FAQStore:
    return FAQStore()


def get_settings_store() -> SettingsStore:
    return SettingsStore()


def get_ticket_store() -> TicketStore:
    return TicketStore()


def get_conversation_store() -> ConversationStore:
    return ConversationStore()


def get_user_store() -> UserStore:
    return UserStore()


def get_vector_store() -> VectorStore:
    return VectorStore()


def get_document_store() -> DocumentStore:
    return DocumentStore()


# ── Service 工厂 ──────────────────────────────────────────────


def get_analytics_service() -> AnalyticsService:
    return AnalyticsService()


def get_chat_service(
    settings_store: SettingsStore = Depends(get_settings_store),
    kb_store: KBStore = Depends(get_kb_store),
    vector_store: VectorStore = Depends(get_vector_store),
    doc_store: DocumentStore = Depends(get_document_store),
) -> ChatService:
    return ChatService(
        settings_store=settings_store,
        kb_store=kb_store,
        vector_store=vector_store,
        doc_store=doc_store,
    )


def get_config_service(
    settings_store: SettingsStore = Depends(get_settings_store),
) -> ConfigService:
    return ConfigService(settings_store=settings_store)


def get_faq_service(
    faq_store: FAQStore = Depends(get_faq_store),
    kb_store: KBStore = Depends(get_kb_store),
    vector_store: VectorStore = Depends(get_vector_store),
) -> FAQService:
    return FAQService(faq_store=faq_store, kb_store=kb_store, vector_store=vector_store)


def get_knowledge_service(
    kb_store: KBStore = Depends(get_kb_store),
    settings_store: SettingsStore = Depends(get_settings_store),
    vector_store: VectorStore = Depends(get_vector_store),
) -> KnowledgeService:
    return KnowledgeService(
        kb_store=kb_store,
        settings_store=settings_store,
        vector_store=vector_store,
    )


def get_ticket_service(
    ticket_store: TicketStore = Depends(get_ticket_store),
    user_store: UserStore = Depends(get_user_store),
) -> TicketService:
    return TicketService(ticket_store=ticket_store, user_store=user_store)


def get_user_service(
    user_store: UserStore = Depends(get_user_store),
) -> UserService:
    return UserService(user_store=user_store)


def get_document_service(
    doc_store: DocStore = Depends(get_doc_store),
    kb_store: KBStore = Depends(get_kb_store),
    vector_store: VectorStore = Depends(get_vector_store),
) -> DocumentService:
    return DocumentService(doc_store=doc_store, kb_store=kb_store, vector_store=vector_store)
