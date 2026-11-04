import type { PlannedSource } from "@/lib/planned";

export const planned: PlannedSource[] = [
  { name: "FAX Fresno", country: "us", modes: ["bus"], url: "https://gis4u.fresno.gov/TMGTFSRealTimeWebService/Vehicle/VehiclePositions.pb", reason: "feed times out (40s) on every run from our US ingestion region" },
];
