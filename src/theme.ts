import { lch, scheme } from './m3'

/**
 * 《轮回簿》的配色：一页暖白的纸，墨色正文。
 *
 * 主色相取 76（琥珀赭）：中性面由它推出，落在 #fff5ec 一类的暖白上。
 * 色相 30～50 的中性面会带粉，整张图像罩了一层肉色滤镜，所以不取。
 * 地图与所有列表图共用这一套方案，不再各用一支色相。
 */
export const HUE = 76
export const SCHEME = scheme(HUE, false, { tertiaryShift: -60 })

export type Tone = 'azure' | 'rose' | 'jade' | 'cinnabar' | 'gold' | 'ink'

/**
 * 语义色相。含义固定：青蓝属男、玫红属女、松绿为生、朱砂为殁、赤金为序。
 * 玫红取 352 而非 12：夭折（朱砂）与女孩常常同页出现，两者不能同是粉。
 */
export const TONE_HUES = { azure: 252, rose: 352, jade: 160, cinnabar: 30, gold: 78 } as const

export interface ToneRoles {
  /** 实色：进度条、圆点。对容器与白纸都要满足非文字的 3:1。 */
  solid: string
  /** 浅容器：色块底色。 */
  container: string
  /** 容器上的文字与数字，≥ 7:1。 */
  on: string
}

/** ink 不是语义色：容器取纸面的浅一档，实色取主色，文字取墨色。 */
export function toneRoles(tone: Tone): ToneRoles {
  if (tone === 'ink') {
    return { solid: SCHEME.primary, container: SCHEME.surfaceContainerLow, on: SCHEME.onSurface }
  }
  const hue = TONE_HUES[tone]
  return { solid: lch(40, 50, hue), container: lch(92, 16, hue), on: lch(22, 36, hue) }
}

export const TONE_CSS = (['azure', 'rose', 'jade', 'cinnabar', 'gold', 'ink'] as const)
  .map((tone) => {
    const { solid, container, on } = toneRoles(tone)
    return `.t-${tone}{--tone:${solid};--tone-container:${container};--on-tone:${on}}`
  })
  .join('\n')

/** 朱砂：印章与地图上的本次落点是同一支红。明度 38 是为了压住最深一档旧迹色阶（见 map-theme）。 */
export const CINNABAR = lch(38, 62, 30)

/** 朱印：朱砂底、近白字。 */
export const SEAL = { background: CINNABAR, foreground: lch(99, 3, 30) } as const
