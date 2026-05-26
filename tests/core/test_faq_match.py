from unittest.mock import MagicMock, patch

from src.core.faq_match import FALLBACK_MARKER, faq_generate, rewrite_query, try_faq_match


class TestRewriteQuery:
    @patch("src.core.faq_match.get_llm")
    def test_rewrite_returns_cleaned_text(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_resp = MagicMock()
        mock_resp.content = "毕业设计开题报告提交时间"
        mock_llm.invoke.return_value = mock_resp
        mock_get_llm.return_value = mock_llm

        result = rewrite_query("开题啥时候交")
        assert result == "毕业设计开题报告提交时间"
        mock_get_llm.assert_called_once_with(fast=True, streaming=False)

    @patch("src.core.faq_match.get_llm")
    def test_rewrite_fallback_on_error(self, mock_get_llm):
        mock_get_llm.side_effect = Exception("LLM down")
        result = rewrite_query("开题啥时候交")
        assert result == "开题啥时候交"

    @patch("src.core.faq_match.get_llm")
    def test_rewrite_fallback_on_empty_response(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_resp = MagicMock()
        mock_resp.content = "   "
        mock_llm.invoke.return_value = mock_resp
        mock_get_llm.return_value = mock_llm

        result = rewrite_query("开题啥时候交")
        assert result == "开题啥时候交"


class TestTryFaqMatch:
    def _make_ds(self, faq_row=None):
        ds = MagicMock()
        ds.get_faq.return_value = faq_row
        return ds

    def _make_vs(self, hits=None):
        vs = MagicMock()
        vs.search.return_value = hits or []
        return vs

    @patch("src.core.faq_match.get_embed_model")
    @patch("src.core.faq_match.rewrite_query", return_value="rewritten query")
    def test_match_returns_results(self, mock_rewrite, mock_embed):
        mock_model = MagicMock()
        mock_model.get_text_embedding.return_value = [0.1] * 1024
        mock_embed.return_value = mock_model

        faq_row = {
            "id": 1,
            "question": "开题报告什么时候交？",
            "answer": "第一周",
            "enabled": 1,
            "status": "approved",
        }
        vs = self._make_vs(hits=[{"faq_id": 1, "score": 0.85}])
        ds = self._make_ds(faq_row=faq_row)

        results = try_faq_match("开题什么时候", "kb1", vs, ds, score_threshold=0.75)
        assert results is not None
        assert len(results) == 1
        assert results[0]["score"] == 0.85
        assert results[0]["faq_id"] == 1

    @patch("src.core.faq_match.get_embed_model")
    @patch("src.core.faq_match.rewrite_query", return_value="query")
    def test_match_returns_none_when_no_hits(self, mock_rewrite, mock_embed):
        mock_model = MagicMock()
        mock_model.get_text_embedding.return_value = [0.1] * 1024
        mock_embed.return_value = mock_model

        vs = self._make_vs(hits=[])
        ds = self._make_ds()

        result = try_faq_match("random", "kb1", vs, ds)
        assert result is None

    @patch("src.core.faq_match.get_embed_model")
    @patch("src.core.faq_match.rewrite_query", return_value="query")
    def test_match_skips_disabled_faqs(self, mock_rewrite, mock_embed):
        mock_model = MagicMock()
        mock_model.get_text_embedding.return_value = [0.1] * 1024
        mock_embed.return_value = mock_model

        disabled_faq = {"id": 2, "question": "Q", "answer": "A", "enabled": 0, "status": "approved"}
        vs = self._make_vs(hits=[{"faq_id": 2, "score": 0.9}])
        ds = self._make_ds(faq_row=disabled_faq)

        result = try_faq_match("query", "kb1", vs, ds)
        assert result is None

    @patch("src.core.faq_match.get_embed_model")
    @patch("src.core.faq_match.rewrite_query", return_value="query")
    def test_match_skips_non_approved_faqs(self, mock_rewrite, mock_embed):
        mock_model = MagicMock()
        mock_model.get_text_embedding.return_value = [0.1] * 1024
        mock_embed.return_value = mock_model

        draft_faq = {"id": 3, "question": "Q", "answer": "A", "enabled": 1, "status": "draft"}
        vs = self._make_vs(hits=[{"faq_id": 3, "score": 0.9}])
        ds = self._make_ds(faq_row=draft_faq)

        result = try_faq_match("query", "kb1", vs, ds)
        assert result is None

    @patch("src.core.faq_match.get_embed_model")
    @patch("src.core.faq_match.rewrite_query", return_value="query")
    def test_match_deduplicates_faq_ids(self, mock_rewrite, mock_embed):
        mock_model = MagicMock()
        mock_model.get_text_embedding.return_value = [0.1] * 1024
        mock_embed.return_value = mock_model

        faq_row = {"id": 1, "question": "Q", "answer": "A", "enabled": 1, "status": "approved"}
        vs = self._make_vs(
            hits=[
                {"faq_id": 1, "score": 0.9},
                {"faq_id": 1, "score": 0.85},  # duplicate
            ]
        )
        ds = self._make_ds(faq_row=faq_row)

        results = try_faq_match("query", "kb1", vs, ds)
        assert len(results) == 1

    @patch("src.core.faq_match.get_embed_model")
    @patch("src.core.faq_match.rewrite_query", return_value="query")
    def test_match_returns_none_on_embed_error(self, mock_rewrite, mock_embed):
        mock_embed.side_effect = Exception("Embed down")
        vs = self._make_vs()
        ds = self._make_ds()
        result = try_faq_match("query", "kb1", vs, ds)
        assert result is None


class TestFaqGenerate:
    @patch("src.core.faq_match.get_llm")
    def test_generate_returns_answer(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_resp = MagicMock()
        mock_resp.content = "开题报告在第一周提交。"
        mock_llm.invoke.return_value = mock_resp
        mock_get_llm.return_value = mock_llm

        faq_results = [{"question": "Q?", "answer": "A.", "score": 0.9, "faq_id": 1}]
        result = faq_generate("开题什么时候", faq_results)
        assert result == "开题报告在第一周提交。"

    @patch("src.core.faq_match.get_llm")
    def test_generate_returns_none_on_fallback(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_resp = MagicMock()
        mock_resp.content = f"不够详细 {FALLBACK_MARKER}"
        mock_llm.invoke.return_value = mock_resp
        mock_get_llm.return_value = mock_llm

        faq_results = [{"question": "Q?", "answer": "A.", "score": 0.8, "faq_id": 1}]
        result = faq_generate("complex question", faq_results)
        assert result is None

    @patch("src.core.faq_match.get_llm")
    def test_generate_returns_none_on_llm_error(self, mock_get_llm):
        mock_get_llm.side_effect = Exception("LLM down")
        faq_results = [{"question": "Q?", "answer": "A.", "score": 0.9, "faq_id": 1}]
        result = faq_generate("query", faq_results)
        assert result is None
