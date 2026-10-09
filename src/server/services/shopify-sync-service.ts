import { Source, IntegrationStatus, SyncEventStatus, AuditAction } from "@/generated/prisma/enums";
import {
  ShopifyAdapter,
  ShopifyApiError,
  ShopifyConfigurationError,
  getShopifyConfig,
} from "@/integrations/shopify/shopify.adapter";
import type { ShopifySnapshot, ShopifySyncCounts } from "@/integrations/shopify/shopify.types";
import { getDatabaseClient, isDatabaseConfigured } from "@/server/db";
import { DomainError } from "@/server/domain/errors";

const SHOPIFY_NAME = "Shopify";

export type ShopifyIntegrationStatus = {
  configured: boolean;
  storeDomain: string | null;
  status: IntegrationStatus;
  lastSyncedAt: Date | null;
  lastError: string | null;
};

export type ShopifySyncResult = {
  syncedAt: Date;
  counts: ShopifySyncCounts;
  integration: ShopifyIntegrationStatus;
};

function safeErrorMessage(error: unknown, accessToken?: string): string {
  const message = error instanceof Error ? error.message : "Sincronizzazione Shopify non riuscita.";
  const sanitized = accessToken ? message.replaceAll(accessToken, "[redacted]") : message;
  if (error instanceof ShopifyConfigurationError) return error.message;
  if (error instanceof ShopifyApiError) return sanitized;
  return "Sincronizzazione Shopify non riuscita.";
}

function integrationConfig(storeDomain: string, apiVersion: string) {
  return { storeDomain, apiVersion };
}

async function getOrCreateIntegration() {
  const db = getDatabaseClient();
  const config = getShopifyConfig();
  return db.integration.upsert({
    where: { type_name: { type: "SHOPIFY", name: SHOPIFY_NAME } },
    create: {
      type: "SHOPIFY",
      name: SHOPIFY_NAME,
      status: config ? "NOT_CONFIGURED" : "NOT_CONFIGURED",
      config: config ? integrationConfig(config.storeDomain, config.apiVersion) : undefined,
    },
    update: config ? { config: integrationConfig(config.storeDomain, config.apiVersion) } : {},
  });
}

export async function getShopifyIntegrationStatus(): Promise<ShopifyIntegrationStatus> {
  const config = getShopifyConfig();
  if (!isDatabaseConfigured()) {
    return {
      configured: Boolean(config),
      storeDomain: config?.storeDomain ?? null,
      status: "NOT_CONFIGURED",
      lastSyncedAt: null,
      lastError: null,
    };
  }

  const db = getDatabaseClient();
  const integration = await db.integration.findUnique({
    where: { type_name: { type: "SHOPIFY", name: SHOPIFY_NAME } },
  });
  return {
    configured: Boolean(config),
    storeDomain: config?.storeDomain ?? null,
    status: config ? (integration?.status ?? "NOT_CONFIGURED") : "NOT_CONFIGURED",
    lastSyncedAt: integration?.lastSyncedAt ?? null,
    lastError: config ? (integration?.lastError ?? null) : null,
  };
}

export async function checkShopifyConnection(): Promise<ShopifyIntegrationStatus> {
  if (!isDatabaseConfigured()) return getShopifyIntegrationStatus();
  const config = getShopifyConfig();
  if (!config) return getShopifyIntegrationStatus();

  const integration = await getOrCreateIntegration();
  try {
    await new ShopifyAdapter(config).checkConnection();
    await getDatabaseClient().integration.update({
      where: { id: integration.id },
      data: { status: IntegrationStatus.CONNECTED, lastError: null },
    });
  } catch (error) {
    const message = safeErrorMessage(error, config.accessToken);
    await getDatabaseClient().integration.update({
      where: { id: integration.id },
      data: { status: IntegrationStatus.ERROR, lastError: message },
    });
    throw error;
  }
  return getShopifyIntegrationStatus();
}

