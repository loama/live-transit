import type { PlannedSource } from "@/lib/planned";

export const planned: PlannedSource[] = [
  { name: "Finavia airports (Helsinki-Vantaa and 20 more)", country: "fi", modes: ["air"], url: "https://developer.finavia.fi/", reason: "official flights API needs a free subscription key" },
  { name: "Swedavia airports (Stockholm Arlanda, Gothenburg Landvetter and more)", country: "se", modes: ["air"], url: "https://apideveloper.swedavia.se/", reason: "FlightInfo API needs a free subscription key" },
  { name: "Amsterdam Airport Schiphol", country: "nl", modes: ["air"], url: "https://developer.schiphol.nl/", reason: "Public Flight API needs app id and app key" },
  { name: "Eurocontrol Network Manager (delays, regulations)", country: "xx", modes: ["air"], url: "https://www.eurocontrol.int/service/network-manager-business-business-b2b-web-services", reason: "NM B2B web services need an account and client certificate; no keyless public feed found" },
  { name: "Aena airports (Madrid, Barcelona and 44 more)", country: "es", modes: ["air"], url: "https://www.aena.es/en/passengers/flight-information.html", reason: "flight board is rendered through a session-bound backend, no stable keyless JSON endpoint found" },
  { name: "London Heathrow", country: "gb", modes: ["air"], url: "https://www.heathrow.com/arrivals", reason: "board loads from a GraphQL backend that needs a gateway token; no keyless endpoint found" },
  { name: "London Gatwick", country: "gb", modes: ["air"], url: "https://www.gatwickairport.com/flights/", reason: "flight data endpoint redirects or errors for plain requests" },
  { name: "Zurich Airport", country: "ch", modes: ["air"], url: "https://www.zurich-airport.com/passengers-and-visitors/flights", reason: "403 for non-browser clients (bot protection)" },
  { name: "Brussels Airport", country: "be", modes: ["air"], url: "https://www.brusselsairport.be/en/passengers/flights", reason: "403 for non-browser clients (bot protection)" },
  { name: "Copenhagen Airport", country: "dk", modes: ["air"], url: "https://www.cph.dk/en/flight-information", reason: "Access Denied for non-browser clients (Akamai)" },
  { name: "Toronto Pearson", country: "ca", modes: ["air"], url: "https://www.torontopearson.com/en/departures", reason: "Radware bot challenge and hCaptcha in front of the flights API" },
  { name: "Vancouver YVR", country: "ca", modes: ["air"], url: "https://www.yvr.ca/en/passengers/flights", reason: "403 for non-browser clients" },
  { name: "Denver, Phoenix, Atlanta, Los Angeles, Boston airports", country: "us", modes: ["air"], url: "https://www.flydenver.com/flights", reason: "Cloudflare or Imperva challenge in front of the board" },
  { name: "Port Authority NY/NJ (JFK, LGA, EWR)", country: "us", modes: ["air"], url: "https://www.jfkairport.com/flights", reason: "no keyless JSON backend found" },
  { name: "Seattle-Tacoma (Port of Seattle)", country: "us", modes: ["air"], url: "https://www.portseattle.org/sea-tac/flights", reason: "board only available as an HTML fragment; scraping not implemented" },
  { name: "Buenos Aires Ezeiza and Aeroparque (Aeropuertos Argentina)", country: "ar", modes: ["air"], url: "https://www.aeropuertosargentina.com/", reason: "flights API answers 401 Invalid Key" },
  { name: "Mexico City AICM", country: "mx", modes: ["air"], url: "https://www.aicm.com.mx/vuelos", reason: "JSON API exists but no documented keyless method found" },
  { name: "Santiago SCL and Rio GIG", country: "cl", modes: ["air"], url: "https://www.nuevopudahuel.cl/", reason: "403 for non-browser clients" },
];
