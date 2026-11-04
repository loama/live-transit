import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { casatramway, effectFromLabel, parseAffectedLines, parseLineAlerts } from "./casatramway";

const LIST = `<div><div class="mb-sm"><h3><div class="field field--name">Lignes Tramway</div></h3></div>
<div class="views-alerts-lignes"><div><span data-nid="136" title="T2">T2</span></div></div></div>`;
const LINE = `<div class="views-alert-page--ongoing views-alert-page"><article class="card" data-element-url="/se-deplacer/infos-trafic/x-21">
<p class="field field--field-effect"><span class="tag">Retards significatifs</span></p><h4><a><span>Ligne 2 perturbee</span></a></h4>
<time itemprop="startDate" datetime="2026-11-04T15:02:00+0100">04/11/2026</time></article></div>`;

describe("casatramway", () => {
  test("parses affected lines and cards", () => {
    expect(parseAffectedLines(LIST)).toEqual([{ nid: "136", name: "T2", mode: "tram" }]);
    const [c] = parseLineAlerts(LINE);
    expect(c.startsAt!.toISOString()).toBe("2026-11-04T14:02:00.000Z");
    expect(c.planned).toBe(false);
    expect(effectFromLabel(c.effectLabel)).toEqual({ effect: "SIGNIFICANT_DELAYS", severity: "major" });
  });

  test("live page answers", async () => {
    const r = await runConnector(casatramway);
    for (const a of r.alerts!) {
      expect(a.url).toContain("casatramway.ma");
      expect(a.routes!.length).toBeGreaterThan(0);
    }
  }, 60_000);
});
