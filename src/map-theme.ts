import { lch, lchOf, scheme } from './m3'

/** Map component tokens, derived from the shared M3/HCT implementation. */
export const MAP_SCHEME = scheme(175)
const historyHue = lchOf(MAP_SCHEME.secondaryContainer).hue
export const MAP_COLORS = {
  water: MAP_SCHEME.surfaceContainerLow,
  land: MAP_SCHEME.surfaceContainerHighest,
  boundary: MAP_SCHEME.outline,
  label: MAP_SCHEME.onSurface,
  selected: MAP_SCHEME.primary,
  onSelected: MAP_SCHEME.onPrimary,
  marker: MAP_SCHEME.onSurface,
  markerHalo: MAP_SCHEME.surfaceContainerLowest,
} as const

/** A restrained, monotonic HCT scale; all labels remain dark and readable. */
export function heatColor(ratio: number): string {
  const t = Math.sqrt(Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0)))
  return lch(90 - t * 16, 20, historyHue)
}

// CSS and Canvas use the same sampled ramp, avoiding RGB-only legend endpoints.
export const HEAT_RAMP = Array.from({ length: 9 }, (_, i) => `${heatColor(i / 8)} ${i * 12.5}%`).join(', ')
