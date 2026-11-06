import { connection } from "next/server";
import { generateFullListing } from "./content";

export async function GET() {
  await connection();
  return new Response(await generateFullListing(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
