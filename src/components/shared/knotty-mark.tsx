/** Логотип Knotty — пересекающиеся петли (узел / связи на графе) */
export function KnottyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <path
        d="M11 13.5a5 5 0 0 1 9.2-2.2M21 18.5a5 5 0 0 1-9.2 2.2"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M13.5 11a5 5 0 0 1 2.2 9.2M18.5 21a5 5 0 0 1-2.2-9.2"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
