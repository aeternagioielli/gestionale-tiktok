"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  ClipboardList,
  FileText,
  Layers3,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AgentAvatar } from "./agent-avatar";
import { LorenzoWorkspace } from "@/components/lorenzo/lorenzo-workspace";
import type { LorenzoWorkspace as LorenzoWorkspaceData } from "@/server/services/lorenzo-service";
import type { TeamAiAgentCard, TeamAiDashboardData } from "@/server/services/team-ai-service";
import type { AgentTaskView } from "@/server/services/agent-task-service";
import type { DailyLorenzoPlan } from "@/server/services/lorenzo-daily-cycle-service";
import {
  requestTeamData,
  tasksResponse,
  taskResponse,
  planResponse,
  savedPlanResponse,
} from "./team-ai-client";
import styles from "./team-ai-dashboard.module.css";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(new Date(value));
}
const statusLabels: Record<string, string> = {
  AVAILABLE: "Su richiesta",
  NOT_CONFIGURED: "Non configurato",
  QUEUED: "In coda",
  RUNNING: "In esecuzione",
  AWAITING_APPROVAL: "Da approvare",
  COMPLETED: "Completata",
  SUCCESS: "Completata",
  FAILED: "Errore",
  ERROR: "Errore",
  CANCELLED: "Annullata",
};
function Status({ status }: { status: string }) {
  return (
    <span className={styles.status} data-status={status}>
      <i aria-hidden="true" />
      {statusLabels[status] ?? "Stato non disponibile"}
    </span>
  );
}
function avatarState(agent: TeamAiAgentCard) {
  return agent.status === "RUNNING"
    ? "working"
    : agent.status === "AWAITING_APPROVAL"
      ? "awaiting"
      : agent.status === "ERROR"
        ? "failed"
        : "idle";
}
function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Layers3 size={22} strokeWidth={1.3} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function AgentCard({ agent, onSelect }: { agent: TeamAiAgentCard; onSelect: () => void }) {
  const count = agent.taskCounts;
  const active = count ? count.QUEUED + count.RUNNING + count.AWAITING_APPROVAL : null;
  return (
    <article
      className={styles.agentCard}
      data-running={agent.status === "RUNNING"}
      aria-labelledby={`agent-${agent.id}`}
    >
      <div className={styles.agentIdentity}>
        <AgentAvatar id={agent.id} state={avatarState(agent)} />
        <div>
          <h3 id={`agent-${agent.id}`}>{agent.name}</h3>
          <p className={styles.role}>{agent.role}</p>
        </div>
      </div>
      <p className={styles.agentScope}>{agent.scope}</p>
      <Status status={agent.status} />
      <div className={styles.assignment}>
        <span className={styles.label}>
          {agent.status === "RUNNING" ? "Attività corrente" : "Attività assegnata"}
        </span>
        <p>
          {agent.assignedTask?.title ??
            (count ? "Nessuna attività assegnata." : "Registro attività non disponibile.")}
        </p>
      </div>
      <div className={styles.cardFooter}>
        <span>
          <strong>{active ?? "—"}</strong> attività aperte
        </span>
        <span>{count?.total ?? "—"} totali</span>
      </div>
      <details className={styles.agentDetails}>
        <summary>
          Dettagli agente <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div>
          <p>{agent.statusReason}</p>
          <dl>
            <div>
              <dt>Modello configurato</dt>
              <dd>{agent.configuredModel ?? "Non configurato"}</dd>
            </div>
            <div>
              <dt>Completate</dt>
              <dd>{count?.COMPLETED ?? "Non disponibile"}</dd>
            </div>
            <div>
              <dt>In approvazione</dt>
              <dd>{count?.AWAITING_APPROVAL ?? "Non disponibile"}</dd>
            </div>
          </dl>
          <p className={styles.small}>Consumi AI non attribuibili con certezza a questo agente.</p>
          <button className={styles.textButton} type="button" onClick={onSelect}>
            Apri attività di {agent.name}
            <ArrowDown size={14} aria-hidden="true" />
          </button>
        </div>
      </details>
    </article>
  );
}

