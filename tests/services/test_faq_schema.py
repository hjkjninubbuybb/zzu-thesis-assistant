"""Smoke tests for FAQ search schemas."""

from datetime import datetime

import pytest

from src.api.schemas.faq import FAQSearchItem, FAQSearchResponse


def _base_faq_kwargs():
    return dict(
        id=1,
        kb_name="kb1",
        question="q",
        answer="a",
        category="",
        sort_order=0,
        enabled=True,
        status="approved",
        author_id=None,
        created_at=datetime(2024, 1, 1),
        updated_at=datetime(2024, 1, 1),
    )


def test_faq_search_item_has_score_field():
    item = FAQSearchItem(**_base_faq_kwargs(), score=0.85)
    assert item.score == pytest.approx(0.85)


def test_faq_search_item_score_nullable():
    item = FAQSearchItem(**_base_faq_kwargs(), score=None)
    assert item.score is None


def test_faq_search_response_has_no_rewritten_query():
    item = FAQSearchItem(**_base_faq_kwargs(), score=0.5)
    resp = FAQSearchResponse(items=[item])
    assert not hasattr(resp, "rewritten_query")
    assert len(resp.items) == 1
