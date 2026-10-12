export type ShopifyConfig = {
  storeDomain: string;
  apiVersion: string;
  credentials:
    | { kind: "client_credentials"; clientId: string; clientSecret: string }
    | { kind: "legacy_access_token"; accessToken: string };
};

export type ShopifyMoney = {
  amount: string;
  currencyCode: string;
};

export type ShopifyCustomer = {
  externalId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  orderCount: number | null;
  lastOrderAt: Date | null;
};

export type ShopifyProduct = {
  externalId: string;
  name: string;
  description: string | null;
  sku: string | null;
  price: number | null;
  currency: string | null;
  status: "ACTIVE" | "ARCHIVED";
  category: string | null;
  imageUrl: string | null;
  availableQty: number | null;
};

/**
 * Deliberately read-only representation used by Alessandro's SEO analysis.
 * It contains only catalog data, never customers or orders.
 */
export type ShopifyCatalogProduct = {
  externalId: string;
  title: string;
  handle: string | null;
  descriptionHtml: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  imageUrl: string | null;
  imageAltText: string | null;
  images: Array<{ url: string; altText: string | null }>;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT" | "UNLISTED" | "UNKNOWN";
  productType: string | null;
  updatedAt: Date | null;
  variants: Array<{
    externalId: string;
    title: string | null;
    sku: string | null;
    price: number | null;
    availableQty: number | null;
  }>;
  availableQty: number | null;
};

/**
 * Verified product facts supplied by an operator. These are the only facts that
 * can be sent to Shopify when an approved draft is created.
 */
export type ShopifyDraftProduct = {
  title: string;
  handle: string;
  descriptionHtml: string;
  seoTitle: string;
  seoDescription: string;
  productType: string | null;
  materials: string[];
  variants: Array<{
    title: string;
    sku: string | null;
    price: string;
    optionValues: Array<{ optionName: string; value: string }>;
  }>;
  images: Array<{ sourceUrl: string; altText: string | null }>;
};

export type ShopifyDraftProductResult = {
  productId: string;
  handle: string;
  variantIds: string[];
};

export type ShopifyOrderItem = {
  externalId: string;
  productExternalId: string | null;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
};

export type ShopifyOrder = {
  externalId: string;
  orderNumber: string | null;
  orderDate: Date;
  updatedAt: Date | null;
  status: "PENDING" | "PAID" | "FULFILLED" | "CANCELLED" | "REFUNDED";
  totalAmount: number | null;
  currency: string | null;
  paymentStatus: "PENDING" | "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED" | "FAILED";
  fulfillmentStatus: "UNFULFILLED" | "PARTIALLY_FULFILLED" | "FULFILLED" | "RETURNED";
  refundedAmount: number | null;
  customerExternalId: string | null;
  items: ShopifyOrderItem[];
};

export type ShopifySnapshot = {
  orders: ShopifyOrder[];
  products: ShopifyProduct[];
  customers: ShopifyCustomer[];
};

export type ShopifySyncCounts = {
  orders: number;
  products: number;
  customers: number;
  inventory: number;
  orderItems: number;
};
