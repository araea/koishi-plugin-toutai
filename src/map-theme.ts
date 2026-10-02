import { lch } from './m3'
import { CINNABAR, HUE, SCHEME } from './theme'

/** 地图与其余各图同一套方案，保留旧名字供校验脚本引用。 */
export const MAP_SCHEME = SCHEME

/**
 * 地图色。水面取冷灰蓝、陆地取暖白：冷暖相对，海岸线不靠描边也分得清。
 * 本次落点是朱砂，与朱印同色；旧迹用赤金色阶，二者色相与明度都拉开，
 * 灰度或色觉差异下仍可由明度区分。
 */
export const MAP_COLORS = {
  water: lch(90, 8, 232),
  land: SCHEME.surface,
  boundary: lch(76, 10, HUE),
  label: SCHEME.onSurface,
  selected: CINNABAR,
  onSelected: lch(99, 3, 30),
  marker: SCHEME.onSurface,
  markerHalo: SCHEME.surfaceContainerLowest,
} as const

/**
 * 旧迹色阶：明度单调下降（93 → 70）、彩度渐浓；文字始终是墨色，任何一档都读得清。
 * 终点停在 70：再深，朱砂落点就压不住它（要 ≥ 3:1），选区只剩色相在区分。
 */
export function heatColor(ratio: number): string {
  const t = Math.sqrt(Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0)))
  return lch(93 - t * 23, 30 + t * 10, 82)
}

// CSS 图例与画布用同一条采样色阶，两端不会各是一套 RGB 插值。
export const HEAT_RAMP = Array.from({ length: 9 }, (_, i) => `${heatColor(i / 8)} ${i * 12.5}%`).join(', ')
