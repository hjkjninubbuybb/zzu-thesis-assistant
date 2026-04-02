"""Gradio 管理端界面：知识库管理 / 文档管理 / 对话问答。"""

import json
import logging

import gradio as gr
import httpx

logger = logging.getLogger(__name__)

API_BASE = "http://localhost:8000"


# ═══════════════════════════════════════════════════════════
# 工具函数
# ═══════════════════════════════════════════════════════════

def _get(path: str, **kwargs):
    r = httpx.get(f"{API_BASE}{path}", timeout=60, **kwargs)
    r.raise_for_status()
    return r.json()


def _post(path: str, **kwargs):
    r = httpx.post(f"{API_BASE}{path}", timeout=300, **kwargs)
    r.raise_for_status()
    return r.json()


def _delete(path: str):
    r = httpx.delete(f"{API_BASE}{path}", timeout=30)
    r.raise_for_status()
    return r.json()


def _http_detail(e: httpx.HTTPStatusError) -> str:
    try:
        return e.response.json().get("detail", str(e))
    except Exception:
        return e.response.text or str(e)


def _kb_choices() -> list[str]:
    try:
        kbs = _get("/api/knowledge")
        return [kb["name"] for kb in kbs]
    except Exception:
        return []


# ═══════════════════════════════════════════════════════════
# Tab 1: 知识库管理
# ═══════════════════════════════════════════════════════════

def kb_list_table():
    try:
        kbs = _get("/api/knowledge")
        rows = [[kb["name"], kb["description"], kb["doc_count"], kb["created_at"]] for kb in kbs]
        return rows
    except Exception as e:
        return []


def kb_create(name: str, description: str):
    name = name.strip()
    if not name:
        return gr.Warning("知识库名称不能为空"), kb_list_table()
    try:
        _post("/api/knowledge", json={"name": name, "description": description})
        return f"✅ 知识库 '{name}' 创建成功", kb_list_table()
    except httpx.HTTPStatusError as e:
        detail = _http_detail(e)
        return f"❌ {detail}", kb_list_table()


def kb_delete(name: str):
    name = name.strip()
    if not name:
        return "❌ 请输入知识库名称", kb_list_table()
    try:
        _delete(f"/api/knowledge/{name}")
        return f"✅ 知识库 '{name}' 已删除", kb_list_table()
    except httpx.HTTPStatusError as e:
        detail = _http_detail(e)
        return f"❌ {detail}", kb_list_table()


def build_kb_tab():
    with gr.Tab("📚 知识库管理"):
        gr.Markdown("### 知识库列表")
        kb_table = gr.Dataframe(
            headers=["名称", "描述", "文档数", "创建时间"],
            datatype=["str", "str", "number", "str"],
            interactive=False,
            wrap=True,
        )
        refresh_btn = gr.Button("🔄 刷新", variant="secondary", size="sm")

        gr.Markdown("### 创建知识库")
        with gr.Row():
            kb_name_input = gr.Textbox(label="名称", placeholder="仅支持字母/数字/下划线/中文")
            kb_desc_input = gr.Textbox(label="描述（可选）")
        create_btn = gr.Button("➕ 创建", variant="primary")

        gr.Markdown("### 删除知识库")
        with gr.Row():
            kb_del_input = gr.Textbox(label="知识库名称")
            del_btn = gr.Button("🗑️ 删除", variant="stop")

        status_box = gr.Textbox(label="操作状态", interactive=False)

        # 事件绑定
        refresh_btn.click(kb_list_table, outputs=kb_table)
        create_btn.click(kb_create, inputs=[kb_name_input, kb_desc_input], outputs=[status_box, kb_table])
        del_btn.click(kb_delete, inputs=kb_del_input, outputs=[status_box, kb_table])

    return kb_table


# ═══════════════════════════════════════════════════════════
# Tab 2: 文档管理
# ═══════════════════════════════════════════════════════════

def doc_list_table(kb_name: str):
    if not kb_name:
        return []
    try:
        docs = _get(f"/api/document/{kb_name}")
        return [
            [d["id"], d["file_name"], f"{d['file_size']//1024} KB", d["chunk_count"], d["chunk_size"], d["created_at"]]
            for d in docs
        ]
    except Exception:
        return []


