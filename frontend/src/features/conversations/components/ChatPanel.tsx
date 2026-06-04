import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Loader2, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { MessageBubble } from './MessageBubble';
import { ThinkingProcess, ConversationSkeleton } from './ThinkingProcess';
import { AgentAvatar } from './AgentAvatar';
import { TutorHelpModal } from './TutorHelpModal';
import { chatService } from '../services/chatService';
import { conversationKeys } from '../hooks/queryKeys';
import type { ChatMessage } from '@shared/types/api';
import type { ThinkingStep } from './ThinkingProcess';

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  isLoadingHistory: boolean;
  thinkingSteps: ThinkingStep[];
  activeConvId: number | null;
  chatKb: string;
  effectiveKb: string;
  isStudent: boolean;
  studentKb: string | null;
  onSend: (query: string) => void;
  onFeedback: (msgId: number, rating: 'up' | 'down') => void;
  onClearMessages: () => void;
}

export function ChatPanel({
  messages,
  isStreaming,
  isLoadingHistory,
  thinkingSteps,
  activeConvId,
  chatKb,
  effectiveKb,
  isStudent,
  studentKb,
  onSend,
  onFeedback,
  onClearMessages,
}: ChatPanelProps) {
  const [query, setQuery] = useState('');
  const [helpMsg, setHelpMsg] = useState<ChatMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // FAQ 快问列表
  const { data: faqs } = useQuery({
    queryKey: conversationKeys.faqs(effectiveKb),
    queryFn: () => chatService.listFaqs(effectiveKb),
    enabled: !!effectiveKb,
    select: (data) => data.filter((f) => f.enabled).slice(0, 6),
  });

  // 滚动到底部
  const scrollRAF = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(scrollRAF.current);
    scrollRAF.current = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, [messages]);

  // 自动调整 textarea 高度
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [query, autoResize]);

  const handleSend = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    setQuery('');
    onSend(q);
  }, [query, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFaqClick = (question: string) => {
    onSend(question);
  };

  return (
    <div className="flex-1 flex flex-col glass-card rounded-2xl overflow-hidden">
      {/* 顶部信息栏 */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[#F0EDE8] shrink-0">
        <h1 className="text-base font-semibold text-gray-900">问答对话</h1>
        {chatKb && (
          <span className="text-xs text-gray-400 bg-[#F7F5F1] px-2 py-0.5 rounded-md">
            {chatKb}
          </span>
        )}
        {messages.length > 0 && (
          <button
            onClick={onClearMessages}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            <Plus size={12} />
            新对话
          </button>
        )}
      </div>

      {/* 消息区 */}
      <div
        className="flex-1 overflow-y-auto py-5"
        style={{ contain: 'paint', transform: 'translateZ(0)' }}
      >
        <div className="max-w-2xl mx-auto w-full px-4 space-y-4 h-full flex flex-col">
          {isLoadingHistory ? (
            <ConversationSkeleton />
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 animate-apple-settle">
              {isStudent && !studentKb ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="animate-idle-breath">
                    <AgentAvatar isStudent={true} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-800">暂无可用知识库</p>
                    <p className="text-xs text-gray-400">请联系管理员为学生分配知识库后再使用</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="animate-idle-breath scale-150 mb-4">
                    <AgentAvatar isStudent={isStudent} />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-semibold text-gray-800">开始提问</p>
                    <p className="text-xs text-gray-400">
                      {!chatKb
                        ? '请先在知识库页面配置知识库，然后新建对话'
                        : '在下方输入框中输入问题，按回车发送'}
                    </p>
                  </div>
                  {chatKb && faqs && faqs.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2 mt-1 max-w-lg">
                      {faqs.map((faq) => (
                        <button
                          key={faq.id}
                          onClick={() => handleFaqClick(faq.question)}
                          className={`text-xs px-3 py-1.5 rounded-full border bg-white text-gray-600 transition-colors text-left ${isStudent ? 'border-[#D9DEE5] hover:bg-[#EEF2FF] hover:text-[#2563EB]' : 'border-[#F0EDE8] hover:bg-[#F2EFE9] hover:text-[#334155]'}`}
                        >
                          {faq.question}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  onFeedback={onFeedback}
                  onSuggestionClick={onSend}
                  onAskTutor={isStudent ? setHelpMsg : undefined}
                  isStudent={isStudent}
                />
              ))}
              {isStreaming && <ThinkingProcess steps={thinkingSteps} />}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 输入区 */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        <div className="relative glass-card rounded-2xl px-4 pt-3 pb-3 flex flex-col gap-2 max-w-2xl mx-auto w-full">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming || !effectiveKb}
            placeholder={
              isStudent && !studentKb
                ? '等待管理员分配知识库...'
                : effectiveKb
                  ? '有问题，尽管问'
                  : '请先在知识库页面配置知识库，然后新建对话'
            }
            rows={1}
            className="w-full resize-none outline-none text-sm text-gray-800 placeholder:text-gray-400 bg-transparent overflow-y-auto disabled:text-gray-400"
            style={{ minHeight: '1.5rem', maxHeight: '10rem' }}
          />
          <div className="flex items-center justify-end">
            <button
              onClick={handleSend}
              disabled={!query.trim() || !effectiveKb || isStreaming}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-gray-200 ${isStudent ? 'bg-[#2563EB] hover:bg-[#1D4ED8]' : 'bg-gray-900 hover:bg-gray-700'}`}
            >
              {isStreaming ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} />}
            </button>
          </div>
        </div>
      </div>

      {/* 求助导师弹窗 */}
      {helpMsg && activeConvId && (
        <TutorHelpModal
          msg={helpMsg}
          convId={activeConvId}
          onClose={() => setHelpMsg(null)}
          onSuccess={() => setHelpMsg(null)}
        />
      )}
    </div>
  );
}
