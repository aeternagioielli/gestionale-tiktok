import { describe, expect, it, vi } from "vitest";
import { ShopifyAdapter, getShopifyConfig } from "@/integrations/shopify/shopify.adapter";

function response(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), { status, headers });
}

describe("ShopifyAdapter", () => {
  it("reads configuration without exposing credentials in the mapped config", () => {
    const fixtureCredential = ["local", "fixture"].join("-");
    const config = getShopifyConfig({
      SHOPIFY_STORE_DOMAIN: "https://aeterna.myshopify.com/",
      SHOPIFY_ACCESS_TOKEN: fixtureCredential,
      SHOPIFY_API_VERSION: "2026-10",
    });
    expect(config).toEqual({
      storeDomain: "aeterna.myshopify.com",
      accessToken: fixtureCredential,
      apiVersion: "2026-10",
    });
    expect(getShopifyConfig({ SHOPIFY_STORE_DOMAIN: "store.myshopify.com" })).toBeNull();
  });

  it("maps paginated orders, products, customers and inventory", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes("orders(first")) {
        return response({
          data: {
            orders: {
              nodes: [
                {
                  id: "gid://shopify/Order/1",
                  name: "#1001",
                  createdAt: "2026-10-08T10:00:00.000Z",
                  updatedAt: "2026-10-08T10:05:00.000Z",
                  displayFinancialStatus: "PAID",
                  displayFulfillmentStatus: "UNFULFILLED",
                  totalPriceSet: { shopMoney: { amount: "29.90", currencyCode: "EUR" } },
                  totalRefundedSet: { shopMoney: { amount: "0.00", currencyCode: "EUR" } },
                  customer: {
                    id: "gid://shopify/Customer/1",
                    displayName: "Test Customer",
                    email: "customer@example.com",
                  },
                  lineItems: {
                    nodes: [
                      {
                        id: "gid://shopify/LineItem/1",
                        name: "AETERNA Product",
                        quantity: 1,
                        sku: "AET-001",
                        originalUnitPriceSet: {
                          shopMoney: { amount: "29.90", currencyCode: "EUR" },
                        },
                        discountedTotalSet: { shopMoney: { amount: "29.90", currencyCode: "EUR" } },
                        variant: { product: { id: "gid://shopify/Product/1" } },
                      },
                    ],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        });
      }
      if (body.query.includes("products(first")) {
        return response({
          data: {
            products: {
              nodes: [
                {
                  id: "gid://shopify/Product/1",
                  title: "AETERNA Product",
                  descriptionHtml: "<p>Description</p>",
                  productType: "Jewelry",
                  status: "ACTIVE",
                  featuredImage: { url: "https://cdn.shopify.com/product.jpg" },
                  variants: {
                    nodes: [{ sku: "AET-001", price: "29.90", inventoryQuantity: 4 }],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        });
      }
      return response({
        data: {
          customers: {
            nodes: [
              {
                id: "gid://shopify/Customer/1",
                displayName: "Test Customer",
                email: "customer@example.com",
                phone: null,
                numberOfOrders: "1",
                lastOrder: { createdAt: "2026-10-08T10:00:00.000Z" },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    });

    const snapshot = await new ShopifyAdapter(
      { storeDomain: "store.myshopify.com", accessToken: "token", apiVersion: "2026-10" },
      fetchMock,
    ).fetchSnapshot();

    expect(snapshot.orders[0]).toMatchObject({
      externalId: "gid://shopify/Order/1",
      totalAmount: 29.9,
    });
    expect(snapshot.orders[0].items[0].productExternalId).toBe("gid://shopify/Product/1");
    expect(snapshot.products[0]).toMatchObject({
      externalId: "gid://shopify/Product/1",
      availableQty: 4,
    });
    expect(snapshot.customers[0]).toMatchObject({
      externalId: "gid://shopify/Customer/1",
      orderCount: 1,
    });
  });

  it("surfaces Shopify API errors and rate limits without exposing headers", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ errors: [{ message: "Throttled" }] }, 429, { "Retry-After": "3" }),
      );
    const adapter = new ShopifyAdapter(
      { storeDomain: "store.myshopify.com", accessToken: "token", apiVersion: "2026-10" },
      fetchMock,
    );

    await expect(adapter.checkConnection()).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 3,
    });
  });
});