def doc_upload(kb_name: str, file, splitter_type: str, chunk_size: int, chunk_overlap_ratio: float, enable_cleaning: bool):
    if not kb_name:
        return "❌ 请先选择知识库", doc_list_table(kb_name)
    if file is None:
        return "❌ 请选择要上传的文件", doc_list_table(kb_name)

    try:
        with open(file, "rb") as f:
            files = {"file": (file.split("/")[-1].split("\\")[-1], f)}
            data = {
                "splitter_type": splitter_type,
                "chunk_size": str(chunk_size),
                "chunk_overlap_ratio": str(chunk_overlap_ratio),
                "enable_cleaning": str(enable_cleaning).lower(),
            }
            r = httpx.post(
                f"{API_BASE}/api/document/{kb_name}/upload",
                files=files,
                data=data,
                timeout=600,
            )
            r.raise_for_status()
            doc = r.json()
            return f"✅ 上传成功：{doc['file_name']}，共 {doc['chunk_count']} 个 chunks", doc_list_table(kb_name)
    except httpx.HTTPStatusError as e:
        detail = _http_detail(e)
        return f"❌ {detail}", doc_list_table(kb_name)
    except Exception as e:
        return f"❌ {str(e)}", doc_list_table(kb_name)


def doc_delete(kb_name: str, doc_id_str: str):
    if not kb_name or not doc_id_str.strip():
        return "❌ 请填写知识库名称和文档 ID", doc_list_table(kb_name)
    try:
        doc_id = int(doc_id_str.strip())
        result = _delete(f"/api/document/{kb_name}/{doc_id}")
        return f"✅ {result['message']}", doc_list_table(kb_name)
    except httpx.HTTPStatusError as e:
        detail = _http_detail(e)
        return f"❌ {detail}", doc_list_table(kb_name)
    except ValueError:
        return "❌ 文档 ID 必须是数字", doc_list_table(kb_name)


def build_doc_tab():
    with gr.Tab("📄 文档管理"):
        with gr.Row():
            doc_kb_dropdown = gr.Dropdown(
                label="选择知识库",
                choices=_kb_choices(),
                interactive=True,
            )
            doc_refresh_kb_btn = gr.Button("🔄", size="sm")

        doc_table = gr.Dataframe(
            headers=["ID", "文件名", "大小", "Chunks数", "Chunk大小", "上传时间"],
            datatype=["number", "str", "str", "number", "number", "str"],
            interactive=False,
            wrap=True,
        )
        doc_list_btn = gr.Button("🔄 刷新文档列表", variant="secondary", size="sm")

        gr.Markdown("### 上传文档")
        with gr.Row():
            upload_file = gr.File(
                label="选择文件（.txt / .md / .pdf）",
                file_types=[".txt", ".md", ".pdf"],
            )
            with gr.Column():
                splitter_type = gr.Dropdown(
                    label="切分策略",
                    choices=["recursive", "token", "sentence"],
                    value="recursive",
                )
                chunk_size = gr.Slider(64, 1024, value=256, step=64, label="Chunk 大小")
                chunk_overlap = gr.Slider(0.0, 0.5, value=0.2, step=0.05, label="Overlap 比例")
                enable_cleaning = gr.Checkbox(label="启用 LLM 清洗（较慢）", value=True)
        upload_btn = gr.Button("⬆️ 上传并入库", variant="primary")

        gr.Markdown("### 删除文档")
        with gr.Row():
            doc_id_input = gr.Textbox(label="文档 ID（见上表）", placeholder="输入 ID 数字")
            doc_del_btn = gr.Button("🗑️ 删除", variant="stop")

        doc_status = gr.Textbox(label="操作状态", interactive=False)

        # 事件绑定
        doc_refresh_kb_btn.click(lambda: gr.Dropdown(choices=_kb_choices()), outputs=doc_kb_dropdown)
        doc_list_btn.click(doc_list_table, inputs=doc_kb_dropdown, outputs=doc_table)
        doc_kb_dropdown.change(doc_list_table, inputs=doc_kb_dropdown, outputs=doc_table)
        upload_btn.click(
            doc_upload,
            inputs=[doc_kb_dropdown, upload_file, splitter_type, chunk_size, chunk_overlap, enable_cleaning],
            outputs=[doc_status, doc_table],
        )
        doc_del_btn.click(
            doc_delete,
            inputs=[doc_kb_dropdown, doc_id_input],
            outputs=[doc_status, doc_table],
        )


