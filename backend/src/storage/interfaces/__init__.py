"""Store Protocol 接口定义。

新代码通过依赖注入使用这些接口，不直接 import 具体实现类。
"""

from src.storage.interfaces.conversation_store import BaseConversationStore
from src.storage.interfaces.doc_store import BaseDocStore
from src.storage.interfaces.faq_store import BaseFAQStore
from src.storage.interfaces.kb_store import BaseKBStore
from src.storage.interfaces.settings_store import BaseSettingsStore
from src.storage.interfaces.ticket_store import BaseTicketStore
from src.storage.interfaces.user_store import BaseUserStore

__all__ = [
    "BaseConversationStore",
    "BaseDocStore",
    "BaseFAQStore",
    "BaseKBStore",
    "BaseSettingsStore",
    "BaseTicketStore",
    "BaseUserStore",
]
