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
  ThumbsUp,
  Activity,
} from 'lucide-react'
import { knowledgeApi, analyticsApi, configApi } from '@/lib/api'
import type { KBInfo, SystemConfig } from '@/types/api'

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
   "知识库资产" card: Show KB Count, Doc Count, FAQ Count in blobs.
═══════════════════════════════════════════════════════════════════════ */
function BlobCard({
  animate,
  kbCount,
  docCount,
  faqCount,
}: {
  animate: boolean
  kbCount: number
  docCount: number
  faqCount: number
}) {
  const dispKb  = useCountUp(kbCount,  900, animate)
  const dispDoc = useCountUp(docCount, 1000, animate)
  const dispFaq = useCountUp(faqCount, 1100, animate)

  const blobs = [
    {
      label: '知识库',
      value: dispKb,
      bg: 'radial-gradient(circle at 42% 38%, #2A2A2ACC 0%, #2A2A2A55 55%, transparent 78%)',
      anim: 'blobFloat',
      dur: '3.8s',
      size: 148,
      left: '12%',
      top: '8%',
      delay: '0s',
    },
    {
      label: 'FAQ 总数',
      value: dispFaq,
      bg: 'radial-gradient(circle at 42% 38%, #F0C040EE 0%, #F0C04055 55%, transparent 78%)',
      anim: 'blobFloat2',
      dur: '4.5s',
      size: 195,
      left: '35%',
      top: '-5%',
      delay: '0.4s',
    },
    {
      label: '文档总量',
      value: dispDoc,
      bg: 'radial-gradient(circle at 42% 38%, #E85D4ACC 0%, #E85D4A55 55%, transparent 78%)',
      anim: 'blobFloat3',
      dur: '3.2s',
      size: 162,
      left: '27%',
      top: '40%',
      delay: '0.8s',
    },
  ]

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4 hover-lift"
      style={{ background: '#D4CFBF' }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-[#2A2A2A]">核心知识资产</h2>
          <p className="text-xs text-[#7A7A7A] mt-0.5">系统已收录的结构化数据概览</p>
        </div>
        <Activity size={18} className="text-[#2A2A2A] opacity-30" />
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
        <div style={{ position: 'absolute', left: '16%', top: '22%', textAlign: 'center', zIndex: 2 }}>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FFFFFF', lineHeight: 1, textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>{blobs[0].value}</p>
          <p style={{ fontSize: '0.65rem', color: '#E0DDD5', marginTop: 2 }}>知识库数</p>
        </div>
        <div style={{ position: 'absolute', left: '48%', top: '14%', textAlign: 'center', zIndex: 2 }}>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2A2A2A', lineHeight: 1 }}>{blobs[1].value}</p>
          <p style={{ fontSize: '0.65rem', color: '#5A5A5A', marginTop: 2 }}>FAQ 总数</p>
        </div>
        <div style={{ position: 'absolute', left: '34%', top: '56%', textAlign: 'center', zIndex: 2 }}>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FFFFFF', lineHeight: 1, textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>{blobs[2].value}</p>
          <p style={{ fontSize: '0.65rem', color: '#F0D8D4', marginTop: 2 }}>文档总量</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5">
        {[
          { label: '知识库', color: '#2A2A2A' },
          { label: 'FAQ', color: '#F0C040' },
          { label: '文档', color: '#E85D4A' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="h-1.5 rounded-full" style={{ width: 22, background: item.color }} />
            <span className="text-[11px] text-[#6A6A6A]">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════ System Status Card ══════════════════════
   Focused on health and configuration. Using warm taupe background.
═══════════════════════════════════════════════════════════════════════ */
function SystemStatusCard({
  animate,
  config,
  activeKbName,
}: {
  animate: boolean
  config: SystemConfig | undefined
  activeKbName: string | undefined
}) {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const r = await fetch('/health')
      if (!r.ok) throw new Error('health check failed')
      return r.json() as Promise<Record<string, boolean>>
    },
    staleTime: 60000,
    refetchOnWindowFocus: false,
  })

  const services = [
    { label: 'FastAPI 后端', ok: health?.fastapi ?? null, delay: 200 },
    { label: 'Qdrant 向量库', ok: health?.qdrant ?? null, delay: 350 },
    { label: 'DashScope LLM', ok: health?.dashscope ?? null, delay: 500 },
    { label: 'Reranker 引擎', ok: health?.reranker ?? null, delay: 800 },
  ]

  const allOk = health != null && Object.values(health).every(Boolean)

  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-5 hover-lift h-full"
      style={{ background: '#4A4438', color: '#FFFFFF' }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-semibold">系统运行状态</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[11px]" style={{ color: '#A09A8D' }}>
              生效知识库：
            </p>
            <span className="text-[11px] font-medium text-[#5EE67A]">
              {activeKbName || '未分配'}
            </span>
          </div>
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
            <span className="text-xs" style={{ color: '#A09A8D' }}>{s.label}</span>
            <div className="flex items-center gap-1.5">
              {s.ok === null
                ? <Loader2 size={12} className="animate-spin" style={{ color: '#5A5A5A' }} />
                : s.ok
                  ? <CheckCircle2 size={12} style={{ color: '#5EE67A' }} />
                  : <AlertCircle size={12} style={{ color: '#FF6B6B' }} />}
              <span className="text-xs" style={{ color: s.ok === null ? '#5A5A5A' : s.ok ? '#5EE67A' : '#FF6B6B' }}>
                {s.ok === null ? '检测中' : s.ok ? '运行中' : '不可用'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4 flex flex-col gap-2" style={{ borderTop: '1px solid #5C564D' }}>
        <div className="flex items-center gap-1.5">
          <Cpu size={12} style={{ color: '#8A8478' }} strokeWidth={1.6} />
          <span className="text-[11px]" style={{ color: '#8A8478' }}>模型配置</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[config?.llm.model || '未加载', config?.reranker.model || '无重排'].map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: '#3D382E', color: '#A09A8D', border: '1px solid #544E45' }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════ Ring progress ══════════════════════ */
function RingProgress({ value, max, size = 110, color = '#E85D4A', animate }: { value: number; max: number; size?: number; color?: string; animate: boolean }) {
  const strokeW = size * 0.075
  const r = (size - strokeW * 2) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const arcFrac = 0.75
  const arcLen = circumference * arcFrac
  const filled = animate ? Math.min(value / max, 1) * arcLen : 0
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-225deg)', display: 'block' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0EDE8" strokeWidth={strokeW} strokeDasharray={`${arcLen} ${circumference}`} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeW} strokeDasharray={`${filled} ${circumference}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 1.4s cubic-bezier(0.22, 1, 0.36, 1)' }} />
    </svg>
  )
}

/* "用户满意度" ring card */
function SatisfactionCard({ upPct, feedbackCount, animate }: { upPct: number; feedbackCount: number; animate: boolean }) {
  const displayPct = useCountUp(upPct, 900, animate)
  return (
    <div className="glass-card rounded-2xl p-5 flex flex-col gap-3 hover-lift">
      <div>
        <h3 className="text-sm font-semibold text-[#1A1A1A]">用户满意度</h3>
        <p className="text-xs text-[#9A9A9A] mt-0.5">累计收到 {feedbackCount} 条反馈</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative flex items-center justify-center" style={{ width: 110, height: 110 }}>
          <RingProgress value={upPct} max={100} animate={animate} color="#5EE67A" />
          <div className="absolute text-center">
            <p className="text-2xl font-bold text-[#1A1A1A] leading-none">{displayPct}%</p>
            <p className="text-[10px] text-[#9A9A9A] mt-1">好评率</p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <ThumbsUp size={16} className="text-[#5EE67A]" />
          <p className="text-xs text-[#9A9A9A]">整体反馈</p>
          <p className="text-sm font-bold text-[#1A1A1A]">{upPct > 80 ? '极好' : upPct > 50 ? '一般' : '需优化'}</p>
        </div>
      </div>
    </div>
  )
}

/* "今日活跃度" progress card */
function ActivityCard({ todayQs, animate }: { todayQs: number; animate: boolean }) {
  const TARGET = 50
  const pct = animate ? Math.min(todayQs / TARGET, 1) : 0
  const displayQs = useCountUp(todayQs, 900, animate)
  return (
    <div className="glass-card rounded-2xl p-5 flex flex-col gap-4 hover-lift">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#1A1A1A]">今日活跃度</h3>
          <p className="text-xs text-[#9A9A9A] mt-0.5">今日学生提问数量</p>
        </div>
        <span className="text-xl font-bold text-[#F0C040]">{displayQs}</span>
      </div>
      <div className="relative">
        <div className="h-2 rounded-full overflow-hidden" style={{ background: '#F0EDE8' }}>
          <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: 'linear-gradient(90deg, #F0C040, #E85D4A)', transition: 'width 1.4s cubic-bezier(0.22, 1, 0.36, 1)' }} />
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-[#9A9A9A]">
        <span>活跃度：{Math.round(pct * 100)}%</span>
        <span>目标 {TARGET} 问/日</span>
      </div>
    </div>
  )
}