# ═══════════════════════════════════════════════════════════
# Tab 3: 对话问答
# ═══════════════════════════════════════════════════════════

def chat_query(kb_name: str, query: str, max_reformulations: int, history: list):
    if not kb_name:
        yield history, "❌ 请先选择知识库", ""
        return
    if not query.strip():
        yield history, "❌ 请输入问题", ""
        return

    history = history or []
    history.append({"role": "user", "content": query})
    yield history, "⏳ 检索中...", ""

    answer_text = ""
    sources_text = ""

    try:
        with httpx.stream(
            "POST",
            f"{API_BASE}/api/chat",
            json={
                "kb_name": kb_name,
                "query": query,
                "max_reformulations": max_reformulations,
            },
            timeout=120,
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                if line.startswith("event:"):
                    event_type = line[6:].strip()
                elif line.startswith("data:"):
                    data_str = line[5:].strip()
                    try:
                        data = json.loads(data_str)
                    except Exception:
                        continue

                    if event_type == "answer":
                        answer_text = data.get("text", "")
                        history.append({"role": "assistant", "content": answer_text})
                        yield history, "⏳ 获取引用来源...", ""
                    elif event_type == "sources":
                        sources = data.get("sources", [])
                        if sources:
                            parts = []
                            for i, s in enumerate(sources, 1):
                                parts.append(
                                    f"**[来源{i}]** `{s['source_file']}` (score: {s['score']})\n"
                                    f"> {s['text'][:200]}..."
                                )
                            sources_text = "\n\n".join(parts)
                        yield history, "✅ 完成", sources_text
                    elif event_type == "error":
                        err = data.get("message", "未知错误")
                        yield history, f"❌ {err}", ""
                        return
    except Exception as e:
        yield history, f"❌ {str(e)}", ""


def build_chat_tab():
    with gr.Tab("💬 对话问答"):
        with gr.Row():
            chat_kb_dropdown = gr.Dropdown(
                label="选择知识库",
                choices=_kb_choices(),
                interactive=True,
            )
            chat_refresh_kb_btn = gr.Button("🔄", size="sm")
            max_reformulations = gr.Slider(0, 5, value=2, step=1, label="最大查询改写次数")

        chatbot = gr.Chatbot(
            label="对话",
            height=500,
            buttons=["copy", "copy_all"],
        )

        with gr.Row():
            query_input = gr.Textbox(
                label="输入问题",
                placeholder="请输入您的问题...",
                scale=5,
            )
            send_btn = gr.Button("发送", variant="primary", scale=1)

        chat_status = gr.Textbox(label="状态", interactive=False, max_lines=1)
        sources_md = gr.Markdown(label="引用来源")
        clear_btn = gr.Button("🗑️ 清空对话", variant="secondary", size="sm")

        # 事件绑定
        chat_refresh_kb_btn.click(lambda: gr.Dropdown(choices=_kb_choices()), outputs=chat_kb_dropdown)

        send_btn.click(
            chat_query,
            inputs=[chat_kb_dropdown, query_input, max_reformulations, chatbot],
            outputs=[chatbot, chat_status, sources_md],
        )
        query_input.submit(
            chat_query,
            inputs=[chat_kb_dropdown, query_input, max_reformulations, chatbot],
            outputs=[chatbot, chat_status, sources_md],
        )
        clear_btn.click(lambda: ([], "", ""), outputs=[chatbot, chat_status, sources_md])


# ═══════════════════════════════════════════════════════════
# 构建完整应用
# ═══════════════════════════════════════════════════════════

def build_app() -> gr.Blocks:
    with gr.Blocks(title="RAG 1.0 管理端") as demo:
        gr.Markdown("# RAG 1.0 知识库管理系统")

        with gr.Tabs():
            build_kb_tab()
            build_doc_tab()
            build_chat_tab()

    return demo
