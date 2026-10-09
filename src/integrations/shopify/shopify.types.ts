export type ShopifyConfig = {
  storeDomain: string;
  accessToken: string;
  apiVersion: string;
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
