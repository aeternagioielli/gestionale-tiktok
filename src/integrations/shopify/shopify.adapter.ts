import type { ExternalIntegrationAdapter, IntegrationHealth } from "@/integrations/types";
import type {
  ShopifyConfig,
  ShopifyCustomer,
  ShopifyCatalogProduct,
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
  id: string;
  title?: string | null;
  sku?: string | null;
  price?: string | null;
  inventoryQuantity?: number | null;
};
type RawProduct = {
  id: string;
  title: string;
  handle?: string | null;
  descriptionHtml?: string | null;
  seo?: { title?: string | null; description?: string | null } | null;
  productType?: string | null;
  status?: string | null;
  updatedAt?: string | null;
  featuredImage?: { url?: string | null; altText?: string | null } | null;
  images?: { nodes: Array<{ url?: string | null; altText?: string | null }> } | null;
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
        id title handle descriptionHtml productType status updatedAt
        seo { title description }
        featuredImage { url altText }
        images(first: 10) { nodes { url altText } }
        variants(first: 250) {
          nodes { id title sku price inventoryQuantity }
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
        nodes { id title sku price inventoryQuantity }
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

export class ShopifyAuthenticationError extends Error {
  constructor(
    message: string,
    public readonly code: "STORE_NOT_ELIGIBLE" | "TOKEN_REQUEST_FAILED",
  ) {
    super(message);
    this.name = "ShopifyAuthenticationError";
  }
}

export function getShopifyConfig(
  env: Record<string, string | undefined> = process.env,
): ShopifyConfig | null {
  const storeDomain = env.SHOPIFY_STORE_DOMAIN?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const clientId = env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = env.SHOPIFY_CLIENT_SECRET?.trim();
  const accessToken = env.SHOPIFY_ACCESS_TOKEN?.trim();
  const apiVersion = env.SHOPIFY_API_VERSION?.trim() || DEFAULT_SHOPIFY_API_VERSION;
  if (!storeDomain || !/^\d{4}-\d{2}$/.test(apiVersion)) return null;
  if (clientId && clientSecret) {
    return { storeDomain, apiVersion, credentials: { kind: "client_credentials", clientId, clientSecret } };
  }
  // Kept only for existing legacy installations. Dev Dashboard applications use client credentials.
  if (accessToken)
    return { storeDomain, apiVersion, credentials: { kind: "legacy_access_token", accessToken } };
  return null;
}

type TokenResponse = { access_token?: unknown; expires_in?: unknown; error?: unknown; error_description?: unknown };

export interface ShopifyAccessTokenProvider {
  getAccessToken(config: ShopifyConfig): Promise<string>;
}

type CachedToken = { value: string; expiresAt: number };

export class ShopifyClientCredentialsTokenProvider implements ShopifyAccessTokenProvider {
  private readonly cache = new Map<string, CachedToken>();
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async getAccessToken(config: ShopifyConfig): Promise<string> {
    if (config.credentials.kind === "legacy_access_token") return config.credentials.accessToken;
    const key = `${config.storeDomain}:${config.credentials.clientId}`;
    const cached = this.cache.get(key);
    // Shopify client-credential tokens last 24 hours. Refresh five minutes before expiry.
    if (cached && cached.expiresAt > Date.now() + 5 * 60_000) return cached.value;
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const request = this.requestToken(config, key);
    this.inFlight.set(key, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async requestToken(config: ShopifyConfig, cacheKey: string): Promise<string> {
    if (config.credentials.kind !== "client_credentials") return config.credentials.accessToken;
    let response: Response;
    try {
      response = await this.fetchImpl(
        `https://${config.storeDomain}/admin/oauth/access_token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: config.credentials.clientId,
            client_secret: config.credentials.clientSecret,
          }),
        },
      );
    } catch {
      throw new ShopifyAuthenticationError("Impossibile ottenere un token Shopify.", "TOKEN_REQUEST_FAILED");
    }
    const payload = (await response.json().catch(() => null)) as TokenResponse | null;
    const error = typeof payload?.error === "string" ? payload.error : "";
    if (!response.ok || !payload || typeof payload.access_token !== "string" || !payload.access_token) {
      if (error === "shop_not_permitted") {
        throw new ShopifyAuthenticationError(
          "Lo store non e idoneo al Client Credentials Grant: app e store devono appartenere alla stessa organizzazione Shopify.",
          "STORE_NOT_ELIGIBLE",
        );
      }
      throw new ShopifyAuthenticationError("Shopify non ha rilasciato un token di accesso.", "TOKEN_REQUEST_FAILED");
    }
    const expiresIn = typeof payload.expires_in === "number" && payload.expires_in > 0 ? payload.expires_in : 60 * 60;
    this.cache.set(cacheKey, { value: payload.access_token, expiresAt: Date.now() + expiresIn * 1_000 });
    return payload.access_token;
  }
}

const defaultTokenProvider = new ShopifyClientCredentialsTokenProvider();

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
    private readonly tokenProvider: ShopifyAccessTokenProvider = defaultTokenProvider,
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

  /** Reads the catalog only. It never includes customers, orders or mutations. */
  async fetchCatalog(): Promise<ShopifyCatalogProduct[]> {
    return this.fetchCatalogProducts();
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    if (!this.config) throw new ShopifyConfigurationError();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const accessToken = await this.tokenProvider.getAccessToken(this.config);
      const response = await this.fetchImpl(
        `https://${this.config.storeDomain}/admin/api/${this.config.apiVersion}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
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
      if (error instanceof ShopifyApiError || error instanceof ShopifyConfigurationError || error instanceof ShopifyAuthenticationError)
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
    const catalog = await this.fetchCatalogProducts();
    return catalog.map((product) => {
      const variant = product.variants[0];
      return {
        externalId: product.externalId,
        name: product.title,
        description: product.descriptionHtml,
        sku: variant?.sku ?? null,
        price: variant?.price ?? null,
        currency: null,
        status: product.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
        category: product.productType,
        imageUrl: product.imageUrl,
        availableQty: product.availableQty,
      };
    });
  }

  private async fetchCatalogProducts(): Promise<ShopifyCatalogProduct[]> {
    const products: ShopifyCatalogProduct[] = [];
    let after: string | null = null;
    do {
      const page: ProductsPage = await this.graphql<ProductsPage>(PRODUCTS_QUERY, { after });
      for (const raw of page.products.nodes) {
        const variants = await this.fetchAllVariants(raw.id, raw.variants);
        const availableQty = variants.some(
          (item) => item.inventoryQuantity !== null && item.inventoryQuantity !== undefined,
        )
          ? variants.reduce((total, item) => total + (item.inventoryQuantity ?? 0), 0)
          : null;
        products.push({
          externalId: raw.id,
          title: raw.title,
          handle: raw.handle ?? null,
          descriptionHtml: raw.descriptionHtml ?? null,
          seoTitle: raw.seo?.title ?? null,
          seoDescription: raw.seo?.description ?? null,
          imageUrl: raw.featuredImage?.url ?? null,
          imageAltText: raw.featuredImage?.altText ?? null,
          images: (raw.images?.nodes ?? [])
            .filter((image): image is { url: string; altText?: string | null } => Boolean(image.url))
            .map((image) => ({ url: image.url, altText: image.altText ?? null })),
          status:
            raw.status === "ACTIVE" || raw.status === "ARCHIVED" || raw.status === "DRAFT" || raw.status === "UNLISTED"
              ? raw.status
              : "UNKNOWN",
          productType: raw.productType ?? null,
          updatedAt: date(raw.updatedAt),
          variants: variants.map((variant) => ({
            externalId: variant.id,
            title: variant.title ?? null,
            sku: variant.sku ?? null,
            price: amount(variant.price),
            availableQty: variant.inventoryQuantity ?? null,
          })),
          availableQty,
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
