import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { ieDublinLuas, lineStateFromMessage, parseStop } from "./ie-dublin-luas";

describe("ie-dublin-luas", () => {
  test("message mapping", () => {
    expect(lineStateFromMessage("Green Line services operating normally")).toBe("good");
    expect(lineStateFromMessage("Red Line services suspended between X and Y")).toBe("suspended");
    expect(lineStateFromMessage("Delays on the Red Line")).toBe("minor");
  });
  test("single tram parses to object", () => {
    const s = parseStop('<stopInfo created="2026-11-04T16:00:00" stop="X" stopAbv="X"><message>ok</message><direction name="Inbound"><tram dueMins="3" destination="A" /></direction></stopInfo>');
    expect(s?.direction).toMatchObject({ name: "Inbound" });
  });
  test("live feed", async () => {
    const r = await runConnector(ieDublinLuas);
    expect(r.lines!.length).toBe(2);
    expect(r.departures!.length).toBeGreaterThan(5);
    expect(new Set(r.departures!.map((d) => d.id)).size).toBe(r.departures!.length);
  }, 45_000);
});
