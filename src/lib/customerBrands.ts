/** Static brand marks shown on customer lane cards. */
export type CustomerBrand = {
  src: string;
  alt: string;
};

const REPUBLIC: CustomerBrand = {
  src: "/brand/republic-services.png",
  alt: "Republic Services",
};

const WASTE_MANAGEMENT: CustomerBrand = {
  src: "/brand/waste-management.jpg",
  alt: "Waste Management",
};

/** Customer display names → brand mark (matched case-insensitively). */
const CUSTOMER_BRANDS: Record<string, CustomerBrand> = Object.fromEntries(
  [
    ...[
      "Apollo",
      "Chicago Heights",
      "East Chicago",
      "Evanston",
      "Melrose",
      "Schererville",
      "Calumet",
      "Medill",
      "Citiwaste",
      "Arc",
    ].map((n) => [n.trim().toLowerCase(), REPUBLIC] as const),
    ...[
      "Batavia",
      "Rockdale",
      "Hooker Street",
      "Northlake",
      "Woodland RDF",
      "Roscoe",
      "Liberty",
      "Elgin",
    ].map((n) => [n.trim().toLowerCase(), WASTE_MANAGEMENT] as const),
  ],
);

export function brandForCustomer(name: string): CustomerBrand | null {
  return CUSTOMER_BRANDS[name.trim().toLowerCase()] ?? null;
}
