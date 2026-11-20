import type { ReactNode } from 'react'

const paths = {
  ledger: <><rect x="3.5" y="3.5" width="17" height="17" rx="1" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  tables: <><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="M3 9h18M9 9v10" /></>,
  link: <><path d="M10 13a4 4 0 0 0 6 .5l3-3a4 4 0 0 0-6-6l-1 1" /><path d="M14 11a4 4 0 0 0-6-.5l-3 3a4 4 0 0 0 6 6l1-1" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3m-4 4v2" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></>,
  branch: <><path d="M6 4v16m12-16v4a4 4 0 0 1-4 4H6" /><circle cx="6" cy="4" r="1.5" /><circle cx="6" cy="20" r="1.5" /><circle cx="18" cy="4" r="1.5" /></>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12 4 4L19 6" />,
  repeat: <><path d="M5 8h13l-3-3m3 11H5l3 3" /><path d="M18 8v3M5 16v-3" /></>,
  exclude: <><circle cx="12" cy="12" r="7.5" /><path d="M8.5 12h7" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4M9 12h6m-6 4h6" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="1.5" /><path d="M16 8V4H4v12h4" /></>,
  external: <path d="M12 5h7v7m0-7-9 9m7-1v6H5V7h6" />,
} satisfies Record<string, ReactNode>

export function Icon({ name, size = 16, className }: { name: keyof typeof paths; size?: number; className?: string }) {
  return <svg className={className} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}
