/** Фокус в поле ввода — глобальные hotkey не срабатывают */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}
