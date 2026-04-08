import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { useQuery } from '@tanstack/react-query'
import { Send, Loader2, ChevronDown, ChevronUp, Trash2, AlertCircle } from 'lucide-react'
import { knowledgeApi } from '@/lib/api'
import type { ChatMessage, SourceItem } from '@/types/api'

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
          else if (currentEvent === 'answer') onAnswer(data.text)
          else if (currentEvent === 'sources') onSources(data.sources)
          else if (currentEvent === 'error') onError(data.message)
        } catch { /* 忽略解析错误 */ }
      }
    }
  }
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
        <div className="max-w-[75%] bg-blue-600 text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-sm">
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] bg-white border border-gray-200 text-gray-800 text-sm px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm">
        {msg.status === 'loading' ? (
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 size={14} className="animate-spin" />
            <span>{msg.content || '思考中...'}</span>
          </div>
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
  running_rag: '正在检索并生成答案...',
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async () => {
    if (!query.trim() || !selectedKb || isStreaming) return
    const q = query.trim()
    setQuery('')

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: q }
    const assistantId = crypto.randomUUID()
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '', status: 'loading' }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)
    setStatusText('正在检索...')

    try {
      await streamChat(
        selectedKb, q, maxRef, ctrl.signal,
        (step) => setStatusText(STATUS_TEXT[step] ?? '处理中...'),
        (text) => setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: text, status: 'loading' } : m
        )),
        (sources) => setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, sources, status: 'done' } : m
        )),
        (errMsg) => setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: errMsg, status: 'error' } : m
        )),
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
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部配置栏 */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-200 bg-white shrink-0">
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
                className={`px-2.5 py-1 ${maxRef === n ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
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
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-gray-50">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-2">
            {!selectedKb ? (
              <p>请先选择知识库，然后输入问题开始测试</p>
            ) : (
              <p>输入问题开始对话</p>
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

      {/* 输入区 */}
      <div className="shrink-0 px-6 py-4 border-t border-gray-200 bg-white">
        <div className="flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming || !selectedKb}
            placeholder={selectedKb ? '输入问题，Enter 发送，Shift+Enter 换行' : '请先选择知识库'}
            rows={2}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            onClick={sendMessage}
            disabled={!query.trim() || !selectedKb || isStreaming}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            发送
          </button>
        </div>
      </div>
    </div>
  )
}
