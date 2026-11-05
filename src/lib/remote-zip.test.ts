import { describe, expect, test } from "bun:test";
import { deflateRawSync } from "node:zlib";
import { RemoteZip } from "./remote-zip";
import { readStaticGtfs } from "./gtfs-static";

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(files: Array<{ name: string; data: string; method?: 0 | 8 }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const { name, data, method = 8 } of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const dataBytes = Buffer.from(data, "utf8");
    const compressed = method === 8 ? deflateRawSync(dataBytes) : dataBytes;
    const crc = crc32(dataBytes);

    const local = Buffer.alloc(30 + nameBytes.length + compressed.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(dataBytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);
    compressed.copy(local, 30 + nameBytes.length);
    locals.push(local);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(dataBytes.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);

    offset += local.length;
  }

  const cdSize = centrals.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, ...centrals, eocd]);
}

describe("RemoteZip", () => {
  test("fromBuffer reads entries and extracts text", async () => {
    const zip = await RemoteZip.fromBuffer(buildZip([
      { name: "hello.txt", data: "world" },
      { name: "test.csv", data: "a,b,c\n1,2,3" },
    ]));
    expect(zip.entries.length).toBe(2);
    expect(await zip.text("hello.txt")).toBe("world");
    expect(await zip.text("test.csv")).toBe("a,b,c\n1,2,3");
    expect(await zip.text("nope.txt")).toBeUndefined();
  });

  test("find locates files inside a subfolder", async () => {
    const zip = await RemoteZip.fromBuffer(buildZip([
      { name: "root.txt", data: "a" },
      { name: "folder/nested.txt", data: "b" },
    ]));
    expect(zip.find("root.txt")?.name).toBe("root.txt");
    expect(zip.find("nested.txt")?.name).toBe("folder/nested.txt");
  });

  test("handles stored (method 0) and deflated (method 8) entries", async () => {
    const zip = await RemoteZip.fromBuffer(buildZip([
      { name: "stored.txt", data: "plain", method: 0 },
      { name: "deflated.txt", data: "compressed", method: 8 },
    ]));
    expect(await zip.text("stored.txt")).toBe("plain");
    expect(await zip.text("deflated.txt")).toBe("compressed");
  });

  test("strips BOM from text", async () => {
    const zip = await RemoteZip.fromBuffer(buildZip([
      { name: "bom.txt", data: "﻿UTF-8" },
    ]));
    expect(await zip.text("bom.txt")).toBe("UTF-8");
  });

  test("lines iterator handles CRLF and LF", async () => {
    const zip = await RemoteZip.fromBuffer(buildZip([
      { name: "mixed.txt", data: "line1\r\nline2\nline3" },
    ]));
    const lines: string[] = [];
    for await (const line of zip.lines("mixed.txt")) lines.push(line);
    expect(lines).toEqual(["line1", "line2", "line3"]);
  });
});

