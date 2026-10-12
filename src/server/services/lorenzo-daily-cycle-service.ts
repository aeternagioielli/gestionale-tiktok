import { IntegrationStatus, IntegrationType } from "@/generated/prisma/enums";
import { isDatabaseConfigured, getDatabaseClient } from "@/server/db";
import { createAgentTask, type AgentTaskView } from "@/server/services/agent-task-service";
import type { AgentId, AgentTaskRisk } from "@/server/domain/agent-task-workflow";

export type DailyTaskProposal = {
  agent: AgentId;
  title: string;
  description: string;
  priority: number;
  risk: AgentTaskRisk;
  dedupeKey: string;
};

export type DailyLorenzoPlan = {
  databaseConfigured: boolean;
  databaseAvailable: boolean;
  generatedAt: string;
  dataAvailability: { shopify: boolean; metaAds: boolean; analytics: boolean; recordedOrders: number | null };
  proposals: DailyTaskProposal[];
  notes: string[];
};

function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Builds a deterministic, data-only proposal. It deliberately does not call OpenAI,
 * connect to third-party services, or start a scheduler. Persisting it still requires
 * an explicit user request through the protected endpoint.
 */
export async function getDailyLorenzoPlan(now = new Date()): Promise<DailyLorenzoPlan> {
  const base = {
    generatedAt: now.toISOString(),
    dataAvailability: { shopify: false, metaAds: false, analytics: false, recordedOrders: null as number | null },
  };
  if (!isDatabaseConfigured()) {
    return {
      ...base,
      databaseConfigured: false,
      databaseAvailable: false,
      proposals: [],
      notes: ["Database non configurato: non e possibile preparare un piano operativo basato su dati reali."],
    };
  }

  try {
    const db = getDatabaseClient();
    const [integrations, recordedOrders] = await Promise.all([
      db.integration.findMany({
        where: { type: { in: [IntegrationType.SHOPIFY, IntegrationType.META_ADS, IntegrationType.ANALYTICS] } },
        select: { type: true, status: true },
      }),
      db.order.count(),
    ]);
    const connected = new Set(integrations.filter((entry) => entry.status === IntegrationStatus.CONNECTED).map((entry) => entry.type));
    const dataAvailability = {
      shopify: connected.has(IntegrationType.SHOPIFY),
      metaAds: connected.has(IntegrationType.META_ADS),
      analytics: connected.has(IntegrationType.ANALYTICS),
      recordedOrders,
    };
    const key = dayKey(now);
    const proposals: DailyTaskProposal[] = [];
    const notes: string[] = [];

    if (!dataAvailability.shopify) {
      proposals.push({ agent: "ALESSANDRO", title: "Configurare la raccolta dati Shopify", description: "Shopify non risulta collegato nei dati di integrazione. Configurare il collegamento e verificare quali dati ordini, prodotti e inventario sono disponibili.", priority: 10, risk: "CONFIGURATION", dedupeKey: `daily:${key}:shopify-configuration` });
      notes.push("I dati Shopify non sono disponibili: non vengono formulate ipotesi su traffico, conversione o vendite.");
    } else {
      proposals.push({ agent: "ALESSANDRO", title: "Verificare i dati del funnel Shopify", description: "Il collegamento Shopify risulta disponibile; verificare quali dati reali su comportamento utenti e funnel sono stati raccolti prima di proporre ottimizzazioni.", priority: 20, risk: "DATA_COLLECTION", dedupeKey: `daily:${key}:shopify-funnel-data` });
    }

    if (!dataAvailability.metaAds) {
      proposals.push({ agent: "MARCO", title: "Configurare il collegamento Meta Ads", description: "Meta Ads non risulta collegato nei dati di integrazione. Collegare la fonte e definire le metriche necessarie per valutare ordini profittevoli.", priority: 15, risk: "CONFIGURATION", dedupeKey: `daily:${key}:meta-configuration` });
      notes.push("Le metriche Meta Ads non sono disponibili: non vengono suggerite modifiche a campagne o budget.");
    } else {
      proposals.push({ agent: "MARCO", title: "Verificare disponibilita metriche Meta Ads", description: "Il collegamento Meta Ads risulta disponibile; verificare che costi, conversioni e attribuzione siano realmente presenti prima di formulare proposte operative.", priority: 25, risk: "DATA_COLLECTION", dedupeKey: `daily:${key}:meta-metrics` });
    }

    if (!dataAvailability.analytics) {
      proposals.push({ agent: "GIULIA", title: "Definire il piano di raccolta dati SEO e contenuti", description: "Analytics non risulta collegato. Definire le fonti e gli indicatori necessari per misurare il traffico organico e il rendimento dei contenuti, senza pubblicare contenuti.", priority: 30, risk: "CONFIGURATION", dedupeKey: `daily:${key}:analytics-configuration` });
      notes.push("I dati analytics non sono disponibili: non vengono inventati trend SEO o performance dei contenuti.");
    }

    if (recordedOrders === 0) {
      proposals.push({ agent: "MATTEO", title: "Verificare la raccolta degli ordini", description: "Nel database non risultano ordini registrati. Verificare se l'importazione ordini e la relativa raccolta dati sono configurate prima di trarre conclusioni commerciali.", priority: 35, risk: "DATA_COLLECTION", dedupeKey: `daily:${key}:order-data-check` });
      notes.push("Non sono presenti ordini registrati: il piano non deduce un calo delle vendite.");
    }

    return { databaseConfigured: true, databaseAvailable: true, generatedAt: base.generatedAt, dataAvailability, proposals, notes };
  } catch {
    return { ...base, databaseConfigured: true, databaseAvailable: false, proposals: [], notes: ["Il database non e momentaneamente raggiungibile: il piano non e stato generato."] };
  }
}

export async function persistDailyLorenzoPlan(now = new Date()): Promise<{ plan: DailyLorenzoPlan; tasks: AgentTaskView[]; created: number }> {
  const plan = await getDailyLorenzoPlan(now);
  if (!plan.databaseAvailable) return { plan, tasks: [], created: 0 };
  const saved = await Promise.all(plan.proposals.map((proposal) => createAgentTask({ ...proposal, source: "AUTOMATIC" })));
  return { plan, tasks: saved.map((entry) => entry.task), created: saved.filter((entry) => entry.created).length };
}
