import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { overview } from "@/db/queries";

export const alt = "Live Transit, a global real-time status board for public transport";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function stats() {
  try {
    const o = await overview();
    return [
      [o.sources.live.toLocaleString("en-US"), "live sources"],
      [o.countries.toLocaleString("en-US"), "countries"],
      [o.activeAlerts.toLocaleString("en-US"), "active disruptions"],
    ];
  } catch {
    return [];
  }
}

export default async function Image() {
  await connection();
  const items = await stats();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#0b0b0a", color: "#f1f1ee", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 600 }}>
          <div style={{ width: 20, height: 20, borderRadius: 10, background: "#4ade80", display: "flex" }} />
          Live Transit
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.04, letterSpacing: -2 }}>Every public transport network, live.</div>
          <div style={{ fontSize: 30, color: "#a3a39b" }}>Metros, trains, buses, ferries and airport boards from official sources.</div>
        </div>
        <div style={{ display: "flex", gap: 56 }}>
          {items.map(([n, l]) => (
            <div key={l} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 56, fontWeight: 700 }}>{n}</div>
              <div style={{ fontSize: 24, color: "#a3a39b" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
