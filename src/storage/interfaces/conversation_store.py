"""ConversationStore Protocol 接口。"""

from typing import Protocol


class BaseConversationStore(Protocol):
    """对话与消息数据访问接口。"""

    def create_conversation(
        self,
        kb_name: str,
        title: str = "新对话",
        user_id: int | None = None,
    ) -> dict:
        """新建对话，返回新建行 dict。"""
        ...

    def list_conversations(
        self,
        kb_name: str | None = None,
        user_id: int | None = None,
        limit: int = 30,
        cursor_id: int | None = None,
        cursor_updated_at: str | None = None,
    ) -> dict:
        """游标分页列出对话。

        Returns:
            {'items': [...], 'has_more': bool, 'next_cursor': dict | None}
        """
        ...

    def get_conversation(self, conv_id: int) -> dict | None:
        """按 ID 查询对话，不存在返回 None。"""
        ...

    def update_conversation_title(self, conv_id: int, title: str) -> dict | None:
        """更新对话标题，返回更新后的行或 None。"""
        ...

    def delete_conversation(self, conv_id: int) -> None:
        """删除对话及其消息。"""
        ...

    def add_message(
        self,
        conversation_id: int,
        role: str,
        content: str,
        sources: list | None = None,
        files: list | None = None,
    ) -> dict:
        """追加消息，返回新建行 dict。"""
        ...

    def list_messages(self, conversation_id: int) -> list[dict]:
        """列出对话下所有消息（按时间升序）。"""
        ...

    def get_message_feedback(self, message_id: int) -> dict | None:
        """查询消息的反馈评分，不存在返回 None。"""
        ...

    def set_message_feedback(self, message_id: int, rating: str) -> dict:
        """设置消息的反馈评分，返回反馈行 dict。"""
        ...
