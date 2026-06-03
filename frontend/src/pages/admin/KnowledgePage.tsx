import { useState } from 'react';

import { DocumentKnowledgeTab } from '@features/knowledge';
import { FaqKnowledgeTab } from '@features/faq';

type Tab = 'documents' | 'faq';

export default function KnowledgePage() {
  const [tab, setTab] = useState<Tab>('documents');
  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl custom-scrollbar flex flex-col gap-5">
      <div className="flex items-center gap-1 mt-3 border-b border-[#E8E4DC]">
        {(['documents', 'faq'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              tab === t ? 'text-[#334155]' : 'text-[#9A9A9A]'
            }`}
          >
            {t === 'documents' ? '文档知识' : 'FAQ 知识'}
          </button>
        ))}
      </div>
      {tab === 'documents' ? <DocumentKnowledgeTab /> : <FaqKnowledgeTab />}
    </div>
  );
}