describe("gtfs-static", () => {
  test("readStaticGtfs parses routes, trips and shapes", async () => {
    const routes = "route_id,route_short_name,route_long_name,route_type,route_color,route_text_color\nR1,1,Red Line,1,DC143C,FFFFFF\nR2,2,Blue Line,1,,";
    const trips = "route_id,trip_id,shape_id,direction_id\nR1,T1,S1,0\nR1,T2,S1,0\nR1,T3,S2,1\nR2,T4,,0";
    const shapes = "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nS1,10.0,20.0,1\nS1,10.1,20.1,2\nS2,11.0,21.0,1\nS2,11.1,21.1,2";
    const zip = await RemoteZip.fromBuffer(buildZip([
      { name: "agency.txt", data: "agency_id,agency_name\nA1,Test" },
      { name: "routes.txt", data: routes },
      { name: "trips.txt", data: trips },
      { name: "shapes.txt", data: shapes },
    ]));
    const result = await readStaticGtfs(zip);
    expect(result.routes.length).toBe(2);
    const r1 = result.routes.find((r) => r.routeId === "R1");
    expect(r1?.name).toBe("1");
    expect(r1?.longName).toBe("Red Line");
    expect(r1?.mode).toBe("metro");
    expect(r1?.color).toBe("DC143C");
    expect(r1?.shapes.length).toBeGreaterThanOrEqual(1);
    expect(r1?.bbox).not.toBeNull();
  });

  test("mode mapping from route_type", async () => {
    const routes = "route_id,route_type\nbus,3\nmetro,1\ntram,0\nrail,2\nrail2,109\ntrolley,11\nferry,4\ncable,5";
    const zip = await RemoteZip.fromBuffer(buildZip([
      { name: "routes.txt", data: routes },
    ]));
    const result = await readStaticGtfs(zip);
    const modes = Object.fromEntries(result.routes.map((r) => [r.routeId, r.mode]));
    expect(modes.bus).toBe("bus");
    expect(modes.metro).toBe("metro");
    expect(modes.tram).toBe("tram");
    expect(modes.rail).toBe("rail");
    expect(modes.rail2).toBe("rail");
    expect(modes.trolley).toBe("bus");
    expect(modes.ferry).toBe("ferry");
    expect(modes.cable).toBe("cable");
  });

  test("FFFFFF color treated as null", async () => {
    const routes = "route_id,route_type,route_color\nR1,1,FFFFFF\nR2,1,FF0000";
    const zip = await RemoteZip.fromBuffer(buildZip([{ name: "routes.txt", data: routes }]));
    const result = await readStaticGtfs(zip);
    expect(result.routes.find((r) => r.routeId === "R1")?.color).toBeNull();
    expect(result.routes.find((r) => r.routeId === "R2")?.color).toBe("FF0000");
  });

  test("# stripped from colors", async () => {
    const routes = "route_id,route_type,route_color\nR1,1,#ABC123";
    const zip = await RemoteZip.fromBuffer(buildZip([{ name: "routes.txt", data: routes }]));
    const result = await readStaticGtfs(zip);
    expect(result.routes[0].color).toBe("ABC123");
  });

  test("mode filter option", async () => {
    const routes = "route_id,route_type\nR1,1\nR2,3";
    const zip = await RemoteZip.fromBuffer(buildZip([{ name: "routes.txt", data: routes }]));
    const result = await readStaticGtfs(zip, { modes: ["metro"] });
    expect(result.routes.length).toBe(1);
    expect(result.routes[0].routeId).toBe("R1");
  });

  test("shape choice: most-used per direction, branches above 25%", async () => {
    const routes = "route_id,route_type\nR1,1";
    const trips = "route_id,trip_id,shape_id,direction_id\nR1,T1,S1,0\nR1,T2,S1,0\nR1,T3,S1,0\nR1,T4,S2,0\nR1,T5,S3,1\nR1,T6,S3,1\nR1,T7,S3,1\nR1,T8,S3,1\nR1,T9,S4,1";
    const shapes = "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nS1,10,20,1\nS1,11,21,2\nS2,10,20,1\nS2,11.1,21.1,2\nS3,12,22,1\nS3,13,23,2\nS4,12,22,1\nS4,13.1,23.1,2";
    const zip = await RemoteZip.fromBuffer(buildZip([
      { name: "routes.txt", data: routes },
      { name: "trips.txt", data: trips },
      { name: "shapes.txt", data: shapes },
    ]));
    const result = await readStaticGtfs(zip);
    const r1 = result.routes[0];
    expect(r1.shapes.length).toBeGreaterThanOrEqual(2);
  });

  test("points ordered by shape_pt_sequence even when rows are out of order", async () => {
    const routes = "route_id,route_type\nR1,1";
    const trips = "route_id,trip_id,shape_id\nR1,T1,S1";
    const shapes = "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nS1,11,21,2\nS1,10,20,1\nS1,12,22,3";
    const zip = await RemoteZip.fromBuffer(buildZip([
      { name: "routes.txt", data: routes },
      { name: "trips.txt", data: trips },
      { name: "shapes.txt", data: shapes },
    ]));
    const result = await readStaticGtfs(zip);
    const r1 = result.routes[0];
    expect(r1.shapes.length).toBe(1);
  });

  test("routes without shapes get empty array and null bbox", async () => {
    const routes = "route_id,route_type\nR1,1";
    const zip = await RemoteZip.fromBuffer(buildZip([{ name: "routes.txt", data: routes }]));
    const result = await readStaticGtfs(zip);
    expect(result.routes[0].shapes).toEqual([]);
    expect(result.routes[0].bbox).toBeNull();
  });

  test("BOM and CRLF handling", async () => {
    const routes = "﻿route_id,route_type\r\nR1,1\r\n";
    const zip = await RemoteZip.fromBuffer(buildZip([{ name: "routes.txt", data: routes }]));
    const result = await readStaticGtfs(zip);
    expect(result.routes.length).toBe(1);
  });

  test("file inside a subfolder found by find", async () => {
    const routes = "route_id,route_type\nR1,1";
    const zip = await RemoteZip.fromBuffer(buildZip([{ name: "gtfs/routes.txt", data: routes }]));
    const result = await readStaticGtfs(zip);
    expect(result.routes.length).toBe(1);
  });
});

