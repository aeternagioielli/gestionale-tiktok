import { Boxes, Package, ShoppingBag, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

function formatDate(value: Date | null): string {
  return value ? value.toLocaleDateString("it-IT") : "Dato non disponibile";
}

function formatAmount(value: number | null, currency = "EUR"): string {
  return value === null
    ? "Dato non disponibile"
    : new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value);
}

function EmptyCommerce({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return <EmptyState icon={icon} title={title} description={description} />;
}

export function OrdersTable({
  orders,
}: {
  orders: Awaited<ReturnType<typeof import("@/server/services/commerce-service").getOrdersForPage>>;
}) {
  if (orders.length === 0) {
    return (
      <EmptyCommerce
        icon={<ShoppingBag size={18} />}
        title="Nessun ordine disponibile"
        description="Collega Shopify per iniziare a ricevere gli ordini reali."
      />
    );
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Ordine</th>
            <th>Data</th>
            <th>Cliente</th>
            <th>Totale</th>
            <th>Stato</th>
            <th>Pagamento</th>
            <th>Spedizione</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{order.orderNumber ?? order.externalId ?? order.id}</td>
              <td>{formatDate(order.orderDate)}</td>
              <td>{order.customerName ?? "Non disponibile"}</td>
              <td>{formatAmount(order.totalAmount, order.currency)}</td>
              <td>{order.status}</td>
              <td>{order.paymentStatus}</td>
              <td>{order.fulfillmentStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProductsTable({
  products,
}: {
  products: Awaited<
    ReturnType<typeof import("@/server/services/commerce-service").getProductsForPage>
  >;
}) {
  if (products.length === 0)
    return (
      <EmptyCommerce
        icon={<Package size={18} />}
        title="Nessun prodotto disponibile"
        description="Il catalogo apparirà qui dopo il primo sync Shopify."
      />
    );
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Prodotto</th>
            <th>SKU</th>
            <th>Prezzo</th>
            <th>Stato</th>
            <th>Disponibilità</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>{product.name}</td>
              <td>{product.sku ?? "Non disponibile"}</td>
              <td>{formatAmount(product.price, product.currency)}</td>
              <td>{product.status}</td>
              <td>{product.inventory ? product.inventory.availableQty : "Dato non disponibile"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CustomersTable({
  customers,
}: {
  customers: Awaited<
    ReturnType<typeof import("@/server/services/commerce-service").getCustomersForPage>
  >;
}) {
  if (customers.length === 0)
    return (
      <EmptyCommerce
        icon={<Users size={18} />}
        title="Nessun cliente disponibile"
        description="I clienti appariranno qui quando Shopify sarà collegato e sincronizzato."
      />
    );
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Email</th>
            <th>Ordini</th>
            <th>Ultimo ordine</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id}>
              <td>{customer.name ?? "Non disponibile"}</td>
              <td>{customer.email ?? "Non disponibile"}</td>
              <td>{customer.orderCount}</td>
              <td>{formatDate(customer.lastOrderAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InventoryTable({
  inventory,
}: {
  inventory: Awaited<
    ReturnType<typeof import("@/server/services/commerce-service").getInventoryForPage>
  >;
}) {
  if (inventory.length === 0)
    return (
      <EmptyCommerce
        icon={<Boxes size={18} />}
        title="Nessun inventario disponibile"
        description="L'inventario apparirà qui quando Shopify restituirà quantità disponibili."
      />
    );
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Prodotto</th>
            <th>SKU</th>
            <th>Disponibile</th>
            <th>Riservato</th>
            <th>Aggiornato</th>
          </tr>
        </thead>
        <tbody>
          {inventory.map((item) => (
            <tr key={item.id}>
              <td>{item.productName}</td>
              <td>{item.sku ?? "Non disponibile"}</td>
              <td>{item.availableQty}</td>
              <td>{item.reservedQty ?? "Non disponibile"}</td>
              <td>{formatDate(item.lastUpdatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
