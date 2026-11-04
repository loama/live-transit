import { createInflateRaw, inflateRawSync } from "node:zlib";
import { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { USER_AGENT } from "./http";

// Reads individual files out of a remote zip without downloading the whole archive, using HTTP Range
// requests. GTFS zips are often hundreds of megabytes, mostly stop_times.txt, so fetching only the
// entries we need keeps imports small. Falls back to one full download when the server ignores Range.

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

interface Backing {
  read(start: number, end: number): Promise<Buffer>;
  stream(start: number, end: number): Promise<Readable>;
}

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_LOC64 = 0x07064b50;
const SIG_CEN = 0x02014b50;
const MAX = 0xffffffff;

function readU64(b: Buffer, at: number) {
  return Number(b.readBigUInt64LE(at));
}

/** Parse the central directory. `tail` is the last bytes of the file, starting at absolute `tailStart`. */
export async function parseDirectory(tail: Buffer, tailStart: number, read: Backing["read"]): Promise<ZipEntry[]> {
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip end record not found");
  let count = tail.readUInt16LE(eocd + 10);
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);
  const loc = eocd - 20;
  if (loc >= 0 && tail.readUInt32LE(loc) === SIG_LOC64) {
    const at = readU64(tail, loc + 8);
    const rec = at >= tailStart ? tail.subarray(at - tailStart, at - tailStart + 56) : await read(at, at + 55);
    if (rec.readUInt32LE(0) !== SIG_EOCD64) throw new Error("zip64 end record not found");
    count = readU64(rec, 32);
    cdSize = readU64(rec, 40);
    cdOffset = readU64(rec, 48);
  }
  const cd =
    cdOffset >= tailStart ? tail.subarray(cdOffset - tailStart, cdOffset - tailStart + cdSize) : await read(cdOffset, cdOffset + cdSize - 1);
  const out: ZipEntry[] = [];
  for (let p = 0, n = 0; n < count && p + 46 <= cd.length; n++) {
    if (cd.readUInt32LE(p) !== SIG_CEN) throw new Error("corrupt zip central directory");
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    let csize = cd.readUInt32LE(p + 20);
    let size = cd.readUInt32LE(p + 24);
    let local = cd.readUInt32LE(p + 42);
    const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
    for (let e = 0; e + 4 <= extra.length; ) {
      const id = extra.readUInt16LE(e);
      const len = extra.readUInt16LE(e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === MAX) {
          size = readU64(extra, q);
          q += 8;
        }
        if (csize === MAX) {
          csize = readU64(extra, q);
          q += 8;
        }
        if (local === MAX) local = readU64(extra, q);
      }
      e += 4 + len;
    }
    out.push({
      name: cd.toString("utf8", p + 46, p + 46 + nameLen),
      method: cd.readUInt16LE(p + 10),
      compressedSize: csize,
      size,
      localOffset: local,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export class RemoteZip {
  private constructor(
    private backing: Backing,
    readonly entries: ZipEntry[],
    readonly totalSize: number,
    readonly ranged: boolean,
  ) {}

  static async open(url: string, signal: AbortSignal, maxFullDownload = 150 * 1024 * 1024): Promise<RemoteZip> {
    const get = (headers: Record<string, string> = {}) =>
      fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*", ...headers }, signal, redirect: "follow" });
    const probe = await get({ Range: "bytes=-131072" });
    if (probe.status === 206) {
      const total = Number(probe.headers.get("content-range")?.split("/")[1]);
      const tail = Buffer.from(await probe.arrayBuffer());
      if (!Number.isFinite(total)) throw new Error("server did not report zip size");
      const read = async (start: number, end: number) => {
        const r = await get({ Range: `bytes=${start}-${end}` });
        if (r.status !== 206) throw new Error(`range request failed: HTTP ${r.status}`);
        return Buffer.from(await r.arrayBuffer());
      };
      const backing: Backing = {
        read,
        async stream(start, end) {
          const r = await get({ Range: `bytes=${start}-${end}` });
          if (r.status !== 206 || !r.body) throw new Error(`range request failed: HTTP ${r.status}`);
          return Readable.fromWeb(r.body as never);
        },
      };
      return new RemoteZip(backing, await parseDirectory(tail, total - tail.length, read), total, true);
    }
    if (!probe.ok) throw new Error(`HTTP ${probe.status} from ${url}`);
    const len = Number(probe.headers.get("content-length") ?? 0);
    if (len > maxFullDownload) {
      await probe.body?.cancel();
      throw new Error(`server ignores Range and zip is ${Math.round(len / 1e6)} MB`);
    }
    return RemoteZip.fromBuffer(Buffer.from(await probe.arrayBuffer()));
  }

  static async fromBuffer(buf: Buffer): Promise<RemoteZip> {
    const read = async (s: number, e: number) => buf.subarray(s, e + 1);
    const backing: Backing = { read, stream: async (s, e) => Readable.from([buf.subarray(s, e + 1)]) };
    return new RemoteZip(backing, await parseDirectory(buf, 0, read), buf.length, false);
  }

  /** Entry by file name, ignoring any leading folder (some feeds zip a directory). */
  find(name: string): ZipEntry | undefined {
    return this.entries.find((e) => e.name === name) ?? this.entries.find((e) => e.name.endsWith(`/${name}`));
  }

  private async dataStream(e: ZipEntry): Promise<Readable> {
    const head = await this.backing.read(e.localOffset, e.localOffset + 29);
    const start = e.localOffset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
    if (e.compressedSize === 0) return Readable.from([]);
    const raw = await this.backing.stream(start, start + e.compressedSize - 1);
    if (e.method === 0) return raw;
    if (e.method !== 8) throw new Error(`unsupported zip compression method ${e.method} for ${e.name}`);
    return raw.pipe(createInflateRaw());
  }

  async text(name: string): Promise<string | undefined> {
    const e = this.find(name);
    if (!e) return undefined;
    const head = await this.backing.read(e.localOffset, e.localOffset + 29);
    const start = e.localOffset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
    const data = e.compressedSize ? await this.backing.read(start, start + e.compressedSize - 1) : Buffer.alloc(0);
    return (e.method === 0 ? data : inflateRawSync(data)).toString("utf8").replace(/^﻿/, "");
  }

  /** Stream the lines of a text entry without holding the whole file in memory. */
  async *lines(name: string): AsyncGenerator<string> {
    const e = this.find(name);
    if (!e) return;
    const dec = new StringDecoder("utf8");
    let rest = "";
    let first = true;
    for await (const chunk of await this.dataStream(e)) {
      let s = rest + dec.write(chunk as Buffer);
      if (first) {
        s = s.replace(/^﻿/, "");
        first = false;
      }
      let i: number;
      let from = 0;
      while ((i = s.indexOf("\n", from)) >= 0) {
        yield s.charCodeAt(i - 1) === 13 ? s.slice(from, i - 1) : s.slice(from, i);
        from = i + 1;
      }
      rest = s.slice(from);
    }
    rest += dec.end();
    if (rest) yield rest.replace(/\r$/, "");
  }
}
