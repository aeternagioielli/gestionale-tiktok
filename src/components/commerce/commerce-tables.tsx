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
    <div className="table-wrap" role="region" aria-label="Ordini: tabella scorrevole" tabIndex={0}>
      <table className="data-table">
        <caption className="sr-only">Ordini</caption>
        <thead>
          <tr>
            <th scope="col">Ordine</th>
            <th scope="col">Data</th>
            <th scope="col">Cliente</th>
            <th scope="col">Totale</th>
            <th scope="col">Stato</th>
            <th scope="col">Pagamento</th>
            <th scope="col">Spedizione</th>
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
    <div
      className="table-wrap"
      role="region"
      aria-label="Prodotti: tabella scorrevole"
      tabIndex={0}
    >
      <table className="data-table">
        <caption className="sr-only">Prodotti</caption>
        <thead>
          <tr>
            <th scope="col">Prodotto</th>
            <th scope="col">SKU</th>
            <th scope="col">Prezzo</th>
            <th scope="col">Stato</th>
            <th scope="col">Disponibilità</th>
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
    <div className="table-wrap" role="region" aria-label="Clienti: tabella scorrevole" tabIndex={0}>
      <table className="data-table">
        <caption className="sr-only">Clienti</caption>
        <thead>
          <tr>
            <th scope="col">Nome</th>
            <th scope="col">Email</th>
            <th scope="col">Ordini</th>
            <th scope="col">Ultimo ordine</th>
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
    <div
      className="table-wrap"
      role="region"
      aria-label="Inventario: tabella scorrevole"
      tabIndex={0}
    >
      <table className="data-table">
        <caption className="sr-only">Inventario</caption>
        <thead>
          <tr>
            <th scope="col">Prodotto</th>
            <th scope="col">SKU</th>
            <th scope="col">Disponibile</th>
            <th scope="col">Riservato</th>
            <th scope="col">Aggiornato</th>
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
