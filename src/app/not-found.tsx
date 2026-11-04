import Link from "next/link";
import { Container } from "@/components/ui/section";

export default function NotFound() {
  return (
    <Container className="py-24">
      <meta name="robots" content="noindex" />
      <p className="font-mono text-sm tracking-widest text-faint">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Nothing on this line</h1>
      <p className="mt-3 max-w-md text-muted">
        That network, airport or page does not exist, or it is not connected yet. Try searching, or browse what we cover.
      </p>
      <div className="mt-6 flex gap-3 text-sm">
        <Link href="/" className="rounded-lg bg-fg px-4 py-2 font-medium text-bg hover:opacity-90">Back to overview</Link>
        <Link href="/coverage" className="rounded-lg border border-border-strong px-4 py-2 font-medium hover:bg-surface-2">Browse coverage</Link>
      </div>
    </Container>
  );
}
