"use client";
import { useEffect, useState } from "react";

/** "● 214 vehicles now · live from operator · updated 4s ago", ticking every second. */
export function LiveBadge({ count, live, realtime, updatedAt, error }: {
  count: number; live: boolean; realtime: boolean; updatedAt: number | null; error?: boolean;
}) {
  // updatedAt is null until the first client-side poll, so the server never renders an age.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const age = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const source = live ? "live from the operator" : realtime ? "connecting to the operator feed" : "refreshed every minute";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5" aria-live="polite">
      <span aria-hidden className={`size-2 rounded-full ${error ? "bg-minor" : "live-dot bg-good"}`} />
      <span className="num font-medium text-fg">{count.toLocaleString("en-US")}</span>
      {count === 1 ? "vehicle" : "vehicles"} reporting, {error ? "last update failed, retrying" : source}
      {age !== null && !error && <span className="num">· updated {age < 2 ? "just now" : `${age}s ago`}</span>}
    </span>
  );
}
