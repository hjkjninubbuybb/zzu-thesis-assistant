import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Plus,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Cpu,
  FileText,
} from 'lucide-react'
import { knowledgeApi } from '@/lib/api'
import type { KBInfo } from '@/types/api'

/* ══════════════════════ Animation hooks ══════════════════════ */

function useCountUp(target: number, duration = 1000, enabled = true) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return
    if (!target) { setCount(0); return }
    let startTs: number
    let raf: number
    const tick = (ts: number) => {
      startTs ??= ts
      const p = Math.min((ts - startTs) / duration, 1)
      setCount(Math.round((1 - Math.pow(1 - p, 3)) * target))
      if (p < 1) { raf = requestAnimationFrame(tick) }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, enabled])
  return count
}

function useDelayedTrue(delayMs: number) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), delayMs)
    return () => clearTimeout(t)
  }, [delayMs])
  return ready
}

/* ══════════════════════ Blob visualization card ══════════════════════
   Closest to the "Your Workout Results" card in the reference image:
   warm beige background + three overlapping radial-gradient blobs that
   breathe / float independently.
═══════════════════════════════════════════════════════════════════════ */
function BlobCard({ animate }: { animate: boolean }) {
  const blobs = [
    {
      label: '向量检索',
      value: '92%',
      bg: 'radial-gradient(circle at 42% 38%, #2A2A2ACC 0%, #2A2A2A55 55%, transparent 78%)',
      anim: 'blobFloat',
      dur: '3.8s',
      size: 148,
      left: '12%',
      top: '8%',
      delay: '0s',
      textColor: '#FFFFFF',
    },
    {
      label: 'BM25',
      value: '78%',
      bg: 'radial-gradient(circle at 42% 38%, #F0C040EE 0%, #F0C04055 55%, transparent 78%)',
      anim: 'blobFloat2',
      dur: '4.5s',
      size: 195,
      left: '35%',
      top: '-5%',
      delay: '0.4s',
      textColor: '#2A2A2A',
    },
    {
      label: 'RRF 融合',
      value: '95%',
      bg: 'radial-gradient(circle at 42% 38%, #E85D4ACC 0%, #E85D4A55 55%, transparent 78%)',
      anim: 'blobFloat3',
      dur: '3.2s',
      size: 162,
      left: '27%',
      top: '40%',
      delay: '0.8s',
      textColor: '#FFFFFF',
    },
  ]

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4 hover-lift"
      style={{ background: '#D4CFBF' }}
    >
      <div>
        <h2 className="text-[15px] font-semibold text-[#2A2A2A]">检索引擎性能</h2>
        <p className="text-xs text-[#7A7A7A] mt-0.5">三路混合检索组件得分</p>
      </div>

      {/* Blob canvas */}
      <div
        className="relative overflow-hidden rounded-xl"
        style={{ height: 180, background: '#C8C4B0' }}
      >
        {blobs.map((blob) => (
          <div
            key={blob.label}
            style={{
              position: 'absolute',
              width: blob.size,
              height: blob.size,
              borderRadius: '50%',
              background: blob.bg,
              filter: 'blur(18px)',
              left: blob.left,
              top: blob.top,
              animation: animate
                ? `${blob.anim} ${blob.dur} ease-in-out infinite ${blob.delay}`
                : 'none',
              mixBlendMode: 'multiply',
            }}
          />
        ))}

        {/* Value labels */}
        <div
          style={{
            position: 'absolute',
            left: '16%',
            top: '22%',
            textAlign: 'center',
            zIndex: 2,
          }}
        >
          <p
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#FFFFFF',
              lineHeight: 1,
              textShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }}
          >
            92%
          </p>
          <p style={{ fontSize: '0.65rem', color: '#E0DDD5', marginTop: 2 }}>向量召回</p>
        </div>
        <div
          style={{
            position: 'absolute',
            left: '48%',
            top: '14%',
            textAlign: 'center',
            zIndex: 2,
          }}
        >
          <p
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#2A2A2A',
              lineHeight: 1,
            }}
          >
            78%
          </p>
          <p style={{ fontSize: '0.65rem', color: '#5A5A5A', marginTop: 2 }}>BM25</p>
        </div>
        <div
          style={{
            position: 'absolute',
            left: '34%',
            top: '56%',
            textAlign: 'center',
            zIndex: 2,
          }}
        >
          <p
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#FFFFFF',
              lineHeight: 1,
              textShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }}
          >
            95%
          </p>
          <p style={{ fontSize: '0.65rem', color: '#F0D8D4', marginTop: 2 }}>RRF 融合</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5">
        {[
          { label: '向量检索', color: '#2A2A2A' },
          { label: 'BM25', color: '#F0C040' },
          { label: 'RRF 融合', color: '#E85D4A' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div
              className="h-1.5 rounded-full"
              style={{ width: 22, background: item.color }}
            />
            <span className="text-[11px] text-[#6A6A6A]">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════ Dark system status card ══════════════════════
   Matches the "Your Training Days" dark card on the right of the image.
═══════════════════════════════════════════════════════════════════════ */
function SystemDarkCard({ animate }: { animate: boolean }) {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const r = await fetch('/health')
      if (!r.ok) throw new Error('health check failed')
      return r.json() as Promise<Record<string, boolean>>
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const services = [
    { label: 'FastAPI 后端', ok: health?.fastapi ?? null, delay: 200 },
    { label: 'Qdrant 向量库', ok: health?.qdrant ?? null, delay: 350 },
    { label: 'DashScope LLM', ok: health?.dashscope ?? null, delay: 500 },
    { label: 'BM25 引擎', ok: health?.bm25 ?? null, delay: 650 },
    { label: 'Reranker', ok: health?.reranker ?? null, delay: 800 },
  ]

  const allOk = health != null && Object.values(health).every(Boolean)

  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-5 hover-lift"
      style={{ background: '#1A1A1A', color: '#FFFFFF' }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-semibold">系统状态</h2>
          <p className="text-xs mt-0.5" style={{ color: '#5A5A5A' }}>
            RAG 1.0 · Agentic Pipeline
          </p>
        </div>
        <div
          className="w-2 h-2 rounded-full"
          style={{
            background: health == null ? '#5A5A5A' : allOk ? '#5EE67A' : '#FF6B6B',
            boxShadow: health == null ? 'none' : allOk ? '0 0 8px #5EE67A' : '0 0 8px #FF6B6B',
            animation: animate && allOk ? 'dotPulse 2s ease-in-out infinite' : 'none',
          }}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        {services.map((s) => (
          <div
            key={s.label}
            className="flex items-center justify-between"
            style={{
              opacity: animate ? 1 : 0,
              transform: animate ? 'translateX(0)' : 'translateX(-8px)',
              transition: `opacity 0.4s ease ${s.delay}ms, transform 0.4s ease ${s.delay}ms`,
            }}
          >
            <span className="text-xs" style={{ color: '#8A8A8A' }}>
              {s.label}
            </span>
            <div className="flex items-center gap-1.5">
              {s.ok === null
                ? <Loader2 size={12} className="animate-spin" style={{ color: '#5A5A5A' }} />
                : s.ok
                  ? <CheckCircle2 size={12} style={{ color: '#5EE67A' }} />
                  : <AlertCircle size={12} style={{ color: '#FF6B6B' }} />}
              <span className="text-xs" style={{
                color: s.ok === null ? '#5A5A5A' : s.ok ? '#5EE67A' : '#FF6B6B'
              }}>
                {s.ok === null ? '检测中' : s.ok ? '运行中' : '不可用'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div
        className="pt-4 flex flex-col gap-2"
        style={{ borderTop: '1px solid #2A2A2A' }}
      >
        <div className="flex items-center gap-1.5">
          <Cpu size={12} style={{ color: '#4A4A4A' }} strokeWidth={1.6} />
          <span className="text-[11px]" style={{ color: '#4A4A4A' }}>
            引擎配置
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['qwen-plus', 'gte-rerank', 'RRF k=60', 'top_k=15'].map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                background: '#242424',
                color: '#6A6A6A',
                border: '1px solid #2E2E2E',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════ SVG ring progress ══════════════════════
   Matches the "Steps for Today" ring chart. 270° open arc.
═══════════════════════════════════════════════════════════════════════ */
function RingProgress({
  value,
  max,
  size = 110,
  color = '#E85D4A',
  animate,
}: {
  value: number
  max: number
  size?: number
  color?: string
  animate: boolean
}) {
  const strokeW = size * 0.075
  const r = (size - strokeW * 2) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const arcFrac = 0.75 // 270°
  const arcLen = circumference * arcFrac
  const filled = animate ? Math.min(value / max, 1) * arcLen : 0

  return (
    <svg
      width={size}
      height={size}
      style={{ transform: 'rotate(-225deg)', display: 'block' }}
    >
      {/* Track */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#F0EDE8"
        strokeWidth={strokeW}
        strokeDasharray={`${arcLen} ${circumference}`}
        strokeLinecap="round"
      />
      {/* Fill */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeW}
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
        style={{
          transition: 'stroke-dasharray 1.4s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </svg>
  )
}

/* "知识库统计" ring card — like "Steps for Today" */
function KBRingCard({
  kbCount,
  animate,
}: {
  kbCount: number
  animate: boolean
}) {
  const TARGET = 10
  const displayCount = useCountUp(kbCount, 900, animate)

  return (
    <div className="bg-white rounded-2xl p-5 flex flex-col gap-3 hover-lift border border-[#F0EDE8] shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-[#1A1A1A]">知识库</h3>
        <p className="text-xs text-[#9A9A9A] mt-0.5">目标：{TARGET} 个</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex items-center justify-center" style={{ width: 110, height: 110 }}>
          <RingProgress value={kbCount} max={TARGET} animate={animate} color="#E85D4A" />
          <div
            className="absolute text-center"
            style={{ pointerEvents: 'none' }}
          >
            <p className="text-2xl font-bold text-[#1A1A1A] leading-none">
              {displayCount}
            </p>
            <p className="text-[10px] text-[#9A9A9A] mt-1">已创建</p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-[#9A9A9A]">进度</p>
          <p className="text-xl font-bold text-[#1A1A1A]">
            {kbCount > 0 ? Math.round((kbCount / TARGET) * 100) : 0}%
          </p>
          <p className="text-[11px] text-[#B8B4AC]">目标 {TARGET} 个</p>
        </div>
      </div>
    </div>
  )
}

/* "文档总量" progress card — like "Weight Loss Plan" */
function DocsCard({
  totalDocs,
  animate,
}: {
  totalDocs: number
  animate: boolean
}) {
  const TARGET = 100
  const pct = animate ? Math.min(totalDocs / TARGET, 1) : 0
  const displayDocs = useCountUp(totalDocs, 900, animate)

  return (
    <div className="bg-white rounded-2xl p-5 flex flex-col gap-4 hover-lift border border-[#F0EDE8] shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#1A1A1A]">文档总量</h3>
          <p className="text-xs text-[#9A9A9A] mt-0.5">知识库文档数</p>
        </div>
        <span className="text-xl font-bold text-[#F0C040]">
          {Math.round(pct * 100)}%
        </span>
      </div>

      {/* Progress track */}
      <div className="relative">
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: '#F0EDE8' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct * 100}%`,
              background: 'linear-gradient(90deg, #F0C040, #E85D4A)',
              transition: 'width 1.4s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </div>

        {/* Thumb indicator */}
        <div
          className="absolute -top-1 w-4 h-4 rounded-full bg-white border-2 border-[#1A1A1A] shadow-sm flex items-center justify-center"
          style={{
            left: `calc(${pct * 100}% - 8px)`,
            transition: 'left 1.4s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>

      <div className="flex justify-between text-xs text-[#9A9A9A]">
        <span>0</span>
        <span className="font-semibold text-[#1A1A1A]">{displayDocs} 篇</span>
        <span>{TARGET}</span>
      </div>
    </div>
  )
}

/* ══════════════════════ Segment bar ══════════════════════
   Matches the "My Habits" sessions bar in the reference image.
═══════════════════════════════════════════════════════════════════════ */
function SegmentBar({
  filled,
  total,
  color,
  animate,
  baseDelay,
}: {
  filled: number
  total: number
  color: string
  animate: boolean
  baseDelay: number
}) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-2 rounded-sm"
          style={{
            width: 10,
            background: i < filled ? color : '#EAE6E0',
            transformOrigin: 'left center',
            animation:
              animate && i < filled
                ? `segFill 0.18s cubic-bezier(0.22,1,0.36,1) ${baseDelay + i * 45}ms both`
                : 'none',
          }}
        />
      ))}
    </div>
  )
}

/* ══════════════════════ KB list card ══════════════════════
   Matches "My Habits" list with segment progress bars.
═══════════════════════════════════════════════════════════════════════ */
const KB_COLORS = ['#E85D4A', '#F0C040', '#5EE67A', '#60A5FA', '#C084FC', '#FB923C']

function KBListCard({
  kbs,
  animate,
}: {
  kbs: KBInfo[]
  animate: boolean
}) {
  const navigate = useNavigate()
  const maxDocs = Math.max(...kbs.map((kb) => kb.doc_count), 1)
  const SEG_TOTAL = 10

  return (
    <div className="bg-white rounded-2xl p-5 flex flex-col gap-4 hover-lift border border-[#F0EDE8] shadow-sm h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1A1A1A]">知识库列表</h3>
        <button
          onClick={() => navigate('/knowledge')}
          className="flex items-center gap-1 text-xs text-[#9A9A9A] hover:text-[#1A1A1A] transition-colors px-2 py-1 rounded-lg hover:bg-[#F2EFE9]"
        >
          <Plus size={12} />
          新建
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {kbs.map((kb, i) => {
          const color = KB_COLORS[i % KB_COLORS.length]
          const filled = Math.max(1, Math.round((kb.doc_count / maxDocs) * SEG_TOTAL))
          const initials = kb.name.slice(0, 2).toUpperCase()

          return (
            <button
              key={kb.id}
              onClick={() => navigate(`/documents?kb=${kb.name}`)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F8F6F2] transition-colors group w-full text-left"
              style={{
                opacity: animate ? 1 : 0,
                transform: animate ? 'translateX(0)' : 'translateX(12px)',
                transition: `opacity 0.4s ease ${200 + i * 100}ms, transform 0.4s ease ${200 + i * 100}ms`,
              }}
            >
              {/* Avatar */}
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0 transition-transform duration-200 group-hover:scale-105"
                style={{ background: color }}
              >
                {initials}
              </div>

              {/* Name + bar */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#1A1A1A] truncate">{kb.name}</p>
                <div className="mt-1.5">
                  <SegmentBar
                    filled={filled}
                    total={SEG_TOTAL}
                    color={color}
                    animate={animate}
                    baseDelay={300 + i * 100}
                  />
                </div>
              </div>

              {/* Doc count */}
              <div className="text-right shrink-0 ml-2">
                <p className="text-xs font-semibold text-[#1A1A1A]">
                  {kb.doc_count}
                  <span className="text-[#C8C4BC] font-normal"> 篇</span>
                </p>
              </div>

              <ArrowRight
                size={13}
                className="text-[#D4D0C8] group-hover:text-[#1A1A1A] group-hover:translate-x-0.5 transition-all duration-200 shrink-0"
              />
            </button>
          )
        })}
      </div>

      {kbs.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <FileText size={28} className="text-[#D4D0C8] mb-2" strokeWidth={1.2} />
          <p className="text-sm text-[#AEAAA4]">暂无知识库</p>
          <p className="text-xs text-[#C8C4BC] mt-1">点击右上角「新建」创建第一个</p>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════ Main page ══════════════════════ */

export default function OverviewPage() {
  const { data: kbs, isLoading, error } = useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: knowledgeApi.list,
  })

  const totalDocs = kbs?.reduce((sum, kb) => sum + kb.doc_count, 0) ?? 0

  // Staggered entrance — each section gets its own delay flag
  const blobReady = useDelayedTrue(50)
  const darkReady = useDelayedTrue(150)
  const ringReady = useDelayedTrue(250)
  const docsReady = useDelayedTrue(350)
  const listReady = useDelayedTrue(200)

  // Wrapper style helper for staggered fade-slide-up
  const cardStyle = (delay: number): React.CSSProperties => ({
    animation: `fadeSlideUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both`,
  })

  return (
    <div className="p-7 min-h-full">
      {/* ── Header ── */}
      <div className="mb-7" style={cardStyle(0)}>
        <h1 className="text-[28px] font-semibold text-[#1A1A1A] tracking-tight leading-tight">
          欢迎回来！
        </h1>
        <p className="text-sm text-[#9A9A9A] mt-1">让我们来看看系统今天的状态</p>
      </div>

      {/* ── Loading / error state ── */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-[#9A9A9A] py-8 justify-center">
          <Loader2 size={16} className="animate-spin" />
          加载中...
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-500 py-4">
          <AlertCircle size={16} />
          加载失败，请检查后端服务是否正常
        </div>
      )}

      {/* ── Main dashboard grid ── */}
      {!isLoading && !error && kbs && (
        <div className="grid grid-cols-3 gap-4">

          {/* ── Row 1: Blob card (wide) + Dark card (narrow) ── */}
          <div className="col-span-2" style={cardStyle(80)}>
            <BlobCard animate={blobReady} />
          </div>

          <div className="col-span-1" style={cardStyle(160)}>
            <SystemDarkCard animate={darkReady} />
          </div>

          {/* ── Row 2: Left narrow column + Right KB list ── */}
          <div className="col-span-1 flex flex-col gap-4">
            <div style={cardStyle(240)}>
              <KBRingCard kbCount={kbs.length} animate={ringReady} />
            </div>
            <div style={cardStyle(320)}>
              <DocsCard totalDocs={totalDocs} animate={docsReady} />
            </div>
          </div>

          <div className="col-span-2" style={cardStyle(200)}>
            <KBListCard kbs={kbs} animate={listReady} />
          </div>
        </div>
      )}
    </div>
  )
}
