import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Database, FileText, Layers, ChevronRight, AlertCircle, Loader2 } from 'lucide-react'
import { knowledgeApi } from '@/lib/api'
import type { KBInfo } from '@/types/api'

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-md ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  )
}

function KBCard({ kb }: { kb: KBInfo }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(`/documents?kb=${kb.name}`)}
      className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-400 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">{kb.name}</p>
          <p className="text-sm text-gray-500 mt-0.5 truncate">{kb.description || '暂无描述'}</p>
        </div>
        <ChevronRight size={16} className="text-gray-400 group-hover:text-gray-600 mt-0.5 shrink-0 ml-2" />
      </div>
      <div className="mt-3 flex items-center gap-1 text-xs text-gray-500">
        <FileText size={12} />
        <span>{kb.doc_count} 个文档</span>
      </div>
    </button>
  )
}

export default function OverviewPage() {
  const { data: kbs, isLoading, error } = useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: knowledgeApi.list,
  })

  const totalDocs = kbs?.reduce((sum, kb) => sum + kb.doc_count, 0) ?? 0

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">概览</h1>
        <p className="mt-1 text-sm text-gray-500">系统整体状态与快捷入口</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatCard
          icon={Database}
          label="知识库"
          value={isLoading ? '—' : (kbs?.length ?? 0)}
          color="bg-blue-500"
        />
        <StatCard
          icon={FileText}
          label="总文档数"
          value={isLoading ? '—' : totalDocs}
          color="bg-emerald-500"
        />
      </div>

      {/* 知识库快捷入口 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Layers size={16} className="text-gray-500" />
          <h2 className="text-sm font-medium text-gray-700">知识库</h2>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
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

        {kbs && kbs.length === 0 && (
          <div className="text-sm text-gray-400 py-8 text-center border border-dashed border-gray-200 rounded-lg">
            暂无知识库，请先前往「知识库」页面创建
          </div>
        )}

        {kbs && kbs.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {kbs.map(kb => <KBCard key={kb.id} kb={kb} />)}
          </div>
        )}
      </div>
    </div>
  )
}
