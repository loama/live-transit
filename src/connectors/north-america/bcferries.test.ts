import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { bcFerries, parseRoute } from "./bcferries";

const html = `<title> Vancouver (Tsawwassen) - Victoria (Swartz Bay) Status | BC Ferries</title><table>
<tr class="mobile-friendly-row"><td><p><span>7:00 am</span><span class="font-italic">&nbsp;Departed&nbsp;7:09 am</span><a class="sailing-ferry-name"><br>Spirit of British Columbia</a></p></td><td><div class="cc-message-updates"><span>Arrived: 8:36 am</span></div></td></tr>
<tr class="mobile-friendly-row"><td><p><span>9:00 am</span><a class="sailing-ferry-name">Spirit of Vancouver Island</a></p></td><td><div class="cc-message-updates"><span>Full</span></div></td></tr>
<tr class="mobile-friendly-row"><td><p><span>7:00 am</span>&nbsp;(Tomorrow)<a class="sailing-ferry-name">X</a></p></td><td><div>18%</div></td></tr>
</table><a href="/current-conditions/service-notices?serviceNoticeCode=123"> Notice </a>`;

describe("bcferries", () => {
  test("parses a route page", () => {
    const r = parseRoute(html, "TSA-SWB", new Date("2026-11-04T16:00:00Z"));
    expect(r.departures).toHaveLength(3);
    const hour = 3_600_000;
    expect(r.departures[1].scheduledAt.getTime() - r.departures[0].scheduledAt.getTime()).toBe(2 * hour);
    expect(r.departures[0].status).toBe("arrived");
    expect(r.departures[0].delayMinutes).toBe(9);
    expect(r.departures[2].scheduledAt.getTime() - r.departures[0].scheduledAt.getTime()).toBe(24 * hour);
    expect(r.notices).toEqual([{ code: "123", title: "Notice" }]);
  });

  test("live", async () => {
    const r = await runConnector(bcFerries);
    expect(r.departures!.length).toBeGreaterThan(20);
  }, 45_000);
});
