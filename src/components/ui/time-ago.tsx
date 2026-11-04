"use client";
import { useEffect, useState } from "react";
import { timeAgo } from "./format";

/** Renders a relative time that keeps ticking after hydration. */
export function TimeAgo({ iso, className }: { iso: string | null; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time dateTime={iso ?? undefined} className={className} title={iso ?? undefined} suppressHydrationWarning>
      {now === null ? timeAgo(iso) : timeAgo(iso, now)}
    </time>
  );
}
