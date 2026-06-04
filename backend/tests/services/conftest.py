from unittest.mock import MagicMock

import pytest

from src.storage.interfaces.conversation_store import BaseConversationStore
from src.storage.interfaces.faq_store import BaseFAQStore
from src.storage.interfaces.kb_store import BaseKBStore
from src.storage.interfaces.ticket_store import BaseTicketStore
from src.storage.interfaces.user_store import BaseUserStore


@pytest.fixture
def mock_kb_store():
    return MagicMock(spec=BaseKBStore)


@pytest.fixture
def mock_conv_store():
    return MagicMock(spec=BaseConversationStore)


@pytest.fixture
def mock_faq_store():
    return MagicMock(spec=BaseFAQStore)


@pytest.fixture
def mock_ticket_store():
    return MagicMock(spec=BaseTicketStore)


@pytest.fixture
def mock_user_store():
    return MagicMock(spec=BaseUserStore)


@pytest.fixture
def mock_vector_store():
    return MagicMock()


@pytest.fixture
def mock_settings_store():
    return MagicMock()
