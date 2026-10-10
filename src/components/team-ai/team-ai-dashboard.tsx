import {
  Activity,
  Bot,
  BriefcaseBusiness,
  CircleAlert,
  CircleCheck,
  Clock3,
  Coins,
  Megaphone,
  PackageCheck,
  Palette,
  ReceiptText,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type { ComponentType } from "react";
import { LorenzoWorkspace } from "@/components/lorenzo/lorenzo-workspace";
import { StatusBadge } from "@/components/ui/status-badge";
import type { LorenzoWorkspace as LorenzoWorkspaceData } from "@/server/services/lorenzo-service";
import type { TeamAiAgentCard, TeamAiDashboardData } from "@/server/services/team-ai-service";
import styles from "./team-ai-dashboard.module.css";

const icons: Record<
  TeamAiAgentCard["id"],
  ComponentType<{ size?: number; strokeWidth?: number }>
> = {
  lorenzo: BriefcaseBusiness,
  marco: Megaphone,
  giulia: Palette,
  alessandro: PackageCheck,
  matteo: ReceiptText,
  francesca: Coins,
};

function formatTokens(value: number): string {
  return new Intl.NumberFormat("it-IT").format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "Nessuna esecuzione registrata";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function statusPresentation(status: TeamAiAgentCard["status"]) {
  if (status === "AVAILABLE")
    return { tone: "success" as const, label: "Disponibile", icon: CircleCheck };
  if (status === "RUNNING")
    return { tone: "info" as const, label: "In esecuzione", icon: Activity };
  if (status === "ERROR") return { tone: "error" as const, label: "Errore", icon: CircleAlert };
  return { tone: "disconnected" as const, label: "Non configurato", icon: Clock3 };
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function AgentCard({ agent }: { agent: TeamAiAgentCard }) {
  const status = statusPresentation(agent.status);
  const Icon = icons[agent.id];
  const StatusIcon = status.icon;
  return (
    <article className={styles.agentCard}>
      <div className={styles.agentTopline}>
        <div className={styles.agentIcon} aria-hidden="true">
          <Icon size={20} strokeWidth={1.5} />
        </div>
        <StatusBadge tone={status.tone}>
          <StatusIcon size={11} aria-hidden="true" /> {status.label}
        </StatusBadge>
      </div>
      <div>
        <p className="eyebrow">{agent.role.toUpperCase()}</p>
        <h2>{agent.name}</h2>
        <p className={styles.scope}>{agent.scope}</p>
      </div>
      <div className={styles.activity}>
        <span>Attività</span>
        <p>{agent.currentActivity}</p>
      </div>
      <dl className={styles.agentData}>
        <div>
          <dt>Modello effettivo</dt>
          <dd>{agent.actualModel ?? "Non attribuibile"}</dd>
        </div>
        <div>
          <dt>Configurazione</dt>
          <dd>{agent.configuredModel ?? "Non configurato"}</dd>
        </div>
        <div>
          <dt>Token</dt>
          <dd>
            {agent.totalTokens === null ? "Non attribuibili" : formatTokens(agent.totalTokens)}
          </dd>
        </div>
        <div>
          <dt>Costo API stimato</dt>
          <dd>
            {agent.estimatedCostUsd === null
              ? "Non calcolabile"
              : `$${agent.estimatedCostUsd.toFixed(4)}`}
          </dd>
        </div>
        <div>
          <dt>Ultima esecuzione</dt>
          <dd>{formatDate(agent.lastExecutionAt)}</dd>
        </div>
      </dl>
      <details className={styles.agentDetails}>
        <summary>Apri vista dettagliata</summary>
        <p>{agent.statusReason}</p>
        <p>
          I dati di audit non contengono ancora un identificativo del dipendente AI: modello, token,
          costo e ultima esecuzione non possono essere assegnati a questa scheda con certezza.
        </p>
      </details>
    </article>
  );
}

export function TeamAiDashboard({
  dashboard,
  lorenzoWorkspace,
}: {
  dashboard: TeamAiDashboardData;
  lorenzoWorkspace: LorenzoWorkspaceData;
}) {
  const usage = dashboard.unattributedUsage;
  return (
    <div className="page-wrap">
      <header className="placeholder-header">
        <div>
          <p className="eyebrow">AETERNA OS / TEAM AI</p>
          <h2>TEAM AI</h2>
          <p>Centro di controllo dei dipendenti AI. Le attività restano manuali e verificabili.</p>
        </div>
        <StatusBadge tone={dashboard.databaseAvailable ? "success" : "disconnected"}>
          {dashboard.databaseAvailable ? "Audit disponibile" : "Audit non disponibile"}
        </StatusBadge>
      </header>

      <section className={styles.hero} aria-labelledby="team-ai-title">
        <div className={styles.heroMark} aria-hidden="true">
          <UsersRound size={33} strokeWidth={1.35} />
        </div>
        <div>
          <p className="eyebrow">CONTROLLO OPERATIVO</p>
          <h1 id="team-ai-title">Sei ruoli. Una sola fonte di verità.</h1>
          <p>
            Stato e consumi derivano esclusivamente dai dati audit disponibili. Nessun agente viene
            avviato da questa dashboard.
          </p>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Indicatori TEAM AI">
        <Metric
          label="Agenti configurati"
          value={`${dashboard.configuredAgents} / ${dashboard.agents.length}`}
          detail="Funzionalità realmente disponibili"
        />
        <Metric
          label="Agenti in esecuzione"
          value={String(dashboard.runningAgents)}
          detail="Solo esecuzioni con prova persistita"
        />
        <Metric
          label="Token registrati"
          value={formatTokens(dashboard.totalRecordedTokens)}
          detail="Totale non attribuito agli agenti"
        />
      </section>

      <section className={styles.audit} aria-labelledby="audit-title">
        <div className={styles.auditIcon} aria-hidden="true">
          <Sparkles size={18} />
        </div>
        <div>
          <p className="eyebrow">AUDIT AI</p>
          <h2 id="audit-title">Consumi non attribuiti</h2>
          <p>
            Il registro corrente non associa un&apos;invocazione a un dipendente AI. I valori sono
            completi solo dalla data di attivazione dell&apos;audit:{" "}
            {formatDate(usage.trackingStartedAt)}.
          </p>
        </div>
        <dl className={styles.auditMetrics}>
          <div>
            <dt>Input</dt>
            <dd>{formatTokens(usage.inputTokens)}</dd>
          </div>
          <div>
            <dt>Output</dt>
            <dd>{formatTokens(usage.outputTokens)}</dd>
          </div>
          <div>
            <dt>Totali</dt>
            <dd>{formatTokens(usage.totalTokens)}</dd>
          </div>
          <div>
            <dt>Invocazioni</dt>
            <dd>{formatTokens(usage.invocationCount)}</dd>
          </div>
        </dl>
        <p className={styles.costNote}>
          Costo stimato: non calcolabile, perché non esiste un listino prezzi verificato configurato
          nell&apos;applicazione.
        </p>
        {usage.latestInvocation && (
          <p className={styles.latestInvocation}>
            Ultima invocazione non attribuita: {usage.latestInvocation.model} ·{" "}
            {usage.latestInvocation.taskType} · {formatDate(usage.latestInvocation.createdAt)}.
          </p>
        )}
      </section>

      <section className={styles.agents} aria-label="Dipendenti AI">
        {dashboard.agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </section>

      <section
        id="lorenzo-reports"
        className={styles.lorenzoReports}
        aria-label="Report CEO Lorenzo"
      >
        <div className={styles.reportHeading}>
          <Bot size={18} aria-hidden="true" />
          <div>
            <p className="eyebrow">LORENZO / CEO</p>
            <h2>Report e analisi</h2>
          </div>
        </div>
        <LorenzoWorkspace workspace={lorenzoWorkspace} embedded />
      </section>
    </div>
  );
}
