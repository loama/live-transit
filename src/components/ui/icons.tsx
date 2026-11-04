import type { ReactNode, SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...p }: P & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      {children}
    </svg>
  );
}

const PATHS: Record<string, ReactNode> = {
  air: <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />,
  rail: <><rect x="6" y="3" width="12" height="14" rx="3" /><path d="M6 11h12M9 20l-2 1.500M15 20l2 1.500M9.500 14.500h.01M14.500 14.500h.01" /></>,
  metro: <><rect x="5" y="4" width="14" height="13" rx="3" /><path d="M5 11h14M8 21l2-4M16 21l-2-4M9 14h.01M15 14h.01" /></>,
  tram: <><rect x="6" y="6" width="12" height="11" rx="2.500" /><path d="M6 12h12M9 3l3 3 3-3M8 21l1-4M16 21l-1-4" /></>,
  bus: <><rect x="4" y="4" width="16" height="13" rx="2.500" /><path d="M4 11h16M7 17v3M17 17v3M8 14h.01M16 14h.01" /></>,
  ferry: <><path d="M4 16l2 4h12l2-4-8-3-8 3ZM12 13V6M9 8h6M3 22c3 0 3-1 6-1s3 1 6 1 3-1 6-1" /></>,
  cable: <><path d="M3 5l18 4M12 7v4" /><rect x="8" y="11" width="8" height="7" rx="1.500" /></>,
  other: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  search: <><circle cx="11" cy="11" r="6.500" /><path d="m20 20-4.500-4.500" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.900 4.900l1.400 1.400M17.700 17.700l1.400 1.400M2 12h2M20 12h2M4.900 19.100l1.400-1.400M17.700 6.300l1.400-1.400" /></>,
  moon: <path d="M20 14.500A8 8 0 0 1 9.500 4 8 8 0 1 0 20 14.500Z" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>,
  check: <path d="m5 12.500 4.500 4.500L19 7" />,
  alert: <><path d="M12 3 2.500 20h19L12 3Z" /><path d="M12 10v4.500M12 17.500h.01" /></>,
};

export function Icon({ name, size = 16, ...p }: P & { name: string; size?: number }) {
  return <Svg width={size} height={size} {...p}>{PATHS[name] ?? PATHS.other}</Svg>;
}

export function ModeIcon({ mode, size = 16, ...p }: P & { mode: string; size?: number }) {
  return <Icon name={mode in PATHS ? mode : "other"} size={size} {...p} />;
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M8 21h16M8 21a3 3 0 0 1 3-3h10M11 11h10" stroke="var(--bg)" strokeWidth="2.400" strokeLinecap="round" fill="none" />
      <circle cx="22.500" cy="11" r="2" fill="var(--good)" />
    </svg>
  );
}
