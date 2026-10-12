import { Bot, Clock3, Database, Sparkles } from "lucide-react";
import { AgentAvatar } from "@/components/team-ai/agent-avatar";
import { LorenzoWorkspace } from "@/components/lorenzo/lorenzo-workspace";
import { StatusBadge } from "@/components/ui/status-badge";
import type { LorenzoWorkspace as LorenzoWorkspaceData } from "@/server/services/lorenzo-service";
import type { TeamAiAgentCard, TeamAiDashboardData } from "@/server/services/team-ai-service";
import styles from "./team-ai-dashboard.module.css";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function agentStatus(agent: TeamAiAgentCard) {
  if (agent.status === "RUNNING")
    return { label: "In esecuzione", tone: "info" as const, state: "working" as const };
  if (agent.status === "QUEUED")
    return { label: "In coda", tone: "muted" as const, state: "idle" as const };
  if (agent.status === "AWAITING_APPROVAL")
    return { label: "Approvazione richiesta", tone: "warning" as const, state: "awaiting" as const };
  if (agent.status === "ERROR")
    return { label: "Errore", tone: "error" as const, state: "failed" as const };
  if (agent.status === "AVAILABLE")
    return { label: "Pronto su richiesta", tone: "success" as const, state: "idle" as const };
  return { label: "Non configurato", tone: "disconnected" as const, state: "idle" as const };
}

function AgentCard({ agent, ceo = false }: { agent: TeamAiAgentCard; ceo?: boolean }) {
  const status = agentStatus(agent);
  const stateClass =
    `agent${status.state[0].toUpperCase()}${status.state.slice(1)}` as keyof typeof styles;
  return (
    <article className={`${styles.agentCard} ${ceo ? styles.ceoCard : ""} ${styles[stateClass]}`}>
      <AgentAvatar id={agent.id} state={status.state} />
      <div className={styles.agentCopy}>
        <p className="eyebrow">{agent.role}</p>
        <h3>{agent.name}</h3>
        <p>{agent.scope}</p>
      </div>
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      {agent.status === "RUNNING" && agent.currentActivity && (
        <p className={styles.currentActivity}>{agent.currentActivity}</p>
      )}
      {agent.status !== "RUNNING" && agent.assignedTask && (
        <p className={styles.currentActivity}>Attivita assegnata: {agent.assignedTask.title}</p>
      )}
      {agent.status !== "RUNNING" && <p className={styles.agentNote}>{agent.statusReason}</p>}
    </article>
  );
}

function activityStatus(status: string) {
  if (status === "QUEUED") return { label: "In coda", tone: "muted" as const };
  if (status === "AWAITING_APPROVAL") return { label: "Da approvare", tone: "warning" as const };
  if (status === "SUCCESS") return { label: "Completata", tone: "completed" as const };
  if (status === "ERROR" || status === "FAILED") return { label: "Errore", tone: "error" as const };
  if (status === "RUNNING") return { label: "In corso", tone: "info" as const };
  return { label: status, tone: "muted" as const };
}

export function TeamAiDashboard({
  dashboard,
  lorenzoWorkspace,
}: {
  dashboard: TeamAiDashboardData;
  lorenzoWorkspace: LorenzoWorkspaceData;
}) {
  const lorenzo = dashboard.agents.find((agent) => agent.id === "lorenzo");
  const team = dashboard.agents.filter((agent) => agent.id !== "lorenzo");
  const usage = dashboard.unattributedUsage;
  return (
    <div className={`page-wrap ${styles.workspace}`}>
      <header className={`${styles.header} placeholder-header`}>
        <div>
          <p className="eyebrow">AETERNA OS / TEAM AI</p>
          <h1>TEAM AI</h1>
          <p>Una gerarchia operativa pronta a crescere, senza automazioni attive.</p>
        </div>
        <StatusBadge tone={dashboard.databaseAvailable ? "success" : "disconnected"}>
          {dashboard.databaseAvailable ? "Registro disponibile" : "Registro non disponibile"}
        </StatusBadge>
      </header>

      <section className={styles.pyramid} aria-labelledby="team-ai-pyramid-title">
        <div className={styles.pyramidIntro}>
          <p className="eyebrow">STRUTTURA OPERATIVA</p>
          <h2 id="team-ai-pyramid-title">Un CEO, cinque ruoli specializzati.</h2>
          <p>Gli stati mostrano soltanto configurazione e attività verificabili nel sistema.</p>
        </div>
        {lorenzo && (
          <div className={styles.ceoWrap}>
            <AgentCard agent={lorenzo} ceo />
          </div>
        )}
        <div className={styles.teamGrid} aria-label="Agenti AI specializzati">
          {team.map((agent) => (
            <AgentCard agent={agent} key={agent.id} />
          ))}
        </div>
      </section>

      <section className={styles.auditStrip} aria-label="Stato audit AI">
        <Database size={17} aria-hidden="true" />
        <p>
          <strong>Audit AI</strong> ·{" "}
          {dashboard.databaseAvailable
            ? `${usage.invocationCount} invocazioni registrate, non attribuite ai singoli agenti.`
            : "Il database non è raggiungibile."}
        </p>
        <span>
          {usage.trackingStartedAt
            ? `Attivo dal ${formatDate(usage.trackingStartedAt)}`
            : "Nessuna invocazione registrata"}
        </span>
      </section>

      <section className={styles.activitySection} aria-labelledby="team-activity-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className="eyebrow">REGISTRO REALE</p>
            <h2 id="team-activity-title">Attività recenti</h2>
          </div>
          <Sparkles size={18} aria-hidden="true" />
        </div>
        {dashboard.recentOperationalTasks.length || dashboard.recentActivities.length ? (
          <ol className={styles.activityList}>
            {dashboard.recentOperationalTasks.map((activity) => {
              const status = activityStatus(activity.status);
              return (
                <li key={activity.id}>
                  <span className={styles.activityMarker} aria-hidden="true" />
                  <div>
                    <strong>{activity.title}</strong>
                    <span>{activity.agent} · {activity.source === "AUTOMATIC" ? "Proposta di Lorenzo" : "Registro operativo"}</span>
                  </div>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  <time dateTime={activity.updatedAt}>{formatDate(activity.updatedAt)}</time>
                </li>
              );
            })}
            {dashboard.recentActivities.map((activity) => {
              const status = activityStatus(activity.status);
              return (
                <li key={activity.id}>
                  <span className={styles.activityMarker} aria-hidden="true" />
                  <div>
                    <strong>Invocazione AI non attribuita</strong>
                    <span>
                      {activity.taskType} · {activity.model}
                    </span>
                  </div>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  <time dateTime={activity.createdAt}>{formatDate(activity.createdAt)}</time>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className={styles.activityEmpty}>
            <Clock3 size={20} aria-hidden="true" />
            <div>
              <h3>Nessuna attività registrata</h3>
              <p>Le invocazioni AI appariranno qui quando il sistema le registrerà nell’audit.</p>
            </div>
          </div>
        )}
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
