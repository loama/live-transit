import Link from "next/link";
import { Logo } from "@/components/ui/icons";
import { NAV } from "@/data/site";
import { ThemeToggle } from "./theme-toggle";
import { PaletteTrigger } from "./command-palette";

const linkCls = "shrink-0 rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo />
          <span>Live Transit</span>
        </Link>
        <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.slice(1).map((n) => <Link key={n.href} href={n.href} className={linkCls}>{n.label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <PaletteTrigger />
          <ThemeToggle />
        </div>
      </div>
      <nav aria-label="Primary mobile" className="flex gap-1 overflow-x-auto border-t border-border px-3 py-1 md:hidden">
        {NAV.slice(1).map((n) => <Link key={n.href} href={n.href} className={linkCls}>{n.label}</Link>)}
      </nav>
    </header>
  );
}
