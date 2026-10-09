import { getDatabaseClient, isDatabaseConfigured } from "@/server/db";

export async function getOrdersForPage() {
  if (!isDatabaseConfigured()) return [];
  const orders = await getDatabaseClient().order.findMany({
    orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
    include: { customer: { select: { name: true, email: true } } },
  });
  return orders.map((order) => ({
    id: order.id,
    externalId: order.externalId,
    orderNumber: order.orderNumber,
    orderDate: order.orderDate,
    customerName: order.customer?.name ?? order.customer?.email ?? null,
    totalAmount: order.totalAmount === null ? null : Number(order.totalAmount),
    currency: order.currency,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
  }));
}

export async function getProductsForPage() {
  if (!isDatabaseConfigured()) return [];
  const products = await getDatabaseClient().product.findMany({
    orderBy: { updatedAt: "desc" },
    include: { inventory: { select: { availableQty: true, reservedQty: true } } },
  });
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    price: product.price === null ? null : Number(product.price),
    currency: product.currency,
    status: product.status,
    inventory: product.inventory,
  }));
}

export async function getCustomersForPage() {
  if (!isDatabaseConfigured()) return [];
  const customers = await getDatabaseClient().customer.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, email: true, orderCount: true, lastOrderAt: true },
  });
  return customers;
}

export async function getInventoryForPage() {
  if (!isDatabaseConfigured()) return [];
  const inventory = await getDatabaseClient().inventoryItem.findMany({
    orderBy: { lastUpdatedAt: "desc" },
    include: { product: { select: { name: true, sku: true } } },
  });
  return inventory.map((item) => ({
    id: item.id,
    productName: item.product.name,
    sku: item.product.sku,
    availableQty: item.availableQty,
    reservedQty: item.reservedQty,
    minimumQty: item.minimumQty,
    lastUpdatedAt: item.lastUpdatedAt,
  }));
}
