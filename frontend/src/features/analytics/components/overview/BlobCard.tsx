import { Activity } from "lucide-react";
import { useCountUp } from "../../hooks/animationHooks";

export function BlobCard({
  animate,
  kbCount,
  docCount,
  faqCount,
}: {
  animate: boolean;
  kbCount: number;
  docCount: number;
  faqCount: number;
}) {
  const dispKb = useCountUp(kbCount, 900, animate);
  const dispDoc = useCountUp(docCount, 1000, animate);
  const dispFaq = useCountUp(faqCount, 1100, animate);

  const blobs = [
    {
      label: "知识库",
      value: dispKb,
      bg: "radial-gradient(circle at 42% 38%, #2A2A2ACC 0%, #2A2A2A55 55%, transparent 78%)",
      anim: "blobFloat",
      dur: "3.8s",
      size: 148,
      left: "12%",
      top: "8%",
      delay: "0s",
    },
    {
      label: "FAQ 总数",
      value: dispFaq,
      bg: "radial-gradient(circle at 42% 38%, #F0C040EE 0%, #F0C04055 55%, transparent 78%)",
      anim: "blobFloat2",
      dur: "4.5s",
      size: 195,
      left: "35%",
      top: "-5%",
      delay: "0.4s",
    },
    {
      label: "文档总量",
      value: dispDoc,
      bg: "radial-gradient(circle at 42% 38%, #E85D4ACC 0%, #E85D4A55 55%, transparent 78%)",
      anim: "blobFloat3",
      dur: "3.2s",
      size: 162,
      left: "27%",
      top: "40%",
      delay: "0.8s",
    },
  ];

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4 hover-lift"
      style={{ background: "#D4CFBF" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-[#2A2A2A]">
            核心知识资产
          </h2>
          <p className="text-xs text-[#7A7A7A] mt-0.5">
            系统已收录的结构化数据概览
          </p>
        </div>
        <Activity size={18} className="text-[#2A2A2A] opacity-30" />
      </div>

      <div
        className="relative overflow-hidden rounded-xl"
        style={{ height: 180, background: "#C8C4B0" }}
      >
        {blobs.map((blob) => (
          <div
            key={blob.label}
            style={{
              position: "absolute",
              width: blob.size,
              height: blob.size,
              borderRadius: "50%",
              background: blob.bg,
              filter: "blur(18px)",
              left: blob.left,
              top: blob.top,
              animation: animate
                ? `${blob.anim} ${blob.dur} ease-in-out infinite ${blob.delay}`
                : "none",
              mixBlendMode: "multiply",
            }}
          />
        ))}

        <div
          style={{
            position: "absolute",
            left: "16%",
            top: "22%",
            textAlign: "center",
            zIndex: 2,
          }}
        >
          <p
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#FFFFFF",
              lineHeight: 1,
              textShadow: "0 1px 4px rgba(0,0,0,0.3)",
            }}
          >
            {blobs[0].value}
          </p>
          <p style={{ fontSize: "0.65rem", color: "#E0DDD5", marginTop: 2 }}>
            知识库数
          </p>
        </div>
        <div
          style={{
            position: "absolute",
            left: "48%",
            top: "14%",
            textAlign: "center",
            zIndex: 2,
          }}
        >
          <p
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#2A2A2A",
              lineHeight: 1,
            }}
          >
            {blobs[1].value}
          </p>
          <p style={{ fontSize: "0.65rem", color: "#5A5A5A", marginTop: 2 }}>
            FAQ 总数
          </p>
        </div>
        <div
          style={{
            position: "absolute",
            left: "34%",
            top: "56%",
            textAlign: "center",
            zIndex: 2,
          }}
        >
          <p
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#FFFFFF",
              lineHeight: 1,
              textShadow: "0 1px 4px rgba(0,0,0,0.3)",
            }}
          >
            {blobs[2].value}
          </p>
          <p style={{ fontSize: "0.65rem", color: "#F0D8D4", marginTop: 2 }}>
            文档总量
          </p>
        </div>
      </div>

      <div className="flex items-center gap-5">
        {[
          { label: "知识库", color: "#2A2A2A" },
          { label: "FAQ", color: "#F0C040" },
          { label: "文档", color: "#E85D4A" },
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
  );
}
