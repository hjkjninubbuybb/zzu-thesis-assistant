"""MySQL 文档元数据存储 — 向后兼容聚合门面。

所有方法已拆分到各专用模块：
  - src.storage.kb_store.KBStore
  - src.storage.doc_store.DocStore
  - src.storage.faq_store.FAQStore
  - src.storage.conversation_store.ConversationStore
  - src.storage.ticket_store.TicketStore
  - src.storage.settings_store.SettingsStore

本类保持多继承聚合，确保所有现有 `DocumentStore()` 调用无需修改。
"""

from src.storage.conversation_store import ConversationStore
from src.storage.doc_store import DocStore
from src.storage.faq_store import FAQStore
from src.storage.kb_store import KBStore
from src.storage.settings_store import SettingsStore
from src.storage.ticket_store import TicketStore

__all__ = ["DocumentStore"]


class DocumentStore(KBStore, DocStore, FAQStore, ConversationStore, TicketStore, SettingsStore):
    """向后兼容的存储聚合类。

    聚合 KBStore、DocStore、FAQStore、ConversationStore、TicketStore、SettingsStore
    的全部方法，现有代码无需修改即可继续使用。

    新代码应直接使用各专用 Store 类而非本类。
    """
