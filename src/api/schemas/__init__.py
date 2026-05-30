"""API 请求/响应模型包。所有子模块的导出统一在此汇总，保持向后兼容。"""

from src.api.schemas.auth import (
    ChangePasswordRequest,
    LoginResponse,
    RefreshTokenRequest,
    ResetPasswordRequest,
)
from src.api.schemas.chat import (
    ChatRequest,
    ConversationCreate,
    ConversationCursor,
    ConversationInfo,
    ConversationMessageOut,
    ConversationTitleUpdate,
    FeedbackRequest,
    HistoryMessage,
    PaginatedConversations,
    SaveMessageRequest,
)
from src.api.schemas.common import MessageResponse
from src.api.schemas.document import (
    ChunkPreview,
    ChunkPreviewResult,
    CleanResult,
    ConfirmCleanRequest,
    ConfirmIndexResult,
    DocDetail,
    DocInfo,
    DocUpdate,
    IndexRequest,
    ReviewDetail,
)
from src.api.schemas.faq import (
    FAQCreate,
    FAQImportError,
    FAQImportResult,
    FAQItem,
    FAQSearchItem,
    FAQSearchResponse,
    FAQUpdate,
)
from src.api.schemas.knowledge import (
    ActiveKBResponse,
    KBCreate,
    KBInfo,
    KBSplitterUpdate,
    SetActiveKBRequest,
)
from src.api.schemas.ticket import QARequestCreate, QARequestInfo, QARequestReply
from src.api.schemas.user import (
    MentorRelationRequest,
    PaginatedUsers,
    StudentProfileCreate,
    TeacherProfileCreate,
    UpdateProfileRequest,
    UserCreate,
    UserInfo,
    UserUpdate,
)

__all__ = [
    # knowledge
    "ActiveKBResponse",
    # auth
    "ChangePasswordRequest",
    # chat / conversation
    "ChatRequest",
    # document
    "ChunkPreview",
    "ChunkPreviewResult",
    "CleanResult",
    "ConfirmCleanRequest",
    "ConfirmIndexResult",
    "ConversationCreate",
    "ConversationCursor",
    "ConversationInfo",
    "ConversationMessageOut",
    "ConversationTitleUpdate",
    "DocDetail",
    "DocInfo",
    "DocUpdate",
    # faq
    "FAQCreate",
    "FAQImportError",
    "FAQImportResult",
    "FAQItem",
    "FAQSearchItem",
    "FAQSearchResponse",
    "FAQUpdate",
    "FeedbackRequest",
    "HistoryMessage",
    "IndexRequest",
    "KBCreate",
    "KBInfo",
    "KBSplitterUpdate",
    "LoginResponse",
    # user
    "MentorRelationRequest",
    # common
    "MessageResponse",
    "PaginatedConversations",
    "PaginatedUsers",
    # ticket
    "QARequestCreate",
    "QARequestInfo",
    "QARequestReply",
    "RefreshTokenRequest",
    "ResetPasswordRequest",
    "ReviewDetail",
    "SaveMessageRequest",
    "SetActiveKBRequest",
    "StudentProfileCreate",
    "TeacherProfileCreate",
    "UpdateProfileRequest",
    "UserCreate",
    "UserInfo",
    "UserUpdate",
]
