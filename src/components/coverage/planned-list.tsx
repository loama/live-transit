import type { PlannedSource } from "@/lib/planned";
import { groupBy } from "@/data/derive";
import { Card } from "@/components/ui/section";
import { ModeIcon } from "@/components/ui/icons";
import { countryName, flag, safeHref } from "@/components/ui/format";

export function PlannedList({ items }: { items: PlannedSource[] }) {
  const groups = [...groupBy(items, (p) => p.country).entries()].sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0])));
  return (
    <section id="planned" className="scroll-mt-20 py-8">
      <h2 className="text-lg font-semibold tracking-tight">Coming next</h2>
      <p className="mb-4 mt-1 max-w-2xl text-sm text-muted">
        Official sources we know about but are not reading yet, usually because the operator requires a registered key.
        Each links to the operator&apos;s own page.
      </p>
      <details className="group rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Show all {items.length} planned sources in {groups.length} countries
        </summary>
        <div className="grid gap-4 border-t border-border p-4 md:grid-cols-2">
          {groups.map(([cc, list]) => (
            <Card key={cc} className="p-3">
              <h3 className="mb-2 text-sm font-medium"><span aria-hidden>{flag(cc)}</span> {countryName(cc)}</h3>
              <ul className="space-y-2">
                {list.map((p) => {
                  const href = safeHref(p.url);
                  return (
                    <li key={p.name} className="text-sm">
                      <span className="flex items-center gap-2">
                        <span className="flex gap-1 text-muted">{p.modes.slice(0, 3).map((m) => <ModeIcon key={m} mode={m} size={13} />)}</span>
                        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">{p.name} &#8599;</a> : p.name}
                      </span>
                      <span className="block text-xs text-muted">{p.reason}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      </details>
    </section>
  );
}
