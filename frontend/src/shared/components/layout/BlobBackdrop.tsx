/**
 * 背景高斯模糊光晕层（Glassmorphism backdrop）
 *
 * 用法：
 *   <div className="relative ...">
 *     <BlobBackdrop variant="warm" />
 *     <main className="relative z-10">...</main>
 *   </div>
 *
 * 配色严格对齐项目现有暖米色 / 学生端冷灰蓝主题，不引入新色调。
 */

import { useEffect, useState } from 'react';

type Variant = 'warm' | 'cool';

interface BlobBackdropProps {
  variant?: Variant;
  /** 强度档位：subtle 用于内页，hero 用于登录等门面页 */
  intensity?: 'subtle' | 'hero';
  className?: string;
}

interface Blob {
  size: number;
  position: React.CSSProperties;
  color: string;
  blur: number;
  anim: string;
  duration: string;
  delay?: string;
}

// 4 个 idle 动画 + 互质周期（53/67/79/89 全为质数）+ 大随机起步偏移
// → 三球永不同步重复构图，肉眼几乎察觉不到运动但又"活着"
const WARM_BLOBS: Blob[] = [
  // 琥珀金 - 微调：降透明度，增模糊
  {
    size: 550,
    position: { left: '-5%', top: '-10%' },
    color: 'rgba(255, 200, 50, 0.65)',
    blur: 60,
    anim: 'blobIdleA',
    duration: '48s',
    delay: '-5s',
  },
  // 珊瑚红
  {
    size: 520,
    position: { right: '2%', top: '15%' },
    color: 'rgba(255, 90, 60, 0.55)',
    blur: 70,
    anim: 'blobIdleB',
    duration: '55s',
    delay: '-15s',
  },
  // 墨灰
  {
    size: 450,
    position: { left: '30%', bottom: '-5%' },
    color: 'rgba(40, 35, 30, 0.35)',
    blur: 65,
    anim: 'blobIdleC',
    duration: '65s',
    delay: '-25s',
  },
  // 环境补色
  {
    size: 420,
    position: { right: '15%', bottom: '5%' },
    color: 'rgba(100, 150, 255, 0.35)',
    blur: 60,
    anim: 'blobIdleD',
    duration: '58s',
    delay: '-10s',
  },
];

const COOL_BLOBS: Blob[] = [
  {
    size: 550,
    position: { left: '-5%', top: '-10%' },
    color: 'rgba(60, 140, 255, 0.55)',
    blur: 60,
    anim: 'blobIdleA',
    duration: '48s',
  },
  {
    size: 500,
    position: { right: '5%', top: '20%' },
    color: 'rgba(160, 100, 255, 0.45)',
    blur: 70,
    anim: 'blobIdleB',
    duration: '55s',
  },
];

export default function BlobBackdrop({
  variant = 'warm',
  intensity = 'subtle',
  className = '',
}: BlobBackdropProps) {
  const blobs = variant === 'cool' ? COOL_BLOBS : WARM_BLOBS;
  const scale = intensity === 'hero' ? 1.4 : 1;
  const targetOpacity = 1; // 全力显示

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{
        opacity: mounted ? targetOpacity : 0,
        transition: 'opacity 1.5s cubic-bezier(0.25, 1, 0.5, 1)',
        backgroundColor: 'var(--color-background)',
      }}
    >
      {blobs.map((b, i) => (
        <div
          key={i}
          className="blob-idle absolute rounded-full will-change-transform"
          style={{
            width: b.size * scale,
            height: b.size * scale,
            // 核心更实，消散更慢
            background: `radial-gradient(circle at 45% 45%, ${b.color} 0%, transparent 85%)`,
            filter: `blur(${b.blur}px)`,
            mixBlendMode: 'normal',
            animation: `${b.anim} ${b.duration} ease-in-out ${b.delay ?? '0s'} infinite`,
            ...b.position,
          }}
        />
      ))}
    </div>
  );
}