type Filter = "active" | "approval" | "history";
export function TeamAiDashboard({
  dashboard,
  lorenzoWorkspace,
}: {
  dashboard: TeamAiDashboardData;
  lorenzoWorkspace: LorenzoWorkspaceData;
}) {
  const router = useRouter();
  const [taskOverride, setTaskOverride] = useState<AgentTaskView[] | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [agentFilter, setAgentFilter] = useState("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const actionLock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [plan, setPlan] = useState<DailyLorenzoPlan | null>(null);
  const [reportsOpen, setReportsOpen] = useState(false);
  const operationsRef = useRef<HTMLElement>(null);
  const reportRef = useRef<HTMLDetailsElement>(null);
  const tasks = taskOverride ?? dashboard.recentOperationalTasks;
  const lorenzo = dashboard.agents.find((agent) => agent.id === "lorenzo");
  const latest = lorenzoWorkspace.reports[0];
  const totals = dashboard.taskTotals;
  const usage = dashboard.unattributedUsage;
  const agentsById = Object.fromEntries(
    dashboard.agents.map((agent) => [agent.id.toUpperCase(), agent]),
  );
  const visibleTasks = tasks
    .filter((task) => {
      if (agentFilter !== "ALL" && task.agent !== agentFilter) return false;
      return filter === "approval"
        ? task.status === "AWAITING_APPROVAL"
        : filter === "history"
          ? ["COMPLETED", "FAILED", "CANCELLED"].includes(task.status)
          : ["QUEUED", "RUNNING", "AWAITING_APPROVAL"].includes(task.status);
    })
    .sort((a, b) =>
      filter === "history" ? b.updatedAt.localeCompare(a.updatedAt) : a.priority - b.priority,
    );
  const scopeLabel = taskOverride
    ? "Vista limitata a 100 attività; i contatori includono tutto il registro."
    : "Vista sulle ultime 24 attività aggiornate; i contatori includono tutto il registro.";

  async function act(key: string, operation: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operazione non disponibile.");
    } finally {
      setBusy(null);
      actionLock.current = false;
    }
  }
  async function refreshTasks() {
    const data = await requestTeamData("/api/agent-tasks?limit=100", tasksResponse);
    setTaskOverride(data.tasks);
    router.refresh();
  }
  function previewPlan() {
    void act("plan", async () => {
      const data = await requestTeamData("/api/agents/daily-plan", planResponse);
      setPlan(data);
      if (!data.databaseAvailable)
        throw new Error("I dati aziendali non sono disponibili. Nessun piano è stato preparato.");
      setNotice("Proposta pronta da esaminare. Nessuna attività è stata creata.");
    });
  }
  function savePlan() {
    void act("save", async () => {
      const data = await requestTeamData("/api/agents/daily-plan", savedPlanResponse, {
        method: "POST",
      });
      if (!data.plan.databaseAvailable)
        throw new Error("Dati aziendali non disponibili. Nessuna attività creata.");
      setPlan(null);
      setTaskOverride(null);
      router.refresh();
      setNotice(
        `${data.created} attività aggiunte alla coda. Le proposte già registrate non vengono duplicate. Nessun agente è stato avviato.`,
      );
    });
  }
  function decide(task: AgentTaskView, status: "QUEUED" | "CANCELLED") {
    void act(task.id, async () => {
      const data = await requestTeamData(
        `/api/agent-tasks/${encodeURIComponent(task.id)}`,
        taskResponse,
        { method: "PATCH", body: JSON.stringify({ status }) },
      );
      setTaskOverride(tasks.map((entry) => (entry.id === data.task.id ? data.task : entry)));
      router.refresh();
      setNotice(
        status === "QUEUED"
          ? "Approvazione registrata. Attività in coda, nessuna azione esterna eseguita."
          : "Attività annullata. Nessuna azione esterna eseguita.",
      );
    });
  }
  function selectAgent(id: string) {
    setAgentFilter(id.toUpperCase());
    setFilter("active");
    operationsRef.current?.scrollIntoView({ block: "start" });
    operationsRef.current?.focus({ preventScroll: true });
    void act("refresh", async () => {
      const data = await requestTeamData(
        `/api/agent-tasks?agent=${id.toUpperCase()}&limit=100`,
        tasksResponse,
      );
      setTaskOverride(data.tasks);
      setNotice(
        "Vista aggiornata per l'agente selezionato. Usa Aggiorna per ricaricare tutti gli agenti.",
      );
    });
  }
  function openReports() {
    setReportsOpen(true);
    requestAnimationFrame(() => {
      reportRef.current?.scrollIntoView({ block: "start" });
      reportRef.current?.querySelector("summary")?.focus();
    });
  }

  return (
    <div className={`page-wrap ${styles.workspace}`}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>AETERNA / AI COMMAND CENTER</p>
          <h1>
            TEAM AI<span>.</span>
          </h1>
          <p className={styles.subtitle}>
            Una visione condivisa. Sei responsabilità. Un unico centro operativo.
          </p>
        </div>
        <div className={styles.mode}>
          <span className={styles.modeDot} />
          <div>
            <strong>Controllo umano</strong>
            <span>Nessuna automazione attiva</span>
          </div>
        </div>
      </header>
      <div className={styles.metrics} aria-label="Indicatori del registro operativo">
        <div>
          <span className={styles.metricLabel}>Servizi AI configurati</span>
          <strong>
            {dashboard.configuredAgents}
            <small> / 6</small>
          </strong>
          <span>Disponibilità, non autonomia</span>
        </div>
        <div>
          <span className={styles.metricLabel}>Attività in corso</span>
          <strong>{totals?.RUNNING ?? "—"}</strong>
          <span>Stato registrato, non live</span>
        </div>
        <div>
          <span className={styles.metricLabel}>Da approvare</span>
          <strong>{totals?.AWAITING_APPROVAL ?? "—"}</strong>
          <span>Decisioni in attesa</span>
        </div>
        <div>
          <span className={styles.metricLabel}>Attività in coda</span>
          <strong>{totals?.QUEUED ?? "—"}</strong>
          <span>
            {dashboard.tasksAvailable ? "Registro disponibile" : "Registro non disponibile"}
          </span>
        </div>
      </div>

      {lorenzo && (
        <section className={styles.ceo} aria-labelledby="ceo-title">
          <div className={styles.ceoMain}>
            <div className={styles.ceoIdentity}>
              <AgentAvatar id="lorenzo" state={avatarState(lorenzo)} size="large" />
              <div>
                <p className={styles.eyebrow}>DIREZIONE & COORDINAMENTO</p>
                <h2 id="ceo-title">Lorenzo</h2>
                <p className={styles.role}>CEO · Strategia e coordinamento</p>
                <Status status={lorenzo.status} />
              </div>
            </div>
            <p className={styles.ceoDescription}>
              Legge l’azienda, definisce le priorità e propone il lavoro del team. Le decisioni
              restano nelle tue mani.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.primaryButton} onClick={openReports}>
                <FileText size={16} aria-hidden="true" />
                Report e analisi
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={Boolean(busy)}
                onClick={previewPlan}
              >
                {busy === "plan" ? (
                  <LoaderCircle size={16} className={styles.spin} />
                ) : (
                  <ClipboardList size={16} aria-hidden="true" />
                )}
                Prepara piano giornaliero
              </button>
            </div>
            <p className={styles.small}>
              Piano su richiesta, senza chiamate AI. L’analisi CEO si avvia solo dal pannello
              report.
            </p>
          </div>
          <div className={styles.ceoBrief}>
            <div className={styles.briefHeading}>
              <span className={styles.label}>FOCUS CEO</span>
              <span className={styles.briefLine} />
            </div>
            <div>
              <span className={styles.label}>Priorità dall’ultimo report</span>
              <p className={styles.priority}>
                {latest?.priorityOne ?? "Le priorità iniziano dai dati."}
              </p>
              {!latest && (
                <p className={styles.small}>
                  Nessun report disponibile. Apri Report e analisi per richiedere una lettura della
                  situazione aziendale.
                </p>
              )}
            </div>
            <div className={styles.lastReport}>
              <FileText size={17} aria-hidden="true" />
              <div>
                <span className={styles.label}>Ultimo report salvato</span>
                <p>{latest ? formatDate(latest.createdAt) : "Non ancora generato"}</p>
              </div>
            </div>
            {lorenzo.assignedTask && (
              <div className={styles.assignment}>
                <span className={styles.label}>
                  {lorenzo.status === "RUNNING" ? "Attività corrente" : "Attività assegnata"}
                </span>
                <p>{lorenzo.assignedTask.title}</p>
              </div>
            )}
          </div>
        </section>
      )}

      <div className={styles.feedback} aria-live="polite">
        {busy && (
          <p>
            <LoaderCircle size={15} className={styles.spin} />
            Richiesta in corso…
          </p>
        )}
        {notice && (
          <p>
            <Check size={16} />
            {notice}
          </p>
        )}
      </div>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      {plan && (
        <section className={styles.plan} aria-labelledby="plan-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>PROPOSTA DI LORENZO</p>
              <h2 id="plan-title">Il prossimo lavoro, prima di iniziare.</h2>
            </div>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => setPlan(null)}
              disabled={Boolean(busy)}
            >
              Chiudi anteprima
            </button>
          </div>
          <p className={styles.small}>
            Basata sulle fonti registrate. Salva le proposte per metterle in coda; nessuna
            esecuzione automatica.
          </p>
          <div className={styles.sourceList}>
            {[
              ["Shopify", plan.dataAvailability.shopify],
              ["Meta Ads", plan.dataAvailability.metaAds],
              ["Analytics", plan.dataAvailability.analytics],
            ].map(([label, available]) => (
              <span key={String(label)}>
                {label}: {available ? "collegamento registrato" : "collegamento non disponibile"}
              </span>
            ))}
          </div>
          <ol className={styles.proposals}>
            {plan.proposals.map((proposal) => (
              <li key={proposal.dedupeKey}>
                <span className={styles.label}>
                  {agentsById[proposal.agent]?.name} · Priorità {proposal.priority}
                </span>
                <h3>{proposal.title}</h3>
                <p>{proposal.description}</p>
              </li>
            ))}
          </ol>
          {plan.notes.length > 0 && (
            <ul className={styles.planNotes}>
              {plan.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          {plan.databaseAvailable && plan.proposals.length > 0 && (
            <button
              type="button"
              className={styles.primaryButton}
              disabled={Boolean(busy) || !dashboard.tasksAvailable}
              onClick={savePlan}
            >
              Aggiungi le proposte alla coda
              <ArrowUpRight size={15} />
            </button>
          )}
          {!dashboard.tasksAvailable && (
            <p className={styles.small}>
              Il salvataggio richiede un registro attività disponibile.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="team-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>IL TEAM</p>
            <h2 id="team-title">Competenze distinte. Obiettivi condivisi.</h2>
          </div>
          <span className={styles.sectionAside}>5 agenti specializzati</span>
        </div>
        <div className={styles.teamGrid}>
          {dashboard.agents
            .filter((agent) => agent.id !== "lorenzo")
            .map((agent) => (
              <AgentCard key={agent.id} agent={agent} onSelect={() => selectAgent(agent.id)} />
            ))}
        </div>
      </section>

      <section
        className={styles.operations}
        ref={operationsRef}
        id="team-operations"
        tabIndex={-1}
        aria-labelledby="operations-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>OPERAZIONI</p>
            <h2 id="operations-title">Il lavoro, in chiaro.</h2>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={Boolean(busy)}
            onClick={() => void act("refresh", refreshTasks)}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Aggiorna
          </button>
        </div>
        <div className={styles.toolbar}>
          <div className={styles.filters} role="group" aria-label="Filtra attività">
            {(
              [
                ["active", "Attività"],
                ["approval", "Approvazioni"],
                ["history", "Cronologia"],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
              >
                {label}
                {value === "approval" && totals && <span>{totals.AWAITING_APPROVAL}</span>}
              </button>
            ))}
          </div>
          <label className={styles.agentFilter}>
            Agente
            <select
              value={agentFilter}
              onChange={(event) => {
                setAgentFilter(event.target.value);
                if (taskOverride) void act("refresh", refreshTasks);
              }}
            >
              <option value="ALL">Tutti gli agenti</option>
              {dashboard.agents.map((agent) => (
                <option key={agent.id} value={agent.id.toUpperCase()}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!dashboard.tasksAvailable && taskOverride === null ? (
          <Empty title="Il registro non è disponibile">
            Le attività non possono essere lette in questo momento. Non mostriamo conteggi o
            risultati presunti. Puoi continuare a consultare il team e i report disponibili.
          </Empty>
        ) : visibleTasks.length === 0 ? (
          <Empty
            title={
              filter === "approval"
                ? "Nessuna approvazione in questa vista"
                : filter === "history"
                  ? "La cronologia inizia dal lavoro svolto"
                  : "Spazio al prossimo passo"
            }
          >
            {filter === "active"
              ? "Non ci sono attività aperte nella vista corrente. Prepara un piano con Lorenzo oppure aggiorna il registro."
              : "Nessuna attività corrisponde ai filtri nella vista caricata."}
          </Empty>
        ) : (
          <ol className={styles.taskList}>
            {visibleTasks.map((task) => (
              <li key={task.id}>
                <details className={styles.taskDetail}>
                  <summary>
                    <span className={styles.taskMarker}>
                      <ClipboardList size={17} aria-hidden="true" />
                    </span>
                    <span className={styles.taskCopy}>
                      <strong>{task.title}</strong>
                      <span>
                        {agentsById[task.agent]?.name ?? task.agent} · Priorità {task.priority} ·{" "}
                        {task.source === "MANUAL"
                          ? "Manuale"
                          : task.source === "EVENT"
                            ? "Evento"
                            : "Automatica"}
                      </span>
                    </span>
                    <Status status={task.status} />
                    <ChevronDown size={15} aria-hidden="true" />
                  </summary>
                  <div className={styles.taskBody}>
                    <p>{task.description ?? "Nessuna descrizione aggiuntiva."}</p>
                    <p className={styles.small}>Aggiornata il {formatDate(task.updatedAt)}</p>
                    {task.result && (
                      <div className={styles.result}>
                        <span className={styles.label}>Risultato registrato</span>
                        <p>{task.result}</p>
                      </div>
                    )}
                    {task.status === "AWAITING_APPROVAL" && (
                      <div className={styles.approval}>
                        <ShieldCheck size={20} aria-hidden="true" />
                        <div>
                          <h3>È richiesta la tua approvazione</h3>
                          <p>{task.approvalReason ?? "Valuta la proposta prima di confermare."}</p>
                          <p className={styles.small}>
                            Approvare rimette l’attività in coda: non modifica Shopify, campagne o
                            budget e non invia comunicazioni.
                          </p>
                          <div className={styles.actions}>
                            <button
                              type="button"
                              className={styles.primaryButton}
                              disabled={Boolean(busy)}
                              onClick={() => decide(task, "QUEUED")}
                            >
                              Approva e metti in coda
                            </button>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              disabled={Boolean(busy)}
                              onClick={() => decide(task, "CANCELLED")}
                            >
                              Annulla attività
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ol>
        )}
        <p className={styles.scopeNote}>
          {scopeLabel} Priorità: valore più basso = precedenza maggiore.
        </p>
      </section>

      <details
        ref={reportRef}
        className={styles.reports}
        id="lorenzo-reports"
        open={reportsOpen}
        onToggle={(event) => setReportsOpen(event.currentTarget.open)}
      >
        <summary>
          <span className={styles.reportIcon}>
            <FileText size={21} aria-hidden="true" />
          </span>
          <span>
            <span className={styles.eyebrow}>LORENZO / INTELLIGENCE</span>
            <strong>Report e analisi CEO</strong>
            <span className={styles.small}>Generazione su richiesta e report precedenti</span>
          </span>
          <ChevronDown size={20} aria-hidden="true" />
        </summary>
        <div className={styles.reportContent}>
          <LorenzoWorkspace workspace={lorenzoWorkspace} embedded />
        </div>
      </details>

      <section className={styles.audit} aria-labelledby="audit-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>TRASPARENZA</p>
            <h2 id="audit-title">Consumi e tracce AI</h2>
          </div>
          <Activity size={18} aria-hidden="true" />
        </div>
        <p className={styles.small}>
          {dashboard.databaseAvailable
            ? `${usage.invocationCount} invocazioni · ${usage.totalTokens.toLocaleString("it-IT")} token registrati`
            : "Audit AI non disponibile."}{" "}
          · Non attribuiti ai singoli agenti. Costi non calcolabili senza prezzi verificati.
        </p>
        <p className={styles.small}>
          {usage.trackingStartedAt
            ? `Storico dall’attivazione dell’audit; prima registrazione: ${formatDate(usage.trackingStartedAt)}.`
            : "Nessuna prima registrazione disponibile."}
        </p>
        {dashboard.recentActivities.length > 0 && (
          <details className={styles.auditDetails}>
            <summary>
              Ultime {dashboard.recentActivities.length} invocazioni <ChevronDown size={14} />
            </summary>
            <ul>
              {dashboard.recentActivities.map((entry) => (
                <li key={entry.id}>
                  <span>
                    <strong>{entry.taskType}</strong>
                    <span>
                      {entry.model} · {formatDate(entry.createdAt)}
                    </span>
                  </span>
                  <Status status={entry.status} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <footer className={styles.footer}>
        <ShieldCheck size={15} aria-hidden="true" />
        <span>
          Supervisione umana · Azioni sensibili soggette ad approvazione · Nessun ciclo autonomo
          attivo
        </span>
        <Sparkles size={15} aria-hidden="true" />
      </footer>
    </div>
  );
}
