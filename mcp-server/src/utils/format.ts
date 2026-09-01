export function jsonBlock(data: unknown): string {
  return '```json\n' + JSON.stringify(data, null, 2) + '\n```'
}

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
