import type { ExternalIntegrationAdapter, IntegrationHealth } from "@/integrations/types";
import type {
  ShopifyConfig,
  ShopifyCustomer,
  ShopifyOrder,
  ShopifyOrderItem,
  ShopifyProduct,
  ShopifySnapshot,
} from "@/integrations/shopify/shopify.types";

export const DEFAULT_SHOPIFY_API_VERSION = "2026-10";

type FetchLike = typeof fetch;
type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type GraphqlResponse<T> = {
  data?: T;
  errors?: { message?: string; extensions?: { code?: string } }[];
  extensions?: unknown;
};

type MoneyPayload = { shopMoney?: { amount?: string; currencyCode?: string } } | null;
type RawCustomer = {
  id: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  numberOfOrders?: string | null;
  lastOrder?: { createdAt?: string | null } | null;
};
type RawVariant = {
  sku?: string | null;
  price?: string | null;
  inventoryQuantity?: number | null;
};
type RawProduct = {
  id: string;
  title: string;
  descriptionHtml?: string | null;
  productType?: string | null;
  status?: string | null;
  featuredImage?: { url?: string | null } | null;
  variants: { nodes: RawVariant[]; pageInfo: PageInfo };
};
type RawLineItem = {
  id: string;
  name: string;
  quantity: number;
  sku?: string | null;
  originalUnitPriceSet?: MoneyPayload;
  discountedTotalSet?: MoneyPayload;
  variant?: { product?: { id?: string | null } | null } | null;
};
type RawOrder = {
  id: string;
  name?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  totalPriceSet?: MoneyPayload;
  totalRefundedSet?: MoneyPayload;
  customer?: RawCustomer | null;
  lineItems: { nodes: RawLineItem[]; pageInfo: PageInfo };
};

type OrdersPage = { orders: { nodes: RawOrder[]; pageInfo: PageInfo } };
type ProductsPage = { products: { nodes: RawProduct[]; pageInfo: PageInfo } };
type CustomersPage = { customers: { nodes: RawCustomer[]; pageInfo: PageInfo } };
type LineItemsPage = { order: { lineItems: { nodes: RawLineItem[]; pageInfo: PageInfo } } | null };
type ProductVariantsPage = {
  product: { variants: { nodes: RawVariant[]; pageInfo: PageInfo } } | null;
};

