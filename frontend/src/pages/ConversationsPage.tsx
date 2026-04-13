import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { useQuery } from '@tanstack/react-query'
import { ArrowUp, Loader2, ChevronDown, ChevronUp, Trash2, AlertCircle, MessageSquare, Download } from 'lucide-react'
import { knowledgeApi, faqApi } from '@/lib/api'
import type { ChatMessage, FileItem, SourceItem } from '@/types/api'

// ── SSE 流式对话 ──────────────────────────────────────────

async function streamChat(
  kb_name: string,
  query: string,
  max_reformulations: number,
  signal: AbortSignal,
  onStatus: (step: string) => void,
  onAnswer: (text: string) => void,
  onSources: (sources: SourceItem[]) => void,
  onError: (msg: string) => void,
  onToken?: (text: string) => void,
  onAgentAction?: (tool: string, input: string) => void,
  onFile?: (file: FileItem) => void,
) {
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kb_name, query, max_reformulations }),
    signal,
  })
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}))
    onError(data.detail ?? `HTTP ${resp.status}`)
    return
  }

  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        const dataStr = line.slice(5).trim()
        if (!dataStr) continue
        try {
          const data = JSON.parse(dataStr)
          if (currentEvent === 'status') onStatus(data.step)
          else if (currentEvent === 'token') onToken?.(data.text)
          else if (currentEvent === 'agent_action') onAgentAction?.(data.tool, data.input ?? '')
          else if (currentEvent === 'answer') onAnswer(data.text)
          else if (currentEvent === 'sources') onSources(data.sources)
          else if (currentEvent === 'file') onFile?.(data as FileItem)
          else if (currentEvent === 'error') onError(data.message)
        } catch { /* 忽略解析错误 */ }
      }
    }
  }
}

// ── 文件卡片 ──────────────────────────────────────────────

const EXT_COLORS: Record<string, string> = {
  pdf: 'bg-red-500',
  docx: 'bg-blue-500',
  doc: 'bg-blue-500',
  xlsx: 'bg-green-600',
  xls: 'bg-green-600',
  pptx: 'bg-orange-500',
  ppt: 'bg-orange-500',
  txt: 'bg-gray-500',
}

