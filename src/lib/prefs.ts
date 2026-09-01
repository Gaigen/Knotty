const PREFIX = 'knotty'
const LEGACY_PREFIX = 'verf'

/** Ключ localStorage с префиксом knotty (например knotty.graphSnap) */
export function prefKey(suffix: string): string {
  return `${PREFIX}.${suffix}`
}

export function prefGet(key: string): string | null {
  try {
    const v = localStorage.getItem(key)
    if (v !== null) return v
    if (key.startsWith(`${PREFIX}.`)) {
      return localStorage.getItem(`${LEGACY_PREFIX}.${key.slice(PREFIX.length + 1)}`)
    }
    return null
  } catch {
    return null
  }
}

export function prefSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore quota / private mode
  }
}
