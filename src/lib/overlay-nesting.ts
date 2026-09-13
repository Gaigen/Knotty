/** Селектор порталов Radix/shadcn, которые рендерятся вне DialogContent */
export const NESTED_PORTAL_SELECTOR = [
  '[data-slot="popover-content"]',
  '[data-slot="select-content"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="alert-dialog-content"]',
].join(',')

export function isNestedPortalTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(NESTED_PORTAL_SELECTOR)
}
