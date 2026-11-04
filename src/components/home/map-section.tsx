import { getSources } from "@/data/cached";
import { toMapSources } from "@/data/derive";
import { WorldMap } from "@/components/map/world-map";

export async function MapSection() {
  const sources = await getSources({});
  const pts = toMapSources(sources);
  return (
    <div>
      <WorldMap sources={pts} className="h-[360px] sm:h-[460px]" />
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Map legend">
        {[["bg-good", "Running normally"], ["bg-minor", "Minor disruption"], ["bg-major", "Major disruption"], ["bg-unknown", "Stale or failing feed"]].map(([c, l]) => (
          <li key={l} className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${c}`} />{l}</li>
        ))}
        <li className="ml-auto">{pts.length} sources on the map</li>
      </ul>
    </div>
  );
}
