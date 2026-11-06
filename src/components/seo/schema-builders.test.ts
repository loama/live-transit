import { describe, test, expect } from "bun:test";
import { buildOrganizationSchema } from "./organization-schema";
import { buildBreadcrumbSchema } from "./breadcrumb-schema";
import { buildAirportSchema } from "./airport-schema";

describe("Organization Schema", () => {
  test("builds valid organization and website schema", () => {
    const schema = buildOrganizationSchema({
      name: "Live Transit",
      description: "Test description",
      url: "https://example.com",
      logo: "https://example.com/logo.png",
    });

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@graph"]).toHaveLength(2);

    const org = schema["@graph"].find((item) => item["@type"] === "Organization");
    expect(org).toBeDefined();
    if (org?.["@type"] === "Organization" && "description" in org) {
      expect(org.name).toBe("Live Transit");
      expect(org.description).toBe("Test description");
      expect(org.url).toBe("https://example.com");
      expect(org.logo?.url).toBe("https://example.com/logo.png");
    }

    const website = schema["@graph"].find((item) => item["@type"] === "WebSite");
    expect(website).toBeDefined();
    if (website?.["@type"] === "WebSite") {
      expect(website.name).toBe("Live Transit");
      expect(website.url).toBe("https://example.com");
    }
  });

  test("works without logo", () => {
    const schema = buildOrganizationSchema({
      name: "Live Transit",
      description: "Test",
      url: "https://example.com",
    });

    const org = schema["@graph"].find((item) => item["@type"] === "Organization");
    expect(org).toBeDefined();
    expect("logo" in (org ?? {})).toBe(false);
  });
});

describe("Breadcrumb Schema", () => {
  test("builds valid breadcrumb list", () => {
    const items = [
      { name: "Home", url: "https://example.com/" },
      { name: "Networks", url: "https://example.com/n" },
      { name: "London TfL", url: "https://example.com/n/gb-london-tfl" },
    ];

    const schema = buildBreadcrumbSchema(items);

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("BreadcrumbList");
    expect(schema.itemListElement).toHaveLength(3);

    schema.itemListElement.forEach((item, index) => {
      expect(item["@type"]).toBe("ListItem");
      expect(item.position).toBe(index + 1);
      expect(item.name).toBe(items[index].name);
      expect(item.item).toBe(items[index].url);
    });
  });

  test("handles empty items array", () => {
    const schema = buildBreadcrumbSchema([]);
    expect(schema.itemListElement).toHaveLength(0);
  });

  test("handles single item", () => {
    const schema = buildBreadcrumbSchema([{ name: "Home", url: "https://example.com/" }]);
    expect(schema.itemListElement).toHaveLength(1);
    expect(schema.itemListElement[0].position).toBe(1);
  });
});

describe("Airport Schema", () => {
  test("builds complete airport schema", () => {
    const schema = buildAirportSchema({
      iataCode: "LHR",
      name: "Heathrow Airport",
      city: "London",
      country: "GB",
      lat: 51.4700,
      lon: -0.4543,
    });

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("Airport");
    expect(schema.name).toBe("Heathrow Airport");
    expect(schema.iataCode).toBe("LHR");
    expect(schema.url).toContain("/airports/LHR");

    if (typeof schema.address === "object" && schema.address !== null) {
      const address = schema.address as Record<string, unknown>;
      expect(address["@type"]).toBe("PostalAddress");
      expect(address.addressLocality).toBe("London");
      expect(address.addressCountry).toBe("GB");
    }

    if (typeof schema.geo === "object" && schema.geo !== null) {
      const geo = schema.geo as Record<string, unknown>;
      expect(geo["@type"]).toBe("GeoCoordinates");
      expect(geo.latitude).toBe(51.4700);
      expect(geo.longitude).toBe(-0.4543);
    }
  });

  test("builds minimal airport schema", () => {
    const schema = buildAirportSchema({
      iataCode: "JFK",
      name: "John F. Kennedy International Airport",
    });

    expect(schema["@type"]).toBe("Airport");
    expect(schema.name).toBe("John F. Kennedy International Airport");
    expect(schema.iataCode).toBe("JFK");
    expect(schema.address).toBeUndefined();
    expect(schema.geo).toBeUndefined();
  });

  test("includes address with only city", () => {
    const schema = buildAirportSchema({
      iataCode: "CDG",
      name: "Charles de Gaulle Airport",
      city: "Paris",
    });

    if (typeof schema.address === "object" && schema.address !== null) {
      const address = schema.address as Record<string, unknown>;
      expect(address.addressLocality).toBe("Paris");
      expect(address.addressCountry).toBeUndefined();
    }
  });

  test("includes address with only country", () => {
    const schema = buildAirportSchema({
      iataCode: "CDG",
      name: "Charles de Gaulle Airport",
      country: "FR",
    });

    if (typeof schema.address === "object" && schema.address !== null) {
      const address = schema.address as Record<string, unknown>;
      expect(address.addressCountry).toBe("FR");
      expect(address.addressLocality).toBeUndefined();
    }
  });

  test("requires both lat and lon for geo", () => {
    const schemaWithLat = buildAirportSchema({
      iataCode: "TEST",
      name: "Test Airport",
      lat: 50.0,
    });
    expect(schemaWithLat.geo).toBeUndefined();

    const schemaWithLon = buildAirportSchema({
      iataCode: "TEST",
      name: "Test Airport",
      lon: 10.0,
    });
    expect(schemaWithLon.geo).toBeUndefined();
  });
});