/* ══════════════════════ Segment bar ══════════════════════ */
function SegmentBar({ filled, total, color, animate, baseDelay }: { filled: number; total: number; color: string; animate: boolean; baseDelay: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="h-2 rounded-sm" style={{ width: 10, background: i < filled ? color : '#EAE6E0', transformOrigin: 'left center', animation: animate && i < filled ? `segFill 0.18s cubic-bezier(0.22,1,0.36,1) ${baseDelay + i * 45}ms both` : 'none' }} />
      ))}
    </div>
  )
}

/* ══════════════════════ KB list card ══════════════════════ */
const KB_COLORS = ['#E85D4A', '#F0C040', '#5EE67A', '#60A5FA', '#C084FC', '#FB923C']
function KBListCard({ kbs, animate }: { kbs: KBInfo[]; animate: boolean }) {
  const navigate = useNavigate()
  const maxDocs = Math.max(...kbs.map((kb) => kb.doc_count), 1)
  const SEG_TOTAL = 10
  return (
    <div className="glass-card rounded-2xl p-5 flex flex-col gap-4 hover-lift h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1A1A1A]">知识库列表明细</h3>
        <button onClick={() => navigate('/admin/knowledge')} className="flex items-center gap-1 text-xs text-[#9A9A9A] hover:text-[#1A1A1A] transition-colors px-2 py-1 rounded-lg hover:bg-[#F2EFE9]"><Plus size={12} />管理</button>
      </div>
      <div className="flex flex-col gap-1">
        {kbs.map((kb, i) => {
          const color = KB_COLORS[i % KB_COLORS.length]
          const filled = Math.max(1, Math.round((kb.doc_count / maxDocs) * SEG_TOTAL))
          return (
            <button key={kb.id} onClick={() => navigate(`/admin/documents?kb=${kb.name}`)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F8F6F2] transition-colors group w-full text-left" style={{ opacity: animate ? 1 : 0, transform: animate ? 'translateX(0)' : 'translateX(12px)', transition: `opacity 0.4s ease ${200 + i * 100}ms, transform 0.4s ease ${200 + i * 100}ms` }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0 transition-transform duration-200 group-hover:scale-105" style={{ background: color }}>{kb.name.slice(0, 2).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#1A1A1A] truncate">{kb.name}</p>
                <div className="mt-1.5"><SegmentBar filled={filled} total={SEG_TOTAL} color={color} animate={animate} baseDelay={300 + i * 100} /></div>
              </div>
              <div className="text-right shrink-0 ml-2"><p className="text-xs font-semibold text-[#1A1A1A]">{kb.doc_count}<span className="text-[#C8C4BC] font-normal"> 篇</span></p></div>
              <ArrowRight size={13} className="text-[#D4D0C8] group-hover:text-[#1A1A1A] group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ══════════════════════ Main page ══════════════════════ */
export default function OverviewPage() {
  const { data: kbs, isLoading: kbLoading } = useQuery({ queryKey: ['knowledge-bases'], queryFn: knowledgeApi.list })
  const { data: analytics, isLoading: statsLoading } = useQuery({ queryKey: ['analytics-summary'], queryFn: analyticsApi.summary })
  const { data: config } = useQuery({ queryKey: ['system-config'], queryFn: configApi.get })
  const { data: activeKb } = useQuery({ queryKey: ['admin-active-kb'], queryFn: knowledgeApi.getAdminKb })

  const isLoading = kbLoading || statsLoading
  const blobReady = useDelayedTrue(50)
  const statusReady = useDelayedTrue(150)
  const satReady = useDelayedTrue(250)
  const actReady = useDelayedTrue(350)
  const listReady = useDelayedTrue(200)

  const cardStyle = (delay: number): React.CSSProperties => ({ animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms both` })

  const upTotal = (analytics?.feedback_up ?? 0) + (analytics?.feedback_down ?? 0)
  const upPct = upTotal > 0 ? Math.round((analytics!.feedback_up / upTotal) * 100) : 0

  return (
    <div className="p-7 flex-1 overflow-y-auto glass-card rounded-2xl">
      <div className="mb-7" style={cardStyle(0)}>
        <h1 className="text-[28px] font-semibold text-[#1A1A1A] tracking-tight leading-tight">概览</h1>
        <p className="text-sm text-[#9A9A9A] mt-1">系统资产概况与实时运行监控</p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-[#9A9A9A] py-16 justify-center">
          <Loader2 size={16} className="animate-spin" />
          正在构建概览视图...
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2" style={cardStyle(80)}>
            <BlobCard animate={blobReady} kbCount={kbs?.length || 0} docCount={analytics?.doc_count || 0} faqCount={analytics?.faq_count || 0} />
          </div>
          <div className="col-span-1" style={cardStyle(160)}>
            <SystemStatusCard animate={statusReady} config={config} activeKbName={activeKb?.kb_name} />
          </div>
          <div className="col-span-1 flex flex-col gap-4">
            <div style={cardStyle(240)}>
              <SatisfactionCard upPct={upPct} feedbackCount={upTotal} animate={satReady} />
            </div>
            <div style={cardStyle(320)}>
              <ActivityCard todayQs={analytics?.today_questions || 0} animate={actReady} />
            </div>
          </div>
          <div className="col-span-2" style={cardStyle(200)}>
            <KBListCard kbs={kbs || []} animate={listReady} />
          </div>
        </div>
      )}
    </div>
  )
}
