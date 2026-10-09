import {
  Activity,
  ArrowRight,
  BarChart3,
  Boxes,
  Bot,
  CheckCircle2,
  Globe2,
  Megaphone,
  Package,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { LinkButton } from "@/components/ui/button";
import { PriorityTask } from "@/components/dashboard/priority-task";
import {
  emptyOverviewData,
  getOverviewData,
  type OverviewData,
} from "@/server/services/overview-service";

export const dynamic = "force-dynamic";

const situationCards = [
  {
    label: "Ordini",
    icon: ShoppingBag,
    metric: "orders",
    connectedCopy: "Ordini registrati oggi.",
    disconnectedCopy: "Collega Shopify per iniziare a ricevere i dati.",
    href: "/settings",
  },
  {
    label: "Vendite",
    icon: BarChart3,
    metric: "sales",
    connectedCopy: "Totale degli ordini registrati.",
    disconnectedCopy: "Le vendite appariranno con i primi ordini.",
    href: "/orders",
  },
  {
    label: "Prodotti",
    icon: Package,
    metric: "products",
    connectedCopy: "Prodotti presenti nel catalogo.",
    disconnectedCopy: "Il catalogo non contiene ancora prodotti.",
    href: "/products",
  },
  {
    label: "Inventario",
    icon: Boxes,
    metric: "inventory",
    connectedCopy: "Prodotti con inventario tracciato.",
    disconnectedCopy: "Nessun inventario disponibile.",
    href: "/inventory",
  },
  {
    label: "Sito",
    icon: Globe2,
    metric: "website",
    connectedCopy: "Dati analytics disponibili.",
    disconnectedCopy: "Collega analytics per monitorare il sito.",
    href: "/settings",
  },
  {
    label: "Pubblicità",
    icon: Megaphone,
    metric: "advertising",
    connectedCopy: "Dati Meta Ads disponibili.",
    disconnectedCopy: "Meta Ads non è ancora collegato.",
    href: "/settings",
  },
] as const;

function formatMetric(
  value: number | null,
  metric: (typeof situationCards)[number]["metric"],
): string {
  if (value === null) return "Dati non disponibili";
  if (metric === "sales")
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
  return new Intl.NumberFormat("it-IT").format(value);
}

function activityLabel(action: string): string {
  const labels: Record<string, string> = {
    TASK_COMPLETED: "Task completata",
    TASK_CREATED: "Task creata",
    GOAL_UPDATED: "Obiettivo aggiornato",
    REPORT_GENERATED: "Report generato",
    SYNC_STARTED: "Sincronizzazione avviata",
    SYNC_COMPLETED: "Sincronizzazione completata",
    SYNC_FAILED: "Sincronizzazione fallita",
  };
  return labels[action] ?? "Attività registrata";
}

async function loadOverview(): Promise<OverviewData & { error?: string }> {
  try {
    return await getOverviewData();
  } catch {
    return {
      ...emptyOverviewData(),
      databaseConfigured: true,
      error: "Il database non è raggiungibile. Verifica la configurazione locale.",
    };
  }
}

export default async function OverviewPage() {
  const data = await loadOverview();
  const hasOrderData = data.metrics.orders !== null;
  const goal = data.goal;
  const progress = goal?.progress ?? null;

  return (
    <div className="page-wrap overview-page">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">MERCOLEDÌ, 8 OTTOBRE 2026 · PANORAMICA</p>
          <h2>Buongiorno, Kevin.</h2>
          <p>Una vista chiara di ciò che succede e del prossimo passo per AETERNA.</p>
        </div>
        <StatusBadge
          tone={data.error ? "error" : data.databaseConfigured ? "info" : "disconnected"}
        >
          {data.error
            ? "Database non raggiungibile"
            : data.databaseConfigured
              ? "Database locale"
              : "Non ancora configurato"}
        </StatusBadge>
      </section>
      {data.error && (
        <div className="system-alert" role="alert">
          {data.error}
        </div>
      )}

      <section className="hero-overview" aria-labelledby="performance-title">
        <div className="hero-copy">
          <p className="eyebrow">OBIETTIVO OPERATIVO</p>
          <h1 id="performance-title">Come sta andando AETERNA</h1>
          {goal ? (
            <>
              <p>
                Obiettivo attivo: <strong>{goal.name}</strong>. Il progresso viene calcolato dal
                Goal Engine usando i dati di vendita disponibili.
              </p>
              {hasOrderData ? (
                <>
                  <div className="hero-meta">
                    <span>
                      <strong>{goal.currentValue}</strong> ordini oggi
                    </span>
                    <span className="meta-divider" />
                    <span>
                      Obiettivo <strong>{goal.target}</strong> ordini/giorno
                    </span>
                  </div>
                  <ProgressBar value={progress ?? 0} label="Progresso verso l'obiettivo attivo" />
                </>
              ) : (
                <div className="data-waiting">
                  <strong>In attesa dei dati di vendita</strong>
                  <span>
                    Collega Shopify o registra un ordine per iniziare a monitorare il percorso.
                  </span>
                </div>
              )}
            </>
          ) : (
            <p>
              Nessun obiettivo attivo. Inizializza la struttura dell&apos;obiettivo per iniziare il
              percorso operativo.
            </p>
          )}
        </div>
        {goal && hasOrderData ? (
          <div
            className="hero-score"
            aria-label={`${goal.currentValue} di ${goal.target} ordini al giorno`}
          >
            <span className="score-value">{goal.currentValue}</span>
            <span className="score-target">/ {goal.target}</span>
            <span className="score-caption">ordini oggi</span>
          </div>
        ) : (
          <div className="hero-score hero-score-empty">
            <span className="score-caption">
              Dati vendita
              <br />
              non disponibili
            </span>
          </div>
        )}
      </section>

      <section className="content-section" aria-labelledby="today-title">
        <SectionHeader
          eyebrow="LA PROSSIMA MOSSA"
          title="Cosa devo fare oggi"
          description="La priorità viene calcolata dal Task Engine. Le task bloccate restano escluse."
          action={
            <StatusBadge tone={data.priorityTask ? "warning" : "muted"}>
              {data.priorityTask ? "Richiede attenzione" : "Nessuna attività urgente"}
            </StatusBadge>
          }
        />
        {data.priorityTask ? (
          <PriorityTask task={data.priorityTask} />
        ) : (
          <EmptyState
            icon={<CheckCircle2 size={18} />}
            eyebrow="TASK ENGINE"
            title="Nessuna attività urgente"
            description="Quando sarà presente una task disponibile, la priorità numero 1 apparirà qui."
          />
        )}
        {data.blockedTasks.length > 0 && (
          <div className="locked-list">
            <div className="locked-title">
              <span>Prossime azioni bloccate</span>
              <span>Prerequisiti mancanti</span>
            </div>
            {data.blockedTasks.map((task) => (
              <div className="locked-row" key={task.id}>
                <span className="locked-number">LOCKED</span>
                <span>
                  <strong>{task.title}</strong>
                  <small>
                    {task.missingPrerequisites.length > 0
                      ? `Manca: ${task.missingPrerequisites.join(", ")}`
                      : "Bloccata dal percorso operativo"}
                  </small>
                </span>
                <StatusBadge tone="locked">{task.status}</StatusBadge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="content-section" aria-labelledby="situation-title">
        <SectionHeader
          eyebrow="DATI PRESENTI NEL DATABASE"
          title="Situazione azienda"
          description="L'assenza di dati non viene trasformata in uno zero."
        />
        <div className="situation-grid">
          {situationCards.map(
            ({ label, icon: CardIcon, metric, connectedCopy, disconnectedCopy, href }) => {
              const value = data.metrics[metric];
              return (
                <article className="situation-card" key={label}>
                  <div className="card-icon">
                    <CardIcon size={17} strokeWidth={1.7} />
                  </div>
                  <div className="situation-card-copy">
                    <div className="card-label-row">
                      <span className="card-label">{label}</span>
                      <StatusBadge tone={value === null ? "disconnected" : "success"}>
                        {value === null ? "Non disponibile" : "Database"}
                      </StatusBadge>
                    </div>
                    <h3>{formatMetric(value, metric)}</h3>
                    <p>{value === null ? disconnectedCopy : connectedCopy}</p>
                    {href && (
                      <LinkButton href={href} variant="ghost" icon={<ArrowRight size={14} />}>
                        Apri sezione
                      </LinkButton>
                    )}
                  </div>
                </article>
              );
            },
          )}
        </div>
      </section>

      <section
        className="content-section integrations-section"
        aria-labelledby="integrations-title"
      >
        <SectionHeader
          eyebrow="STATO COLLEGAMENTI"
          title="Integrazioni"
          description="Nessuna integrazione esterna viene attivata automaticamente."
        />
        <div className="integration-grid">
          {data.integrations.map((integration) => (
            <div className="integration-item" key={integration.type}>
              <span>{integration.name}</span>
              <StatusBadge tone={integration.status === "CONNECTED" ? "success" : "disconnected"}>
                {integration.status === "CONNECTED"
                  ? "Collegato"
                  : integration.status === "NOT_CONFIGURED"
                    ? "Non configurato"
                    : integration.status}
              </StatusBadge>
            </div>
          ))}
        </div>
      </section>

      <section className="content-section path-section" aria-labelledby="goal-title">
        <SectionHeader
          eyebrow="PERCORSO OPERATIVO"
          title={goal ? goal.name : "Obiettivo operativo"}
          description="La fase corrente e la successiva arrivano dal Goal Engine."
        />
        {goal ? (
          <div className="path-card">
            <div className="path-steps">
              {goal.phases.map((phase, index) => {
                const isCurrent = goal.currentPhase?.id === phase.id;
                const isNext = goal.nextPhase?.id === phase.id;
                return (
                  <div className="path-step-wrap" key={phase.id}>
                    <div
                      className={`path-step ${isCurrent ? "path-step-current" : isNext ? "path-step-next" : "path-step-locked"}`}
                    >
                      <span>{phase.target}</span>
                    </div>
                    <p>{phase.target === 0 ? "Partenza" : `${phase.target} ${goal.unit}`}</p>
                    {index < goal.phases.length - 1 && <span className="path-line" />}
                  </div>
                );
              })}
            </div>
            <div className="path-footer">
              <span>
                <span className="path-dot current" />
                {hasOrderData
                  ? `Fase attuale: ${goal.currentPhase?.target ?? "n/d"} ${goal.unit}`
                  : "Fase attuale: in attesa dei dati"}
              </span>
              {goal.nextPhase && (
                <span>
                  <ArrowRight size={15} /> Prossima fase: {goal.nextPhase.target} {goal.unit}
                </span>
              )}
              <span>
                <Activity size={15} /> Progresso:{" "}
                {progress === null ? "non disponibile" : `${Math.round(progress)}%`}
              </span>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<Activity size={18} />}
            eyebrow="GOALS"
            title="Nessun obiettivo attivo"
            description="Inizializza l'obiettivo operativo per visualizzare il percorso."
          />
        )}
      </section>

      <div className="lower-grid">
        <section className="content-section" aria-labelledby="astra-title">
          <SectionHeader
            eyebrow="AI OPERATIVA"
            title="Astra"
            action={
              <StatusBadge tone={data.report ? "success" : "disconnected"}>
                {data.report ? "Report disponibile" : "Non attivo"}
              </StatusBadge>
            }
          />
          {data.report ? (
            <div className="astra-card">
              <div className="astra-mark">
                <Sparkles size={20} />
              </div>
              <div>
                <h3>ASTRA DAILY REPORT · {data.report.reportDate.toLocaleDateString("it-IT")}</h3>
                <p>{data.report.generalSituation}</p>
                <p>
                  <strong>Priorità #1:</strong> {data.report.priorityOne}
                </p>
                <LinkButton href="/astra" variant="primary" icon={<Bot size={15} />}>
                  Parla con Astra
                </LinkButton>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Bot size={18} />}
              eyebrow="ASTRA DAILY REPORT"
              title="Nessun report disponibile"
              description="Astra non ha ancora generato un report. Nessun report viene creato automaticamente in questa fase."
              href="/astra"
              action="Parla con Astra"
            />
          )}
        </section>
        <section className="content-section" aria-labelledby="activity-title">
          <SectionHeader eyebrow="AUDIT LOG" title="Ultime attività" />
          {data.activities.length > 0 ? (
            <div className="activity-list">
              {data.activities.map((activity) => (
                <div className="activity-row" key={activity.id}>
                  <span className="activity-icon">
                    <Activity size={14} />
                  </span>
                  <span>
                    <strong>{activityLabel(activity.action)}</strong>
                    <small>
                      {activity.entityType}
                      {activity.entityId ? ` · ${activity.entityId}` : ""}
                    </small>
                  </span>
                  <time dateTime={activity.createdAt.toISOString()}>
                    {activity.createdAt.toLocaleDateString("it-IT")}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Activity size={18} />}
              title="Nessuna attività registrata"
              description="Le attività appariranno qui quando verranno eseguite azioni reali nel gestionale."
            />
          )}
        </section>
      </div>
    </div>
  );
}