async function persistSnapshot(
  snapshot: ShopifySnapshot,
  syncedAt: Date,
): Promise<ShopifySyncCounts> {
  const db = getDatabaseClient();
  return db.$transaction(async (transaction) => {
    const customerIds = new Map<string, string>();
    for (const customer of snapshot.customers) {
      const record = await transaction.customer.upsert({
        where: { externalId: customer.externalId },
        create: {
          externalId: customer.externalId,
          source: Source.SHOPIFY,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          ...(customer.orderCount === null ? {} : { orderCount: customer.orderCount }),
          lastOrderAt: customer.lastOrderAt,
        },
        update: {
          source: Source.SHOPIFY,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          ...(customer.orderCount === null ? {} : { orderCount: customer.orderCount }),
          lastOrderAt: customer.lastOrderAt,
        },
        select: { id: true },
      });
      customerIds.set(customer.externalId, record.id);
    }

    const productIds = new Map<string, string>();
    let inventory = 0;
    for (const product of snapshot.products) {
      const record = await transaction.product.upsert({
        where: { externalId: product.externalId },
        create: {
          externalId: product.externalId,
          source: Source.SHOPIFY,
          name: product.name,
          description: product.description,
          sku: product.sku,
          price: product.price,
          ...(product.currency ? { currency: product.currency } : {}),
          status: product.status,
          category: product.category,
          imageUrl: product.imageUrl,
        },
        update: {
          source: Source.SHOPIFY,
          name: product.name,
          description: product.description,
          sku: product.sku,
          price: product.price,
          ...(product.currency ? { currency: product.currency } : {}),
          status: product.status,
          category: product.category,
          imageUrl: product.imageUrl,
        },
        select: { id: true },
      });
      productIds.set(product.externalId, record.id);

      if (product.availableQty !== null) {
        await transaction.inventoryItem.upsert({
          where: { productId: record.id },
          create: {
            productId: record.id,
            availableQty: product.availableQty,
            reservedQty: null,
            source: Source.SHOPIFY,
            lastUpdatedAt: syncedAt,
          },
          update: {
            availableQty: product.availableQty,
            reservedQty: null,
            source: Source.SHOPIFY,
            lastUpdatedAt: syncedAt,
          },
        });
        inventory += 1;
      }
    }

    let orderItems = 0;
    for (const order of snapshot.orders) {
      const customerId = order.customerExternalId
        ? (customerIds.get(order.customerExternalId) ?? null)
        : null;
      const record = await transaction.order.upsert({
        where: { externalId: order.externalId },
        create: {
          externalId: order.externalId,
          orderNumber: order.orderNumber,
          source: Source.SHOPIFY,
          orderDate: order.orderDate,
          status: order.status,
          totalAmount: order.totalAmount,
          ...(order.currency ? { currency: order.currency } : {}),
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          refundedAmount: order.refundedAmount,
          ...(customerId ? { customer: { connect: { id: customerId } } } : {}),
          items: {
            create: order.items.map((item) => ({
              name: item.name,
              sku: item.sku,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
              ...(item.productExternalId && productIds.has(item.productExternalId)
                ? { product: { connect: { id: productIds.get(item.productExternalId) } } }
                : {}),
            })),
          },
        },
        update: {
          orderNumber: order.orderNumber,
          source: Source.SHOPIFY,
          orderDate: order.orderDate,
          status: order.status,
          totalAmount: order.totalAmount,
          ...(order.currency ? { currency: order.currency } : {}),
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          refundedAmount: order.refundedAmount,
          customer: customerId ? { connect: { id: customerId } } : { disconnect: true },
          items: {
            deleteMany: {},
            create: order.items.map((item) => ({
              name: item.name,
              sku: item.sku,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
              ...(item.productExternalId && productIds.has(item.productExternalId)
                ? { product: { connect: { id: productIds.get(item.productExternalId) } } }
                : {}),
            })),
          },
        },
      });
      orderItems += order.items.length;
      void record;
    }

    return {
      orders: snapshot.orders.length,
      products: snapshot.products.length,
      customers: snapshot.customers.length,
      inventory,
      orderItems,
    };
  });
}

export async function syncShopify(): Promise<ShopifySyncResult> {
  if (!isDatabaseConfigured()) {
    throw new DomainError("Database non configurato.", "DATABASE_NOT_CONFIGURED");
  }
  const config = getShopifyConfig();
  if (!config) throw new ShopifyConfigurationError();

  const db = getDatabaseClient();
  const integration = await getOrCreateIntegration();
  const startedAt = new Date();
  const event = await db.syncEvent.create({
    data: {
      integrationId: integration.id,
      eventType: "SHOPIFY_SYNC",
      status: SyncEventStatus.PROCESSING,
      occurredAt: startedAt,
      metadata: { apiVersion: config.apiVersion },
    },
  });
  await db.integration.update({
    where: { id: integration.id },
    data: { status: IntegrationStatus.SYNCING, lastError: null },
  });
  await db.auditLog.create({
    data: {
      action: AuditAction.SYNC_STARTED,
      entityType: "Integration",
      entityId: integration.id,
      integrationId: integration.id,
      metadata: { provider: "SHOPIFY" },
    },
  });

  try {
    const snapshot = await new ShopifyAdapter(config).fetchSnapshot();
    const syncedAt = new Date();
    const counts = await persistSnapshot(snapshot, syncedAt);
    await db.syncEvent.update({
      where: { id: event.id },
      data: {
        status: SyncEventStatus.COMPLETED,
        metadata: { ...counts, apiVersion: config.apiVersion },
      },
    });
    await db.integration.update({
      where: { id: integration.id },
      data: { status: IntegrationStatus.CONNECTED, lastSyncedAt: syncedAt, lastError: null },
    });
    await db.auditLog.create({
      data: {
        action: AuditAction.SYNC_COMPLETED,
        entityType: "Integration",
        entityId: integration.id,
        integrationId: integration.id,
        metadata: counts,
      },
    });
    return { syncedAt, counts, integration: await getShopifyIntegrationStatus() };
  } catch (error) {
    const message = safeErrorMessage(error, config.accessToken);
    await db.syncEvent.update({
      where: { id: event.id },
      data: { status: SyncEventStatus.FAILED, error: message },
    });
    await db.integration.update({
      where: { id: integration.id },
      data: { status: IntegrationStatus.ERROR, lastError: message },
    });
    await db.auditLog.create({
      data: {
        action: AuditAction.SYNC_FAILED,
        entityType: "Integration",
        entityId: integration.id,
        integrationId: integration.id,
        metadata: { provider: "SHOPIFY" },
      },
    });
    throw error;
  }
}
