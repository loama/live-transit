"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

interface Change { id: string; subject: string; subjectId: string; subjectName: string; from: string | null; to: string; text: string | null; sourceName: string; url: string }

const CHANGED = "live-updates:notify";
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(CHANGED, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHANGED, cb);
  };
};
const enabled = (key: string) => typeof Notification !== "undefined" && Notification.permission === "granted" && localStorage.getItem(key) === "1";

const describe = (c: Change) =>
  c.subject === "alert" ? `${c.to === "opened" ? "New alert" : "Alert resolved"}: ${c.subjectName}` : `${c.subjectName}: ${c.from ?? "new"} to ${c.to}`;

/**
 * Follows the change stream for one network (or one of its lines): refreshes the page as soon as a change is
 * ingested, and with "Notify me" on, shows a browser notification for each change while the page is open.
 */
export function LiveUpdates({ sourceId, lineId, label }: { sourceId: string; lineId?: string; label: string }) {
  const router = useRouter();
  const key = `notify:${sourceId}:${lineId ?? ""}`;
  const supported = useSyncExternalStore(subscribe, () => typeof Notification !== "undefined", () => false);
  const notify = useSyncExternalStore(subscribe, () => enabled(key), () => false);

  useEffect(() => {
    const es = new EventSource(`/api/v1/stream?sourceId=${encodeURIComponent(sourceId)}`);
    let t: ReturnType<typeof setTimeout> | undefined;
    es.addEventListener("change", (m) => {
      const c = JSON.parse((m as MessageEvent).data) as Change;
      if (lineId && !(c.subject === "line" && c.subjectId === lineId) && c.subject !== "alert") return;
      clearTimeout(t);
      t = setTimeout(() => router.refresh(), 500);
      if (enabled(key) && document.visibilityState !== "visible") {
        const n = new Notification(c.sourceName, { body: describe(c), tag: `${c.subject}:${c.subjectId}` });
        n.onclick = () => { window.focus(); n.close(); };
      }
    });
    return () => {
      clearTimeout(t);
      es.close();
    };
  }, [sourceId, lineId, router, key]);

  if (!supported) return null;
  const toggle = async () => {
    if (notify) localStorage.removeItem(key);
    else if ((await Notification.requestPermission()) === "granted") localStorage.setItem(key, "1");
    window.dispatchEvent(new Event(CHANGED));
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={notify}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${notify ? "border-fg bg-fg text-bg" : "border-border text-muted hover:text-fg"}`}
      title={notify ? "Notifications on while this page is open" : `Get a browser notification when ${label} changes`}>
      <span aria-hidden>{notify ? "●" : "○"}</span>{notify ? "Notifying" : "Notify me"}
    </button>
  );
}
