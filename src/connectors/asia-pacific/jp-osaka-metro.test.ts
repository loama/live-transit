import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { jpOsakaMetro, osakaIconState, parseOsakaMetro } from "./jp-osaka-metro";

const block = (icon: string, alt: string, line: string) => `
<div class="operationStatusArea"><dl><dd><ul>
<li><img class="cs-imagesSubway" src="/common/img/icon_operation_${icon}.svg" alt="${alt}"></li>
<li><img class="cs-lineNameImg" src="../common/img/img_top_m_en.svg" alt="${line}"></li></ul></dd></dl></div>`;

describe("jp-osaka-metro", () => {
  test("maps icons", () => {
    expect(osakaIconState("/common/img/icon_operation_normal.svg")).toBe("good");
    expect(osakaIconState("/common/img/icon_operation_delay.svg")).toBe("minor");
    expect(osakaIconState("/common/img/icon_operation_stop.svg")).toBe("suspended");
    expect(osakaIconState("/x.svg")).toBe("unknown");
  });

  test("creates an alert for a delayed line", () => {
    const r = parseOsakaMetro(block("delay", "Delay", "Midosuji Line"));
    expect(r.lines[0]).toMatchObject({ lineId: "m", status: "minor" });
    expect(r.alerts[0].id).toBe("m:minor");
  });

  test("live page", async () => {
    const r = await runConnector(jpOsakaMetro);
    expect(r.lines!.some((l) => l.lineName === "Midosuji Line")).toBe(true);
    expect(r.lines!.length).toBeGreaterThanOrEqual(8);
  }, 30_000);
});