describe("RemoteZip.open over HTTP", () => {
  const routes = "route_id,route_short_name,route_type\nR1,1,3\n";
  const zip = buildZip([{ name: "routes.txt", data: routes }, { name: "stop_times.txt", data: "x".repeat(200_000), method: 0 }]);

  function serve(honourRange: boolean, onlyFirst = false) {
    const ranges: string[] = [];
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const h = req.headers.get("range");
        if (!honourRange || !h || (onlyFirst && ranges.length > 0)) return new Response(new Uint8Array(zip), { headers: { "Content-Length": String(zip.length) } });
        ranges.push(h);
        const m = h.match(/bytes=(\d*)-(\d*)/)!;
        const start = m[1] === "" ? Math.max(0, zip.length - Number(m[2])) : Number(m[1]);
        const end = m[1] === "" || m[2] === "" ? zip.length - 1 : Math.min(zip.length - 1, Number(m[2]));
        return new Response(new Uint8Array(zip.subarray(start, end + 1)), {
          status: 206,
          headers: { "Content-Range": `bytes ${start}-${end}/${zip.length}` },
        });
      },
    });
    return { url: `http://localhost:${server.port}/feed.zip`, ranges, stop: () => server.stop(true) };
  }

  test("reads only the requested entries when the server honours Range", async () => {
    const s = serve(true);
    try {
      const z = await RemoteZip.open(s.url, AbortSignal.timeout(5000));
      expect(z.ranged).toBe(true);
      expect(z.totalSize).toBe(zip.length);
      expect(await z.text("routes.txt")).toBe(routes);
      const fetched = s.ranges.slice(1).map((r) => r.match(/(\d+)-(\d+)/)!).reduce((n, m) => n + Number(m[2]) - Number(m[1]) + 1, 0);
      expect(fetched).toBeLessThan(1000);
    } finally {
      s.stop();
    }
  });

  test("falls back to a full download when Range is ignored", async () => {
    const s = serve(false);
    try {
      const z = await RemoteZip.open(s.url, AbortSignal.timeout(5000));
      expect(z.ranged).toBe(false);
      expect(await z.text("routes.txt")).toBe(routes);
      const lines: string[] = [];
      for await (const l of z.lines("routes.txt")) lines.push(l);
      expect(lines).toEqual(["route_id,route_short_name,route_type", "R1,1,3"]);
    } finally {
      s.stop();
    }
  });

  test("falls back to a full download when Range stops being honoured", async () => {
    const s = serve(true, true);
    try {
      const z = await RemoteZip.open(s.url, AbortSignal.timeout(5000));
      expect(z.ranged).toBe(true);
      expect(await z.text("routes.txt")).toBe(routes);
      const lines: string[] = [];
      for await (const l of z.lines("routes.txt")) lines.push(l);
      expect(lines).toHaveLength(2);
    } finally {
      s.stop();
    }
  });

  test("refuses a full download above the size cap", async () => {
    const s = serve(false);
    try {
      await expect(RemoteZip.open(s.url, AbortSignal.timeout(5000), 1000)).rejects.toThrow(/ignores Range/);
    } finally {
      s.stop();
    }
  });
});

describe("zig-zag shapes", () => {
  test("longReversals counts long back-and-forth legs only", async () => {
    const { longReversals } = await import("./gtfs-static");
    const straight: [number, number][] = Array.from({ length: 20 }, (_, i) => [5 + i * 0.01, 52]);
    expect(longReversals(straight)).toBe(0);
    const jitter: [number, number][] = [[5, 52], [5.0001, 52], [5.00005, 52], [5.002, 52]];
    expect(longReversals(jitter)).toBe(0);
    const zigzag: [number, number][] = Array.from({ length: 12 }, (_, i) => [5 + (i % 2) * 0.01, 52 + i * 0.0001]);
    expect(longReversals(zigzag)).toBe(10);
  });

  test("readStaticGtfs drops a shape that interleaves two paths", async () => {
    const zz = Array.from({ length: 12 }, (_, i) => `Z,${52 + i * 0.0001},${5 + (i % 2) * 0.01},${i}`).join("\n");
    const ok = Array.from({ length: 12 }, (_, i) => `S,52,${5 + i * 0.01},${i}`).join("\n");
    const z = await RemoteZip.fromBuffer(buildZip([
      { name: "routes.txt", data: "route_id,route_short_name,route_type\nA,1,3\nB,2,3\n" },
      { name: "trips.txt", data: "route_id,trip_id,shape_id,direction_id\nA,t1,Z,0\nB,t2,S,0\n" },
      { name: "shapes.txt", data: `shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n${zz}\n${ok}\n` },
    ]));
    const { routes: rs, stats } = await readStaticGtfs(z);
    expect(rs.find((r) => r.routeId === "A")!.shapes).toEqual([]);
    expect(rs.find((r) => r.routeId === "B")!.shapes.length).toBe(1);
    expect(stats.shapesRejected).toBe(1);
  });
});

