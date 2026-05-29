import ReactMarkdown from "react-markdown";
import type { SourceItem } from "@shared/types/api";

export function AcademicMarkdown({
  content,
  sources,
}: {
  content: string;
  sources?: SourceItem[];
}) {
  // 处理 AI 生成的带有空格的 sandbox 链接
  const processedContent = content.replace(
    /\[(.*?)\]\(sandbox:\/mnt\/data\/(.*?)\)/g,
    (_, p1, p2) => {
      return `[${p1}](#sandbox:${encodeURIComponent(p2)})`;
    },
  );

  // 匹配形如 [1] [2,3] 的引用标记
  const parts = processedContent.split(/(\[\d+(?:,\s*\d+)*\])/g);

  return (
    <div className="prose prose-sm prose-academic max-w-none">
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+(?:,\s*\d+)*)\]$/);
        if (match && sources && sources.length > 0) {
          const indices = match[1]
            .split(",")
            .map((s) => parseInt(s.trim()) - 1);
          return (
            <span key={i} className="inline-flex gap-0.5">
              {indices.map((idx) => {
                const source = sources[idx];
                if (!source) return <span key={idx}>{part}</span>;
                return (
                  <span
                    key={idx}
                    title={`${source.source_file}: ${source.text.slice(0, 100)}...`}
                    className="citation-marker"
                  >
                    {idx + 1}
                  </span>
                );
              })}
            </span>
          );
        }
        return (
          <ReactMarkdown
            key={i}
            components={{
              p: "span",
              a: ({ href, children, ...props }) => {
                if (href?.startsWith("#sandbox:")) {
                  const filename = decodeURIComponent(
                    href.replace("#sandbox:", ""),
                  );
                  return (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        alert(
                          `【演示文件下载】\n\n文件名: ${filename}\n\n注：此为 AI 生成的演示下载链接，实际物理文件并未在此演示环境中持久化。`,
                        );
                      }}
                      className="text-blue-600 hover:text-blue-700 underline underline-offset-2 font-medium"
                      {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
                    >
                      {children}
                    </a>
                  );
                }
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:text-blue-700 underline underline-offset-2 font-medium"
                    {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {part}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}
