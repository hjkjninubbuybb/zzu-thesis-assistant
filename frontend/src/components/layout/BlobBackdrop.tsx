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

import { useEffect, useState } from 'react'

type Variant = 'warm' | 'cool'

interface BlobBackdropProps {
  variant?: Variant
  /** 强度档位：subtle 用于内页，hero 用于登录等门面页 */
  intensity?: 'subtle' | 'hero'
  className?: string
}

interface Blob {
  size: number
  position: React.CSSProperties
  color: string
  blur: number
  anim: string
  duration: string
  delay?: string
}

// 4 个 idle 动画 + 互质周期（53/67/79/89 全为质数）+ 大随机起步偏移
// → 三球永不同步重复构图，肉眼几乎察觉不到运动但又"活着"
const WARM_BLOBS: Blob[] = [
  // 暖琥珀（呼应 Logo 黑 + 暖米背景）
  {
    size: 520,
    position: { left: '-8%', top: '-14%' },
    color: 'rgba(240, 192, 80, 0.55)',
    blur: 40,
    anim: 'blobIdleA',
    duration: '53s',
    delay: '-13s',
  },
  // 砖红（OverviewPage 已使用此色）
  {
    size: 480,
    position: { right: '-6%', top: '18%' },
    color: 'rgba(232, 110, 90, 0.42)',
    blur: 50,
    anim: 'blobIdleB',
    duration: '67s',
    delay: '-29s',
  },
  // 墨灰（深色锚点）
  {
    size: 420,
    position: { left: '32%', bottom: '-14%' },
    color: 'rgba(50, 46, 40, 0.32)',
    blur: 44,
    anim: 'blobIdleC',
    duration: '79s',
    delay: '-41s',
  },
  // 冷灰中和暖色，避免发糊
  {
    size: 380,
    position: { right: '22%', bottom: '-8%' },
    color: 'rgba(125, 138, 160, 0.30)',
    blur: 48,
    anim: 'blobIdleD',
    duration: '89s',
    delay: '-7s',
  },
]

const COOL_BLOBS: Blob[] = [
  // 学生端：靛蓝主调
  {
    size: 520,
    position: { left: '-8%', top: '-14%' },
    color: 'rgba(96, 130, 240, 0.40)',
    blur: 40,
    anim: 'blobIdleA',
    duration: '53s',
    delay: '-13s',
  },
  // 紫
  {
    size: 460,
    position: { right: '-6%', top: '16%' },
    color: 'rgba(150, 110, 220, 0.35)',
    blur: 50,
    anim: 'blobIdleB',
    duration: '67s',
    delay: '-29s',
  },
  // 青
  {
    size: 400,
    position: { left: '34%', bottom: '-12%' },
    color: 'rgba(80, 180, 200, 0.32)',
    blur: 44,
    anim: 'blobIdleC',
    duration: '79s',
    delay: '-41s',
  },
  // 浅粉点缀
  {
    size: 360,
    position: { right: '24%', bottom: '-8%' },
    color: 'rgba(232, 150, 200, 0.28)',
    blur: 48,
    anim: 'blobIdleD',
    duration: '89s',
    delay: '-7s',
  },
]

export default function BlobBackdrop({
  variant = 'warm',
  intensity = 'subtle',
  className = '',
}: BlobBackdropProps) {
  const blobs = variant === 'cool' ? COOL_BLOBS : WARM_BLOBS
  // hero 模式整体放大并提高饱和
  const scale = intensity === 'hero' ? 1.35 : 1
  const targetOpacity = intensity === 'hero' ? 1 : 0.85

  // 挂载后再淡入到目标透明度，避免色块"砰"地出现
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{
        opacity: mounted ? targetOpacity : 0,
        transition: 'opacity 1.2s cubic-bezier(0.25, 1, 0.5, 1)',
      }}
    >
      {blobs.map((b, i) => (
        <div
          key={i}
          className="blob-idle absolute rounded-full will-change-transform"
          style={{
            width: b.size * scale,
            height: b.size * scale,
            background: `radial-gradient(circle at 50% 50%, ${b.color} 0%, transparent 70%)`,
            filter: `blur(${b.blur}px)`,
            animation: `${b.anim} ${b.duration} ease-in-out ${b.delay ?? '0s'} infinite`,
            ...b.position,
          }}
        />
      ))}
    </div>
  )
}
