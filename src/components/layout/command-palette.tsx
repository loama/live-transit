"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import { PaletteResults, hitHref, type Hit } from "./palette-results";

const OPEN_EVENT = "lt:open-palette";

export function openPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function PaletteTrigger({ variant = "compact" }: { variant?: "compact" | "hero" }) {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  const base = "flex items-center gap-2 border border-border bg-surface text-muted hover:border-border-strong hover:text-fg";
  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        className={variant === "hero"
          ? `${base} h-12 w-full max-w-xl rounded-xl px-4 text-left text-base shadow-sm`
          : `${base} h-9 rounded-lg px-2.5 text-sm`}
        aria-label="Search networks, stations, lines and alerts"
      >
        <Icon name="search" />
        <span className={variant === "hero" ? "flex-1" : "hidden sm:inline"}>
          {variant === "hero" ? "Search a city, airport, line or flight number" : "Search"}
        </span>
        <kbd className="hidden rounded border border-border px-1.5 text-xs text-faint sm:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      {variant === "compact" && <CommandPalette />}
    </>
  );
}

function CommandPalette() {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const open = useCallback(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (ref.current?.open) ref.current.close(); else open();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, open);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_EVENT, open); };
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setState("idle"); return; }
    setState("loading");
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/search?q=${encodeURIComponent(term)}&limit=12`, { signal: ctl.signal });
        if (!r.ok) throw new Error(String(r.status));
        setHits((await r.json()).data as Hit[]);
        setActive(0);
        setState("idle");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setState("error");
      }
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const pick = (h: Hit) => { ref.current?.close(); router.push(hitHref(h)); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && hits[active]) { e.preventDefault(); pick(hits[active]); }
  };

  return (
    <dialog
      ref={ref}
      aria-label="Search"
      onClose={() => { setQ(""); setHits([]); }}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      className="m-0 mx-auto mt-[12vh] w-[min(40rem,calc(100vw-1.5rem))] rounded-2xl border border-border-strong bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Icon name="search" className="text-faint" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="palette-list"
          aria-activedescendant={hits.length ? `palette-opt-${active}` : undefined}
          aria-label="Search networks, stations, lines and alerts"
          placeholder="Search a city, airport, line or alert"
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none focus-visible:outline-none placeholder:text-faint"
        />
        <kbd className="rounded border border-border px-1.5 text-xs text-faint">Esc</kbd>
      </div>
      {hits.length > 0 && <PaletteResults hits={hits} active={active} onPick={pick} onHover={setActive} />}
      <p className="px-4 py-3 text-sm text-muted" role="status">
        {state === "error" ? "Search is unavailable right now. Try again in a moment."
          : state === "loading" && !hits.length ? "Searching..."
          : q.trim().length >= 2 && !hits.length ? `No results for "${q.trim()}".`
          : hits.length ? "Use arrow keys to move, Enter to open."
          : "Type at least two characters. Try a city, an IATA code like LHR, or a line name."}
      </p>
    </dialog>
  );
}
