import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#151513", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ position: "absolute", left: 14, right: 14, top: 34, height: 6, background: "#fafaf9", borderRadius: 3, display: "flex" }} />
        <div style={{ position: "absolute", left: 14, width: 30, top: 21, height: 6, background: "#fafaf9", borderRadius: 3, display: "flex" }} />
        <div style={{ position: "absolute", right: 12, top: 17, width: 14, height: 14, background: "#4ade80", borderRadius: 7, display: "flex" }} />
      </div>
    ),
    size,
  );
}
