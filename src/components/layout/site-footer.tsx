import Link from "next/link";
import { NAV } from "@/data/site";

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-border">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 text-sm text-muted sm:px-6 md:grid-cols-[1fr_auto]">
        <div className="max-w-xl space-y-2">
          <p className="font-medium text-fg">Live Transit</p>
          <p>
            Status data comes from official operator feeds and open data portals. Every network page names its
            source and links back to the operator. We are not affiliated with any operator and this is not a
            substitute for official safety information.
          </p>
        </div>
        <ul className="flex flex-wrap content-start gap-x-5 gap-y-2">
          {NAV.map((n) => <li key={n.href}><Link href={n.href} className="hover:text-fg">{n.label}</Link></li>)}
          <li><Link href="/about" className="hover:text-fg">About</Link></li>
        </ul>
      </div>
    </footer>
  );
}
