/** Палитра рамок на канвасе */
export const GROUP_COLOR_PRESETS = [
  { id: 'teal', hex: '#0d9488', label: 'Бирюза' },
  { id: 'amber', hex: '#d97706', label: 'Янтарь' },
  { id: 'violet', hex: '#7c3aed', label: 'Фиолет' },
  { id: 'rose', hex: '#e11d48', label: 'Роза' },
  { id: 'blue', hex: '#2563eb', label: 'Синий' },
  { id: 'slate', hex: '#64748b', label: 'Серый' },
] as const

export const DEFAULT_GROUP_COLOR = GROUP_COLOR_PRESETS[0].hex

const HEX_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/

export function isValidGroupColor(color: string): boolean {
  return HEX_RE.test(color)
}

export function normalizeGroupColor(color: string | null | undefined): string {
  if (!color) return DEFAULT_GROUP_COLOR
  if (isValidGroupColor(color)) return color.toLowerCase()
  return DEFAULT_GROUP_COLOR
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

export function groupColorStyles(hex: string) {
  const c = normalizeGroupColor(hex)
  const { r, g, b } = hexToRgb(c)
  const rgba = (a: number) => `rgba(${r},${g},${b},${a})`
  return {
    borderColor: rgba(0.5),
    backgroundColor: rgba(0.06),
    backgroundCollapsed: rgba(0.1),
    badgeBg: rgba(0.15),
    headerText: c,
    resizerColor: c,
    handleBg: c,
    ringColor: rgba(0.5),
  }
}
