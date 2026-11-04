"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the server components on the page every `seconds` while the tab is visible. */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.hidden || Date.now() - last < seconds * 1000 - 500) return;
      last = Date.now();
      router.refresh();
    };
    const t = setInterval(refresh, seconds * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", refresh); };
  }, [router, seconds]);
  return null;
}