const ORDERS_QUERY = `
  query OrdersPage($after: String) {
    orders(first: 250, after: $after, sortKey: CREATED_AT) {
      nodes {
        id
        name
        createdAt
        updatedAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        totalRefundedSet { shopMoney { amount currencyCode } }
        customer {
          id displayName firstName lastName email phone numberOfOrders
          lastOrder { createdAt }
        }
        lineItems(first: 250) {
          nodes {
            id name quantity sku
            originalUnitPriceSet { shopMoney { amount currencyCode } }
            discountedTotalSet { shopMoney { amount currencyCode } }
            variant { product { id } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ORDER_LINE_ITEMS_QUERY = `
  query OrderLineItems($id: ID!, $after: String) {
    order(id: $id) {
      lineItems(first: 250, after: $after) {
        nodes {
          id name quantity sku
          originalUnitPriceSet { shopMoney { amount currencyCode } }
          discountedTotalSet { shopMoney { amount currencyCode } }
          variant { product { id } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const PRODUCTS_QUERY = `
  query ProductsPage($after: String) {
    products(first: 250, after: $after, sortKey: TITLE) {
      nodes {
        id title descriptionHtml productType status
        featuredImage { url }
        variants(first: 250) {
          nodes { sku price inventoryQuantity }
          pageInfo { hasNextPage endCursor }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CUSTOMERS_QUERY = `
  query CustomersPage($after: String) {
    customers(first: 250, after: $after, sortKey: CREATED_AT) {
      nodes {
        id displayName firstName lastName email phone numberOfOrders
        lastOrder { createdAt }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const PRODUCT_VARIANTS_QUERY = `
  query ProductVariants($id: ID!, $after: String) {
    product(id: $id) {
      variants(first: 250, after: $after) {
        nodes { sku price inventoryQuantity }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const SHOP_QUERY = `
  query ShopConnectionCheck { shop { name } }
`;

export class ShopifyConfigurationError extends Error {
  constructor(message = "Shopify non è configurato.") {
    super(message);
    this.name = "ShopifyConfigurationError";
  }
}

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

export function getShopifyConfig(
  env: Record<string, string | undefined> = process.env,
): ShopifyConfig | null {
  const storeDomain = env.SHOPIFY_STORE_DOMAIN?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const accessToken = env.SHOPIFY_ACCESS_TOKEN?.trim();
  const apiVersion = env.SHOPIFY_API_VERSION?.trim() || DEFAULT_SHOPIFY_API_VERSION;
  if (!storeDomain || !accessToken || !/^\d{4}-\d{2}$/.test(apiVersion)) return null;
  return { storeDomain, accessToken, apiVersion };
}

function amount(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function date(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function integer(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function customerName(customer: RawCustomer): string | null {
  const name = customer.displayName?.trim();
  if (name) return name;
  const combined = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  return combined || null;
}

function money(payload: MoneyPayload | undefined): {
  amount: number | null;
  currency: string | null;
} {
  return {
    amount: amount(payload?.shopMoney?.amount),
    currency: payload?.shopMoney?.currencyCode ?? null,
  };
}

function mapPaymentStatus(value: string | null | undefined): ShopifyOrder["paymentStatus"] {
  if (value === "PAID") return "PAID";
  if (value === "PARTIALLY_REFUNDED") return "PARTIALLY_REFUNDED";
  if (value === "REFUNDED") return "REFUNDED";
  if (value === "VOIDED") return "FAILED";
  return "PENDING";
}

function mapFulfillmentStatus(value: string | null | undefined): ShopifyOrder["fulfillmentStatus"] {
  if (value === "FULFILLED") return "FULFILLED";
  if (value === "PARTIALLY_FULFILLED") return "PARTIALLY_FULFILLED";
  if (value === "RETURNED") return "RETURNED";
  return "UNFULFILLED";
}

function mapOrderStatus(
  payment: ShopifyOrder["paymentStatus"],
  fulfillment: ShopifyOrder["fulfillmentStatus"],
): ShopifyOrder["status"] {
  if (payment === "REFUNDED") return "REFUNDED";
  if (fulfillment === "FULFILLED") return "FULFILLED";
  if (payment === "PAID") return "PAID";
  return "PENDING";
}

function mapLineItem(item: RawLineItem): ShopifyOrderItem {
  const unitPrice = money(item.originalUnitPriceSet).amount;
  const lineTotal = money(item.discountedTotalSet).amount;
  return {
    externalId: item.id,
    productExternalId: item.variant?.product?.id ?? null,
    name: item.name,
    sku: item.sku ?? null,
    quantity: item.quantity,
    unitPrice,
    lineTotal,
  };
}

function nextCursor(pageInfo: PageInfo, previous: string | null): string | null {
  if (!pageInfo.hasNextPage) return null;
  if (!pageInfo.endCursor || pageInfo.endCursor === previous) {
    throw new ShopifyApiError("Shopify ha restituito una paginazione non valida.", 502);
  }
  return pageInfo.endCursor;
}

export class ShopifyAdapter implements ExternalIntegrationAdapter {
  readonly provider = "shopify";

  constructor(
    private readonly config: ShopifyConfig | null = getShopifyConfig(),
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async getHealth(): Promise<IntegrationHealth> {
    return {
      provider: this.provider,
      status: this.config ? "configured" : "not_configured",
    };
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  async checkConnection(): Promise<{ storeName: string }> {
    const response = await this.graphql<{ shop: { name: string } }>(SHOP_QUERY, {});
    return { storeName: response.shop.name };
  }

  async fetchSnapshot(): Promise<ShopifySnapshot> {
    const [orders, products, customers] = await Promise.all([
      this.fetchOrders(),
      this.fetchProducts(),
      this.fetchCustomers(),
    ]);
    return { orders, products, customers };
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    if (!this.config) throw new ShopifyConfigurationError();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await this.fetchImpl(
        `https://${this.config.storeDomain}/admin/api/${this.config.apiVersion}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": this.config.accessToken,
          },
          body: JSON.stringify({ query, variables }),
          signal: controller.signal,
        },
      );
      const retryAfter = Number(response.headers.get("Retry-After"));
      const payload = (await response.json().catch(() => null)) as GraphqlResponse<T> | null;
      if (!response.ok) {
        throw new ShopifyApiError(
          response.status === 429
            ? "Shopify ha richiesto di attendere prima di riprovare."
            : "Shopify ha rifiutato la richiesta.",
          response.status,
          Number.isFinite(retryAfter) ? retryAfter : undefined,
        );
      }
      if (!payload || payload.errors?.length) {
        const message = payload?.errors
          ?.map((error) => error.message?.trim())
          .filter(Boolean)
          .join("; ");
        const throttled = payload?.errors?.some((error) => error.extensions?.code === "THROTTLED");
        throw new ShopifyApiError(message || "Risposta Shopify non valida.", throttled ? 429 : 502);
      }
      if (!payload.data) throw new ShopifyApiError("Risposta Shopify senza dati.", 502);
      return payload.data;
    } catch (error) {
      if (error instanceof ShopifyApiError || error instanceof ShopifyConfigurationError)
        throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ShopifyApiError("Timeout nella connessione a Shopify.", 504);
      }
      throw new ShopifyApiError("Impossibile raggiungere Shopify.", 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchOrders(): Promise<ShopifyOrder[]> {
    const orders: ShopifyOrder[] = [];
    let after: string | null = null;
    do {
      const page: OrdersPage = await this.graphql<OrdersPage>(ORDERS_QUERY, { after });
      for (const raw of page.orders.nodes) {
        const items = await this.fetchAllLineItems(raw.id, raw.lineItems);
        const total = money(raw.totalPriceSet);
        const refunded = money(raw.totalRefundedSet);
        const paymentStatus = mapPaymentStatus(raw.displayFinancialStatus);
        const fulfillmentStatus = mapFulfillmentStatus(raw.displayFulfillmentStatus);
        orders.push({
          externalId: raw.id,
          orderNumber: raw.name ?? null,
          orderDate:
            date(raw.createdAt) ??
            (() => {
              throw new ShopifyApiError("Shopify ha restituito una data ordine non valida.", 502);
            })(),
          updatedAt: date(raw.updatedAt),
          status: mapOrderStatus(paymentStatus, fulfillmentStatus),
          totalAmount: total.amount,
          currency: total.currency,
          paymentStatus,
          fulfillmentStatus,
          refundedAmount: refunded.amount,
          customerExternalId: raw.customer?.id ?? null,
          items: items.map(mapLineItem),
        });
      }
      after = nextCursor(page.orders.pageInfo, after);
    } while (after);
    return orders;
  }

  private async fetchAllLineItems(
    orderId: string,
    firstPage: { nodes: RawLineItem[]; pageInfo: PageInfo },
  ): Promise<RawLineItem[]> {
    const items = [...firstPage.nodes];
    let after = firstPage.pageInfo.hasNextPage ? firstPage.pageInfo.endCursor : null;
    while (after) {
      const page: LineItemsPage = await this.graphql<LineItemsPage>(ORDER_LINE_ITEMS_QUERY, {
        id: orderId,
        after,
      });
      if (!page.order)
        throw new ShopifyApiError("Ordine Shopify non trovato durante la paginazione.", 502);
      items.push(...page.order.lineItems.nodes);
      after = nextCursor(page.order.lineItems.pageInfo, after);
    }
    return items;
  }

  private async fetchProducts(): Promise<ShopifyProduct[]> {
    const products: ShopifyProduct[] = [];
    let after: string | null = null;
    do {
      const page: ProductsPage = await this.graphql<ProductsPage>(PRODUCTS_QUERY, { after });
      for (const raw of page.products.nodes) {
        const variants = await this.fetchAllVariants(raw.id, raw.variants);
        const variant = variants[0];
        products.push({
          externalId: raw.id,
          name: raw.title,
          description: raw.descriptionHtml ?? null,
          sku: variant?.sku ?? null,
          price: amount(variant?.price),
          currency: null,
          status: raw.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
          category: raw.productType ?? null,
          imageUrl: raw.featuredImage?.url ?? null,
          availableQty: variants.some(
            (item) => item.inventoryQuantity !== null && item.inventoryQuantity !== undefined,
          )
            ? variants.reduce((total, item) => total + (item.inventoryQuantity ?? 0), 0)
            : null,
        });
      }
      after = nextCursor(page.products.pageInfo, after);
    } while (after);
    return products;
  }

  private async fetchAllVariants(
    productId: string,
    firstPage: { nodes: RawVariant[]; pageInfo: PageInfo },
  ): Promise<RawVariant[]> {
    const variants = [...firstPage.nodes];
    let after = firstPage.pageInfo.hasNextPage ? firstPage.pageInfo.endCursor : null;
    while (after) {
      const page: ProductVariantsPage = await this.graphql<ProductVariantsPage>(
        PRODUCT_VARIANTS_QUERY,
        { id: productId, after },
      );
      if (!page.product)
        throw new ShopifyApiError("Prodotto Shopify non trovato durante la paginazione.", 502);
      variants.push(...page.product.variants.nodes);
      after = nextCursor(page.product.variants.pageInfo, after);
    }
    return variants;
  }

  private async fetchCustomers(): Promise<ShopifyCustomer[]> {
    const customers: ShopifyCustomer[] = [];
    let after: string | null = null;
    do {
      const page: CustomersPage = await this.graphql<CustomersPage>(CUSTOMERS_QUERY, { after });
      for (const raw of page.customers.nodes) {
        customers.push({
          externalId: raw.id,
          name: customerName(raw),
          email: raw.email ?? null,
          phone: raw.phone ?? null,
          orderCount: integer(raw.numberOfOrders),
          lastOrderAt: date(raw.lastOrder?.createdAt),
        });
      }
      after = nextCursor(page.customers.pageInfo, after);
    } while (after);
    return customers;
  }
}