describe("readStops", () => {
  const stops = [
    "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station",
    "ST,Central Station,10.0,20.0,1,",
    "P1,Central Station Platform 1,10.0001,20.0001,0,ST",
    "E1,Central Entrance,10.0002,20.0,2,ST",
    "A,Market Square,10.01,20.01,0,",
    "A2,Market Square,10.0102,20.0101,0,",
    "B,Market Square,10.2,20.2,,",
    "Z,Null Island,0,0,0,",
  ].join("\n");
  const zip = () => RemoteZip.fromBuffer(buildZip([{ name: "stops.txt", data: stops }]));

  test("keeps stations and standalone stops, folds platforms and merges nearby duplicates", async () => {
    const { readStops } = await import("./gtfs-static");
    const out = await readStops(await zip());
    expect(out.map((s) => s.stopId)).toEqual(["ST", "A", "B"]);
    expect(out[0]).toEqual({ stopId: "ST", name: "Central Station", lat: 10, lon: 20 });
  });

  test("stationsOnly keeps explicit stations", async () => {
    const { readStops } = await import("./gtfs-static");
    expect((await readStops(await zip(), { stationsOnly: true })).map((s) => s.stopId)).toEqual(["ST"]);
  });
});

describe("aborted downloads", () => {
  test("reading a compressed entry fails instead of hanging when the download is aborted", async () => {
    const big = Array.from({ length: 50_000 }, (_, i) => `${i},${Math.random()}`).join("\n");
    const zip = buildZip([{ name: "shapes.txt", data: big }]);
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const m = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
        const start = !m || m[1] === "" ? Math.max(0, zip.length - Number(m?.[2] ?? zip.length)) : Number(m[1]);
        const end = m && m[1] !== "" && m[2] !== "" ? Math.min(zip.length - 1, Number(m[2])) : zip.length - 1;
        const part = zip.subarray(start, end + 1);
        const headers = { "Content-Range": `bytes ${start}-${end}/${zip.length}` };
        if (part.length < 5000 || start > 1000) return new Response(new Uint8Array(part), { status: 206, headers });
        // The entry's data, which starts right after its local header, arrives partly and then stalls.
        const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(part.subarray(0, 2000))); } });
        return new Response(body, { status: 206, headers });
      },
    });
    try {
      const z = await RemoteZip.open(`http://localhost:${server.port}/z.zip`, AbortSignal.timeout(300));
      const read = (async () => { for await (const _ of z.lines("shapes.txt")) void _; })();
      await expect(read).rejects.toThrow();
    } finally {
      server.stop(true);
    }
  });
});

describe("stop-sequence geometry", () => {
  test("routes without shapes are drawn through one trip's stops in order", async () => {
    const z = await RemoteZip.fromBuffer(buildZip([
      { name: "routes.txt", data: "route_id,route_short_name,route_type\nR,1,2\n" },
      { name: "trips.txt", data: "route_id,trip_id,direction_id\nR,t1,0\nR,t2,0\nR,t3,1\n" },
      { name: "stop_times.txt", data: "trip_id,stop_id,stop_sequence\nt1,C,3\nt1,A,1\nt1,B,2\nt2,A,1\nt3,C,1\nt3,A,2\n" },
      { name: "stops.txt", data: "stop_id,stop_name,stop_lat,stop_lon\nA,A,47.0,19.0\nB,B,47.3,19.5\nC,C,47.2,20.0\n" },
    ]));
    const { routes: [r] } = await readStaticGtfs(z);
    const { decodePolyline } = await import("./polyline");
    expect(r.shapes.map(decodePolyline)).toEqual([[[19, 47], [19.5, 47.3], [20, 47.2]], [[20, 47.2], [19, 47]]]);
    expect(r.bbox).toEqual({ minLat: 47, minLon: 19, maxLat: 47.3, maxLon: 20 });
  });
});
