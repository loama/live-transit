"use client";
import { useState, useSyncExternalStore } from "react";
import { Icon } from "./icons";

const subscribe = () => () => {};
const clientOrigin = () => window.location.origin;
const serverOrigin = () => "https://your-domain";

/** Code block with a copy button. `{origin}` in `code` resolves to the site's own origin. */
export function CopyBlock({ code, label }: { code: string; label?: string }) {
  const origin = useSyncExternalStore(subscribe, clientOrigin, serverOrigin);
  const [done, setDone] = useState(false);
  const text = code.replaceAll("{origin}", origin);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {}
  }
  return (
    <div className="relative min-w-0 rounded-xl border border-border bg-bg">
      {label && <p className="border-b border-border px-4 py-2 text-xs text-muted">{label}</p>}
      <pre className="overflow-x-auto p-4 pr-14 font-mono text-[13px] leading-relaxed" tabIndex={0}>
        <code>{text}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={done ? "Copied" : "Copy to clipboard"}
        className="absolute right-2 top-2 grid size-8 place-items-center rounded-md border border-border bg-surface text-muted hover:text-fg"
        style={label ? { top: "2.75rem" } : undefined}
      >
        <Icon name={done ? "check" : "copy"} size={15} />
      </button>
      <span className="sr-only" role="status">{done ? "Copied to clipboard" : ""}</span>
    </div>
  );
}
