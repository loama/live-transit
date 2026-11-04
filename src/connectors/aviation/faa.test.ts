import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { faaNas, parseDurationMinutes, parseEndTime, parseFaa, parseFaaDate, parseNotamWindow } from "./faa";

const SAMPLE = `<AIRPORT_STATUS_INFORMATION><Update_Time>x</Update_Time>
<Delay_type><Name>Ground Delay Programs</Name><Ground_Delay_List><Ground_Delay><ARPT>SAN</ARPT><Reason>airport volume</Reason><Avg>37 minutes</Avg><Max>1 hour and 11 minutes</Max></Ground_Delay></Ground_Delay_List></Delay_type>
<Delay_type><Name>Ground Stop Programs</Name><Ground_Stop_List><Program><ARPT>EWR</ARPT><Reason>thunderstorms</Reason><End_Time>10:15 pm EDT</End_Time></Program></Ground_Stop_List></Delay_type>
<Delay_type><Name>General Arrival/Departure Delay Info</Name><Arrival_Departure_Delay_List><Delay><ARPT>ATL</ARPT><Reason>WX:Thunderstorms</Reason><Arrival_Departure Type="Departure"><Min>1 hour</Min><Max>1 hour and 30 minutes</Max><Trend>Increasing</Trend></Arrival_Departure></Delay></Arrival_Departure_Delay_List></Delay_type>
<Delay_type><Name>Airport Closures</Name><Airport_Closure_List><Airport><ARPT>LAX</ARPT><Reason>!LAX 05/277 LAX AD AP CLSD TO NON SKED TRANSIENT GA ACFT EXC 24HR PPR 2605271826-2705281600</Reason><Start>May 27 at 18:26 UTC.</Start><Reopen>May 28 at 16:00 UTC.</Reopen></Airport><Airport><ARPT>SNA</ARPT><Reason>!SNA 11/003 SNA AD AP CLSD DLY 0730-1415 2611030730-2611081415</Reason><Start>Nov 03 at 07:30 UTC.</Start><Reopen>Nov 08 at 14:15 UTC.</Reopen></Airport></Airport_Closure_List></Delay_type>
</AIRPORT_STATUS_INFORMATION>`;

describe("faa nas", () => {
  test("parses durations and dates", () => {
    expect(parseDurationMinutes("37 minutes")).toBe(37);
    expect(parseDurationMinutes("1 hour and 11 minutes")).toBe(71);
    expect(parseDurationMinutes("2 hours")).toBe(120);
    const now = new Date("2026-11-04T12:00:00Z");
    expect(parseFaaDate("Nov 08 at 14:15 UTC.", now)?.toISOString()).toBe("2026-11-08T14:15:00.000Z");
    expect(parseEndTime("10:15 pm EDT", now)?.toISOString()).toBe("2026-11-05T02:15:00.000Z");
  });

  test("maps programs, delays and closures", () => {
    const { stations, alerts } = parseFaa(SAMPLE, new Date("2026-11-04T10:00:00Z"));
    const by = Object.fromEntries(stations.map((s) => [s.stationId, s]));
    expect(by.SAN.status).toBe("delays");
    expect(by.SAN.delayMinutes).toBe(37);
    expect(by.EWR.status).toBe("major_delays");
    expect(by.EWR.lat).toBeCloseTo(40.69, 1);
    expect(by.ATL.status).toBe("major_delays");
    expect(by.LAX).toBeUndefined();
    expect(by.SNA.status).toBe("closed");
    expect(alerts.find((a) => a.id.startsWith("closure:LAX"))?.severity).toBe("info");
    const afternoon = parseFaa(SAMPLE, new Date("2026-11-04T16:00:00Z")).stations.find((s) => s.stationId === "SNA");
    expect(afternoon).toBeUndefined();
    const offHours = parseFaa(SAMPLE, new Date("2026-11-04T16:00:00Z")).alerts.find((a) => a.id.startsWith("closure:SNA"));
    expect(offHours?.severity).toBe("info");
    expect(offHours?.title).toContain("not in effect now");
    expect(parseFaa(SAMPLE, new Date("2026-11-04T10:00:00Z")).alerts.find((a) => a.id.startsWith("closure:SNA"))?.severity).toBe("severe");
    const lax = parseFaa(SAMPLE, new Date("2026-11-04T10:00:00Z")).alerts.find((a) => a.id.startsWith("closure:LAX"));
    expect(lax?.activeUntil?.toISOString()).toBe("2027-05-28T16:00:00.000Z");
    expect(parseNotamWindow("no dates here")).toBeUndefined();
  });

  test("rejects a response without the expected root", () => {
    expect(() => parseFaa("<html/>", new Date())).toThrow();
  });

  test("live feed parses", async () => {
    const r = await runConnector(faaNas);
    expect(Array.isArray(r.alerts)).toBe(true);
    expect(Array.isArray(r.stations)).toBe(true);
    console.log("FAA live", r.stations!.length, "stations", r.alerts!.length, "alerts");
  }, 30_000);
});
