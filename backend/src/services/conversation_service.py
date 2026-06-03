"""对话管理业务逻辑服务层。

职责：封装对话/消息 CRUD 及自动标题生成业务逻辑。
本模块不包含任何 FastAPI / HTTP 相关导入。
"""

import json
import logging

from src.core.shared.llm_factory import get_llm
from src.exceptions import AppException
from src.services.base import BaseService
from src.storage.interfaces.conversation_store import BaseConversationStore
from src.storage.interfaces.kb_store import BaseKBStore

logger = logging.getLogger(__name__)

_TITLE_SYSTEM_PROMPT = """你是一个对话标题生成助手。你的任务是根据用户的第一轮提问和助手的回答，生成一个简短、精准、有辨识度的中文标题。

要求：
1. 标题 6-14 个汉字，概括核心话题，不要出现"关于"、"如何"、"问题"等冗余词
2. 必须是陈述性名词短语，不能是完整句子，不能带标点符号
3. 如果用户问题涉及具体文档/表格/流程/截止时间/学院/专业等关键信息，优先保留这些关键词
4. 如果首轮只是寒暄（如"你好"、"在吗"），返回"闲聊"两个字
5. 直接输出标题本身，不要加任何解释、引号、前后缀"""


class KnowledgeBaseNotFoundError(AppException):
    """对话创建时目标知识库不存在。"""

    http_status = 404


class ConversationNotFoundError(AppException):
    """对话不存在。"""

    http_status = 404


