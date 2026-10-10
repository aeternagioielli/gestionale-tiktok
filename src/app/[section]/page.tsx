import { ArrowUpRight, Bot, Settings2, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { LinkButton } from "@/components/ui/button";
import { getNavigationItem } from "@/lib/navigation";
import { ShopifySettings } from "@/components/settings/shopify-settings";
import { OpenAiTest } from "@/components/integrations/openai-test";
import { getShopifyIntegrationStatus } from "@/server/services/shopify-sync-service";
import {
  CustomersTable,
  InventoryTable,
  OrdersTable,
  ProductsTable,
} from "@/components/commerce/commerce-tables";
import {
  getCustomersForPage,
  getInventoryForPage,
  getOrdersForPage,
  getProductsForPage,
} from "@/server/services/commerce-service";

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
          <h2>{title}</h2>
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
  const item = getNavigationItem(`/${section}`);
  if (section === "orders") {
    const orders = await getOrdersForPage().catch(() => []);
    return (
      <CommercePage
        title="Orders"
        description="Ordini e vendite ricevuti dalle fonti collegate."
        hasData={orders.length > 0}
      >
        <OrdersTable orders={orders} />
      </CommercePage>
    );
  }
  if (section === "products") {
    const products = await getProductsForPage().catch(() => []);
    return (
      <CommercePage
        title="Products"
        description="Catalogo prodotti presente nel database."
        hasData={products.length > 0}
      >
        <ProductsTable products={products} />
      </CommercePage>
    );
  }
  if (section === "customers") {
    const customers = await getCustomersForPage().catch(() => []);
    return (
      <CommercePage
        title="Customers"
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
        title="Inventory"
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
            <p className="eyebrow">AETERNA OS / SETTINGS</p>
            <h2>Settings</h2>
            <p>Stato delle integrazioni e configurazione locale.</p>
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
    return (
      <div className="page-wrap astra-page">
        <div className="placeholder-header">
          <div>
            <p className="eyebrow">AETERNA OS / AI OPERATIVA</p>
            <h2>Astra</h2>
            <p>Un punto di osservazione intelligente per il lavoro quotidiano.</p>
          </div>
          <StatusBadge tone="disconnected">Non attivo</StatusBadge>
        </div>
        <section className="astra-hero" aria-labelledby="astra-workspace-title">
          <div className="astra-hero-orbit" aria-hidden="true">
            <Sparkles size={24} />
          </div>
          <div className="astra-hero-copy">
            <p className="eyebrow">SPAZIO OPERATIVO</p>
            <h1 id="astra-workspace-title">Astra è pronta quando lo sono i tuoi dati.</h1>
            <p>
              Questa superficie è predisposta per i report e le decisioni operative. Nessun report
              viene inventato o generato automaticamente finché l&apos;integrazione non è
              configurata.
            </p>
            <LinkButton href="/settings" variant="primary" icon={<Settings2 size={15} />}>
              Apri impostazioni <ArrowUpRight size={14} />
            </LinkButton>
          </div>
          <div className="astra-hero-mark" aria-hidden="true">
            <Bot size={54} strokeWidth={1.2} />
          </div>
        </section>
        <div className="astra-insight-grid">
          <div className="astra-insight-card">
            <span className="astra-insight-index">01</span>
            <strong>Contesto reale</strong>
            <p>Astra userà solo dati presenti nel database e nelle integrazioni autorizzate.</p>
          </div>
          <div className="astra-insight-card">
            <span className="astra-insight-index">02</span>
            <strong>Nessun rumore</strong>
            <p>Lo spazio resta vuoto finché non esiste un report operativo verificabile.</p>
          </div>
          <div className="astra-insight-card">
            <span className="astra-insight-index">03</span>
            <strong>Prossimo passo</strong>
            <p>Configura una fonte dati per rendere disponibili insight e priorità.</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="page-wrap placeholder-page">
      <div className="placeholder-header">
        <div>
          <p className="eyebrow">AETERNA OS / {item.label.toUpperCase()}</p>
          <h2>{item.label}</h2>
          <p>{item.description}</p>
        </div>
        <StatusBadge tone="demo">Fase 2 · Shell pronta</StatusBadge>
      </div>
      <EmptyState
        icon={<Settings2 size={18} />}
        eyebrow="MODULO PREDISPOSTO"
        title={`${item.label} sarà disponibile in una fase successiva.`}
        description="La struttura di navigazione è pronta. In questa fase non vengono mostrati dati demo per non confonderli con i dati reali dell'azienda."
      />
    </div>
  );
}
