export const AETERNA_PRODUCT_CATEGORIES = [
  "Collana",
  "Bracciale",
  "Anello",
  "Orecchini",
] as const;

export type AeternaProductCategory = (typeof AETERNA_PRODUCT_CATEGORIES)[number];

export type AeternaCatalogProduct = {
  sku: string;
  name: string;
  category: AeternaProductCategory;
};

export const AETERNA_PRODUCT_CATALOG: readonly AeternaCatalogProduct[] = [
  { sku: "COL-001", name: "Collana Orbis", category: "Collana" },
  { sku: "COL-002", name: "Collana Venere Argento", category: "Collana" },
  { sku: "COL-003", name: "Collana Venere Oro", category: "Collana" },
  { sku: "COL-004", name: "Collana Cora", category: "Collana" },
  { sku: "COL-005", name: "Collana Afrodite", category: "Collana" },
  { sku: "BRA-001", name: "Bracciale Cora Argento", category: "Bracciale" },
  { sku: "BRA-002", name: "Bracciale Aqua", category: "Bracciale" },
  { sku: "BRA-003", name: "Bracciale Cora Oro", category: "Bracciale" },
  { sku: "BRA-004", name: "Bracciale Trama", category: "Bracciale" },
  { sku: "BRA-005", name: "Bracciale Venere Oro", category: "Bracciale" },
  { sku: "BRA-006", name: "Bracciale Venere Argento", category: "Bracciale" },
  { sku: "ANE-001", name: "Anello Orbis", category: "Anello" },
  { sku: "ANE-002", name: "Anello Cora Argento", category: "Anello" },
  { sku: "ANE-003", name: "Anello Trama Oro", category: "Anello" },
  { sku: "ANE-004", name: "Anello Trama Argento", category: "Anello" },
  { sku: "ANE-005", name: "Anello Cora Oro", category: "Anello" },
  { sku: "ORE-001", name: "Orecchini Trama", category: "Orecchini" },
  { sku: "ORE-002", name: "Orecchini Orbis", category: "Orecchini" },
];
