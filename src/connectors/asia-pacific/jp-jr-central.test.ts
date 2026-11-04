import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { jpJrCentral, jrCentralState, parseJrCentral } from "./jp-jr-central";

describe("jp-jr-central", () => {
  test("maps statuses", () => {
    expect(jrCentralState(["運転見合わせ"], false)).toBe("suspended");
    expect(jrCentralState(["遅れ／運休あり"], false)).toBe("minor");
    expect(jrCentralState(["運休あり"], true)).toBe("major");
    expect(jrCentralState([], false)).toBe("good");
  });

  test("matches events to lines", () => {
    const master = {
      lst: [
        { ryokakuSenkuCd: "050010", ryokakuSenkuMei: "Tokaido Line", senkuKbn: "1", ryokakuSenkuKaishiShuryoEki: "Atami～Toyohashi" },
        { ryokakuSenkuCd: "050030", ryokakuSenkuMei: "Chuo Line", senkuKbn: "1", ryokakuSenkuKaishiShuryoEki: "Nagoya～Shiojiri" },
      ],
    };
    const op = {
      check: "1",
      events: [
        {
          imp_line: [{ lang: "en", name: "Tokaido Line(Atami～Toyohashi)" }],
          status: [{ lang: "ja", name: "運転見合わせ" }, { lang: "en", name: "Suspended" }],
        },
      ],
    };
    const r = parseJrCentral(master, op);
    expect(r.lines[0].status).toBe("suspended");
    expect(r.lines[1].status).toBe("good");
    expect(r.alerts).toHaveLength(1);
  });

  test("live feed lists conventional and express lines", async () => {
    const r = await runConnector(jpJrCentral);
    expect(r.lines!.length).toBeGreaterThanOrEqual(15);
    expect(r.lines!.some((l) => l.lineName.startsWith("Tokaido Line"))).toBe(true);
  }, 45_000);
});