function FileCard({ file }: { file: FileItem }) {
  const ext = file.file_name.split('.').pop()?.toLowerCase() ?? ''
  const badgeColor = EXT_COLORS[ext] ?? 'bg-gray-500'
  return (
    <a
      href={file.url}
      download={file.file_name}
      className="flex items-center gap-3 bg-[#F7F5F1] border border-[#E8E4DC] rounded-xl px-3 py-2.5 no-underline hover:bg-[#F0EDE8] transition-colors group"
    >
      <div className={`${badgeColor} text-white text-[10px] font-bold uppercase rounded-md px-1.5 py-1 min-w-[2.2rem] text-center leading-none`}>
        {ext || 'FILE'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{file.file_name}</p>
        <p className="text-xs text-gray-400">{file.size_kb} KB</p>
      </div>
      <Download size={14} className="text-gray-400 group-hover:text-gray-600 shrink-0" />
    </a>
  )
}

// ── 引用来源组件 ──────────────────────────────────────────

function SourcesPanel({ sources }: { sources: SourceItem[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 border-t border-gray-100 pt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        引用来源 ({sources.length})
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {sources.map((s, i) => (
            <div key={s.node_id} className="bg-gray-50 rounded-md p-3 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-gray-600">来源 {i + 1}</span>
                <span className="text-gray-400">{s.source_file}</span>
                <span className="ml-auto text-gray-400">score: {s.score.toFixed(4)}</span>
              </div>
              <p className="text-gray-600 line-clamp-3">{s.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 消息气泡 ──────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-[#1A1A1A] text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-sm">
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] bg-white border border-gray-200 text-gray-800 text-sm px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm">
        {msg.status === 'loading' ? (
          msg.content ? (
            // 正在流式输出：渲染 Markdown + 闪烁光标
            <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-strong:text-gray-900">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
              <span className="inline-block w-1.5 h-4 bg-gray-400 opacity-70 animate-pulse ml-0.5 align-middle rounded-sm" />
            </div>
          ) : (
            // 等待第一个 token：显示 spinner
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              <span>思考中...</span>
            </div>
          )
        ) : msg.status === 'error' ? (
          <div className="flex items-center gap-2 text-red-500">
            <AlertCircle size={14} />
            <span>{msg.content}</span>
          </div>
        ) : (
          <>
            <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-strong:text-gray-900">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
            {msg.files && msg.files.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {msg.files.map((f, i) => <FileCard key={i} file={f} />)}
              </div>
            )}
            {msg.sources && msg.sources.length > 0 && (
              <SourcesPanel sources={msg.sources} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────

const STATUS_TEXT: Record<string, string> = {
  building_retriever: '正在构建检索器...',
  running_rag: '正在思考...',
}

const TOOL_LABELS: Record<string, string> = {
  search_knowledge_base: '🔍 正在检索',
  get_academic_calendar: '📅 正在查询日历...',
  list_kb_documents: '📋 正在查看文档列表...',
  get_document_link: '📎 正在查找文件...',
}

export default function ConversationsPage() {
  const [selectedKb, setSelectedKb] = useState('')
  const [maxRef, setMaxRef] = useState(2)
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [statusText, setStatusText] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: kbs } = useQuery({ queryKey: ['knowledge-bases'], queryFn: knowledgeApi.list })
  const { data: faqs } = useQuery({
    queryKey: ['faqs', selectedKb],
    queryFn: () => faqApi.list(selectedKb),
    enabled: !!selectedKb,
    select: (data) => data.filter(f => f.enabled).slice(0, 6),
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (directText?: string) => {
    const q = directText !== undefined ? directText.trim() : query.trim()
    if (!q || !selectedKb || isStreaming) return
    if (directText === undefined) setQuery('')

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: q }
    const assistantId = crypto.randomUUID()
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '', status: 'loading' }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)
    setStatusText('正在检索...')

    let accumulatedText = ''
    try {
      await streamChat(
        selectedKb, q, maxRef, ctrl.signal,
        (step) => setStatusText(STATUS_TEXT[step] ?? '处理中...'),
        (text) => {
          // answer 事件：用完整文本兜底（token 全部累积后的最终版）
          accumulatedText = text
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: text, status: 'loading' } : m
          ))
        },
        (sources) => setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, sources, status: 'done' } : m
        )),
        (errMsg) => setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: errMsg, status: 'error' } : m
        )),
        (tokenText) => {
          // token 事件：逐字累积，实时更新气泡内容
          accumulatedText += tokenText
          const snapshot = accumulatedText
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: snapshot, status: 'loading' } : m
          ))
        },
        (tool, input) => {
          // agent_action 事件：实时显示工具调用状态
          const label = TOOL_LABELS[tool] ?? `⚙️ 正在调用 ${tool}...`
          const statusMsg = (input && tool === 'search_knowledge_base')
            ? `${label}：${input}`
            : label
          setStatusText(statusMsg)
        },
        (file) => {
          // file 事件：将文件卡片追加到助手消息
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, files: [...(m.files ?? []), file] }
              : m
          ))
        },
      )
      // 确保最终状态是 done
      setMessages(prev => prev.map(m =>
        m.id === assistantId && m.status === 'loading' ? { ...m, status: 'done' } : m
      ))
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: String(e), status: 'error' } : m
      ))
    } finally {
      setIsStreaming(false)
      setStatusText('')
    }
  }, [query, selectedKb, maxRef, isStreaming])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(undefined)
    }
  }

  const autoResize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => { autoResize() }, [query])

  return (
    <div className="flex flex-col h-full">
      {/* 顶部配置栏 */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-[#F0EDE8] bg-white shrink-0">
        <h1 className="text-base font-semibold text-gray-900 mr-2">问答测试</h1>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">知识库</label>
          <select
            value={selectedKb}
            onChange={e => setSelectedKb(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— 请选择 —</option>
            {kbs?.map(kb => <option key={kb.id} value={kb.name}>{kb.name}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">改写次数</label>
          <div className="flex border border-gray-300 rounded-md overflow-hidden text-sm">
            {[0, 1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => setMaxRef(n)}
                className={`px-2.5 py-1 ${maxRef === n ? 'bg-[#1A1A1A] text-white' : 'text-gray-700 hover:bg-[#F2EFE9]'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setMessages([])}
          disabled={messages.length === 0}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <Trash2 size={12} />清空对话
        </button>
      </div>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto py-5 bg-white">
        <div className="max-w-2xl mx-auto w-full px-4 space-y-4 h-full flex flex-col">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center flex-1 gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#F2EFE9] flex items-center justify-center">
                <MessageSquare size={22} className="text-[#1A1A1A]" strokeWidth={1.6} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-gray-800">开始提问</p>
                <p className="text-xs text-gray-400">
                  {!selectedKb ? '请先在顶部选择知识库，然后输入问题' : '在下方输入框中输入问题，按回车发送'}
                </p>
              </div>
              {selectedKb && faqs && faqs.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 mt-1 max-w-lg">
                  {faqs.map(faq => (
                    <button
                      key={faq.id}
                      onClick={() => sendMessage(faq.question)}
                      className="text-xs px-3 py-1.5 rounded-full border border-[#F0EDE8] bg-white text-gray-600 hover:bg-[#F2EFE9] hover:text-[#1A1A1A] transition-colors text-left"
                    >
                      {faq.question}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
          {isStreaming && statusText && (
            <div className="flex items-center gap-2 text-xs text-gray-400 pl-2">
              <Loader2 size={12} className="animate-spin" />
              {statusText}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 输入区 */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm px-4 pt-3 pb-3 flex flex-col gap-2 max-w-2xl mx-auto w-full">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={e => { setQuery(e.target.value) }}
            onKeyDown={handleKeyDown}
            disabled={isStreaming || !selectedKb}
            placeholder={selectedKb ? '有问题，尽管问' : '请先在左侧选择知识库'}
            rows={1}
            className="w-full resize-none outline-none text-sm text-gray-800 placeholder:text-gray-400 bg-transparent overflow-y-auto disabled:text-gray-400"
            style={{ minHeight: '1.5rem', maxHeight: '10rem' }}
          />
          <div className="flex items-center justify-end">
            <button
              onClick={() => sendMessage(undefined)}
              disabled={!query.trim() || !selectedKb || isStreaming}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors bg-gray-900 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed hover:bg-gray-700 disabled:hover:bg-gray-200"
            >
              {isStreaming ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
