import { Settings2 } from "lucide-react";
import { notFound } from "next/navigation";
import { TeamAiDashboard } from "@/components/team-ai/team-ai-dashboard";
import {
  CustomersTable,
  InventoryTable,
  OrdersTable,
  ProductsTable,
} from "@/components/commerce/commerce-tables";
import { OpenAiTest } from "@/components/integrations/openai-test";
import { ShopifySettings } from "@/components/settings/shopify-settings";
import { ShopifyProductCreator } from "@/components/commerce/shopify-product-creator";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { getNavigationItem, navigationItems } from "@/lib/navigation";
import {
  getCustomersForPage,
  getInventoryForPage,
  getOrdersForPage,
  getProductsForPage,
} from "@/server/services/commerce-service";
import { getLorenzoWorkspace } from "@/server/services/lorenzo-service";
import { getTeamAiDashboardData } from "@/server/services/team-ai-service";
import { getShopifyIntegrationStatus } from "@/server/services/shopify-sync-service";
import {
  listShopifyProductProposals,
  readStoredProductProposal,
} from "@/server/services/shopify-product-creator-service";

function CommercePage({
  title,
  description,
  children,
  hasData,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  hasData: boolean;
}) {
  return (
    <div className="page-wrap commerce-page">
      <div className="placeholder-header">
        <div>
          <p className="eyebrow">AETERNA OS / {title.toUpperCase()}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <StatusBadge tone={hasData ? "success" : "disconnected"}>
          {hasData ? "Dati reali" : "In attesa dei dati"}
        </StatusBadge>
      </div>
      {children}
    </div>
  );
}

export default async function SectionPlaceholder({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!navigationItems.some((entry) => entry.href === `/${section}`)) notFound();
  const item = getNavigationItem(`/${section}`);
  if (section === "orders") {
    const orders = await getOrdersForPage().catch(() => []);
    return (
      <CommercePage
        title="Ordini"
        description="Ordini e vendite ricevuti dalle fonti collegate."
        hasData={orders.length > 0}
      >
        <OrdersTable orders={orders} />
      </CommercePage>
    );
  }
  if (section === "products") {
    const [products, productProposals] = await Promise.all([
      getProductsForPage().catch(() => []),
      listShopifyProductProposals().catch(() => []),
    ]);
    const creatorProposals = productProposals.flatMap((task) => {
      const stored = readStoredProductProposal(task.description);
      return stored ? [{
        id: task.id,
        title: task.title,
        status: task.status,
        updatedAt: task.updatedAt,
        result: task.result,
        product: {
          title: stored.product.title,
          handle: stored.product.handle,
          descriptionHtml: stored.product.descriptionHtml,
          seoTitle: stored.product.seoTitle,
          seoDescription: stored.product.seoDescription,
          productType: stored.product.productType,
          materials: stored.product.materials,
          images: stored.product.images,
          variants: stored.product.variants.map((variant) => ({
            title: variant.title,
            sku: variant.sku,
            price: variant.price,
          })),
        },
      }] : [];
    });
    return (
      <CommercePage
        title="Prodotti"
        description="Catalogo prodotti presente nel database."
        hasData={products.length > 0}
      >
        <ProductsTable products={products} />
        <ShopifyProductCreator initialProposals={creatorProposals} />
      </CommercePage>
    );
  }
  if (section === "customers") {
    const customers = await getCustomersForPage().catch(() => []);
    return (
      <CommercePage
        title="Clienti"
        description="Clienti ricevuti dalle fonti collegate."
        hasData={customers.length > 0}
      >
        <CustomersTable customers={customers} />
      </CommercePage>
    );
  }
  if (section === "inventory") {
    const inventory = await getInventoryForPage().catch(() => []);
    return (
      <CommercePage
        title="Inventario"
        description="Disponibilità e quantità fornite dalle fonti collegate."
        hasData={inventory.length > 0}
      >
        <InventoryTable inventory={inventory} />
      </CommercePage>
    );
  }
  if (section === "settings") {
    const shopifyStatus = await getShopifyIntegrationStatus().catch(() => ({
      configured: false,
      storeDomain: null,
      status: "NOT_CONFIGURED" as const,
      lastSyncedAt: null,
      lastError: "Impossibile leggere lo stato di Shopify.",
    }));
    return (
      <div className="page-wrap settings-page">
        <div className="placeholder-header">
          <div>
            <p className="eyebrow">CONNESSIONI E SERVIZI</p>
            <h1>Impostazioni</h1>
            <p>Controlla le connessioni e gestisci le integrazioni disponibili.</p>
          </div>
          <StatusBadge tone="info">Configurazione server</StatusBadge>
        </div>
        <ShopifySettings
          initialStatus={{
            ...shopifyStatus,
            lastSyncedAt: shopifyStatus.lastSyncedAt?.toISOString() ?? null,
          }}
        />
        <OpenAiTest />
      </div>
    );
  }
  if (section === "astra") {
    const [dashboard, lorenzoWorkspace] = await Promise.all([
      getTeamAiDashboardData(),
      getLorenzoWorkspace(),
    ]);
    return <TeamAiDashboard dashboard={dashboard} lorenzoWorkspace={lorenzoWorkspace} />;
  }

  return (
    <div className="page-wrap placeholder-page">
      <div className="placeholder-header">
        <div>
          <p className="eyebrow">AETERNA OS / {item.label.toUpperCase()}</p>
          <h1>{item.label}</h1>
          <p>{item.description}</p>
        </div>
        <StatusBadge tone="muted">Non ancora disponibile</StatusBadge>
      </div>
      <EmptyState
        icon={<Settings2 size={18} />}
        eyebrow="MODULO PREDISPOSTO"
        title="Questo modulo è in preparazione"
        description={`Qui troverai: ${item.description.toLowerCase()}. Il modulo non è ancora operativo: nessun dato simulato e nessuna azione automatica.`}
        href={section === "astra-reports" ? "/astra" : "/"}
        action={
          section === "astra-reports"
            ? "Apri i report di Lorenzo in TEAM AI"
            : "Torna alla panoramica"
        }
      />
    </div>
  );
}
