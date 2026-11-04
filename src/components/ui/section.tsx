import type { ReactNode } from "react";
import Link from "next/link";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Section({ title, hint, href, hrefLabel = "View all", children }: {
  title: string; hint?: ReactNode; href?: string; hrefLabel?: string; children: ReactNode;
}) {
  return (
    <section className="py-6 sm:py-8">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
        </div>
        {href && (
          <Link href={href} className="shrink-0 text-sm text-muted hover:text-fg">{hrefLabel} &rarr;</Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="border-b border-border pb-6 pt-8 sm:pt-12">
      {eyebrow && <p className="mb-2 text-xs font-medium uppercase tracking-widest text-faint">{eyebrow}</p>}
      <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-pretty text-muted">{children}</div>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-surface ${className}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}

export function Skeleton({ className = "h-40" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}