class ConversationService(BaseService):
    """对话/消息 CRUD 及标题生成服务。"""

    def __init__(self, conv_store: BaseConversationStore, kb_store: BaseKBStore) -> None:
        super().__init__()
        self._conv_store = conv_store
        self._kb_store = kb_store

    # ── 对话 CRUD ─────────────────────────────────────────────

    def create_conversation(self, kb_name: str, title: str, user_id: int | None) -> dict:
        """创建新对话。

        Args:
            kb_name: 知识库名称。
            title: 对话标题。
            user_id: 创建者用户 ID。

        Returns:
            新对话 dict。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
        """
        if not self._kb_store.get_kb(kb_name):
            raise KnowledgeBaseNotFoundError(f"知识库 '{kb_name}' 不存在")
        return self._conv_store.create_conversation(kb_name, title, user_id)

    def list_conversations(
        self,
        kb_name: str | None,
        user_id: int | None,
        limit: int,
        cursor_id: int | None,
        cursor_updated_at: str | None,
    ) -> dict:
        """游标分页列出对话。

        Args:
            kb_name: 知识库过滤（None 表示不过滤）。
            user_id: 用户过滤（None 表示不过滤）。
            limit: 每页条数。
            cursor_id: 游标 ID。
            cursor_updated_at: 游标更新时间。

        Returns:
            {'items': [...], 'has_more': bool, 'next_cursor': dict | None}
        """
        return self._conv_store.list_conversations(
            kb_name=kb_name,
            user_id=user_id,
            limit=limit,
            cursor_id=cursor_id,
            cursor_updated_at=cursor_updated_at,
        )

    def get_conversation(self, conv_id: int) -> dict:
        """获取对话，不存在则抛出异常。

        Args:
            conv_id: 对话 ID。

        Returns:
            对话 dict。

        Raises:
            ConversationNotFoundError: 对话不存在。
        """
        conv = self._conv_store.get_conversation(conv_id)
        if not conv:
            raise ConversationNotFoundError("对话不存在")
        return conv

    def update_title(self, conv_id: int, title: str) -> dict:
        """更新对话标题。

        Args:
            conv_id: 对话 ID。
            title: 新标题。

        Returns:
            更新后的对话 dict。

        Raises:
            ConversationNotFoundError: 对话不存在。
        """
        row = self._conv_store.update_conversation_title(conv_id, title)
        if not row:
            raise ConversationNotFoundError("对话不存在")
        return row

    def delete_conversation(self, conv_id: int) -> None:
        """删除对话及其所有消息。

        Args:
            conv_id: 对话 ID。

        Raises:
            ConversationNotFoundError: 对话不存在。
        """
        if not self._conv_store.get_conversation(conv_id):
            raise ConversationNotFoundError("对话不存在")
        self._conv_store.delete_conversation(conv_id)

    # ── 消息 ──────────────────────────────────────────────────

    def list_messages(self, conv_id: int) -> list[dict]:
        """列出对话下所有消息（含反馈评分）。

        Args:
            conv_id: 对话 ID。

        Returns:
            消息列表，每条消息含 feedback 字段。
        """
        messages = self._conv_store.list_messages(conv_id)
        for msg in messages:
            fb = self._conv_store.get_message_feedback(msg["id"])
            msg["feedback"] = fb["rating"] if fb else None
        return messages

    def add_message(
        self,
        conv_id: int,
        role: str,
        content: str,
        sources: list | None,
        files: list | None,
    ) -> dict:
        """向对话追加一条消息。

        Args:
            conv_id: 对话 ID。
            role: 消息角色（user / assistant）。
            content: 消息内容。
            sources: 来源片段列表。
            files: 文件列表。

        Returns:
            新消息 dict（sources/files 为反序列化后的 list）。
        """
        sources_json = json.dumps(sources, ensure_ascii=False) if sources else None
        files_json = json.dumps(files, ensure_ascii=False) if files else None
        row = self._conv_store.add_message(conv_id, role, content, sources_json, files_json)
        row["sources"] = sources
        row["files"] = files
        row["feedback"] = None
        return row

    def set_feedback(self, message_id: int, rating: str) -> dict:
        """设置消息反馈评分。

        Args:
            message_id: 消息 ID。
            rating: 评分（thumbs_up / thumbs_down）。

        Returns:
            反馈行 dict。
        """
        return self._conv_store.set_message_feedback(message_id, rating)

    # ── 标题自动生成 ──────────────────────────────────────────

    def generate_title(self, conv_id: int) -> dict:
        """基于首轮对话自动生成语义化标题（快速 LLM）。

        Args:
            conv_id: 对话 ID。

        Returns:
            更新后的对话 dict。

        Raises:
            ConversationNotFoundError: 对话不存在或无用户消息。
        """
        conv = self._conv_store.get_conversation(conv_id)
        if not conv:
            raise ConversationNotFoundError("对话不存在")
        messages = self._conv_store.list_messages(conv_id)
        if not messages:
            raise ConversationNotFoundError("对话尚无消息，无法总结标题")
        first_user = next((m for m in messages if m["role"] == "user"), None)
        if not first_user:
            raise ConversationNotFoundError("对话缺少用户提问")
        first_asst = next((m for m in messages if m["role"] == "assistant"), None)
        user_text = (first_user["content"] or "").strip()[:500]
        asst_text = ((first_asst["content"] if first_asst else "") or "").strip()[:500]
        title = self._generate_title_text(user_text, asst_text)
        self.logger.info("[ConversationService] conv_id=%d title=%s", conv_id, title)
        row = self._conv_store.update_conversation_title(conv_id, title)
        if not row:
            raise ConversationNotFoundError("对话不存在")
        return row

    def _generate_title_text(self, user_text: str, assistant_text: str) -> str:
        try:
            llm = get_llm(fast=True, streaming=False)
            prompt = (
                f"{_TITLE_SYSTEM_PROMPT}\n\n"
                f"【用户提问】\n{user_text}\n\n"
                f"【助手回答】\n{assistant_text or '（尚无回答）'}\n\n"
                f"请直接输出标题："
            )
            resp = llm.invoke(prompt)
            raw = (getattr(resp, "content", "") or "").strip()
            title = raw.strip('"').strip("'").strip("\u201c").strip("\u201d").strip("。").strip()
            if len(title) > 20:
                title = title[:20]
            return title or user_text[:20] or "新对话"
        except Exception as e:
            self.logger.warning("[ConversationService] 标题生成失败: %s", e)
            return user_text[:20] or "新对话"
