import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { conditionState, jpJrWest, parseJrWest } from "./jp-jr-west";

describe("jp-jr-west", () => {
  test("maps condition names", () => {
    expect(conditionState("運転見合わせ")).toBe("suspended");
    expect(conditionState("運転取り止め")).toBe("major");
    expect(conditionState("遅延")).toBe("minor");
    expect(conditionState("お知らせ")).toBe("good");
  });

  test("builds line state and alerts from a fixture", () => {
    const feed = {
      masterData: { areas: [{ id: 2, name: "x", places: [{ lines: [{ id: 20, name: "大和路線" }, { id: 21, name: "阪和線" }] }] }] },
      areaTrafficInfos: [
        {
          id: 2,
          dailyData: [
            {
              date: "2026-11-05",
              placeTrafficInfos: [
                {
                  id: 1,
                  conventionalLineTrafficInfos: [
                    {
                      id: 20,
                      lineName: "大和路線",
                      conventionalLineTrafficInfoDetails: [
                        { trafficId: 13035, conditionName: "遅延", cause: "沿線の確認", versionDetail: [{ title: "遅れ", body: "b" }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const r = parseJrWest(feed, new Date("2026-11-04T16:00:00Z"));
    expect(r.lines.find((l) => l.lineId === "20")?.status).toBe("minor");
    expect(r.lines.find((l) => l.lineId === "21")?.status).toBe("good");
    expect(r.alerts[0].id).toBe("13035");
  });

  test("live feed", async () => {
    const r = await runConnector(jpJrWest);
    expect(r.lines!.length).toBeGreaterThan(40);
  }, 45_000);
});
