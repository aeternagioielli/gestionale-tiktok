"use client";

import { Bot, CheckCircle2, Clock3, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  LorenzoReportView,
  LorenzoWorkspace as LorenzoWorkspaceData,
} from "@/server/services/lorenzo-service";
import styles from "./lorenzo-workspace.module.css";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function List({ items, empty }: { items: string[]; empty: string }) {
  return items.length ? (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  ) : (
    <p className={styles.empty}>{empty}</p>
  );
}

function Report({ report }: { report: LorenzoReportView }) {
  return (
    <article className={styles.report}>
      <header className={styles.reportHeader}>
        <div>
          <p className="eyebrow">ANALISI CEO</p>
          <h2>Report del {formatDate(report.reportDate)}</h2>
        </div>
        <StatusBadge tone="success">Salvato</StatusBadge>
      </header>
      <section className={styles.lead}>
        <h3>Situazione generale</h3>
        <p>{report.generalSituation}</p>
      </section>
      <div className={styles.grid}>
        <section>
          <h3>Ordini e vendite</h3>
          <p>{report.orders.summary}</p>
          <List items={report.orders.observations} empty="Nessuna osservazione disponibile." />
        </section>
        <section>
          <h3>Andamento</h3>
          <p>{report.trend}</p>
        </section>
        <section>
          <h3>Cosa funziona</h3>
          <List items={report.whatWorks} empty="Non ci sono dati sufficienti per valutarlo." />
        </section>
        <section>
          <h3>Cosa richiede attenzione</h3>
          <List items={report.whatDoesNotWork} empty="Non ci sono criticità verificate." />
        </section>
        <section>
          <h3>Problemi individuati</h3>
          <List items={report.problems} empty="Nessun problema verificato." />
        </section>
        <section>
          <h3>Opportunità commerciali</h3>
          <List items={report.opportunities} empty="Nessuna opportunità verificabile al momento." />
        </section>
      </div>
      <section className={styles.priorities}>
        <div>
          <p className="eyebrow">PRIORITÀ #1</p>
          <strong>{report.priorityOne}</strong>
        </div>
        <ol>
          {report.priorities.map((priority) => (
            <li key={priority}>{priority}</li>
          ))}
        </ol>
      </section>
      <section className={styles.team}>
        <div className={styles.sectionHeading}>
          <div>
            <p className="eyebrow">AZIONI CONSIGLIATE</p>
            <h3>Proposte per il team</h3>
          </div>
          <span>Non modificano le attività esistenti.</span>
        </div>
        <div className={styles.teamGrid}>
          {report.recommendedTasks.map((recommendation) => (
            <div key={recommendation.person} className={styles.teamCard}>
              <strong>{recommendation.person}</strong>
              <List items={recommendation.actions} empty="Nessuna proposta." />
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function errorMessage(status: number, payload: unknown): string {
  const supplied =
    typeof payload === "object" && payload !== null && "error" in payload
      ? (payload as { error?: unknown }).error
      : null;
  if (typeof supplied === "string") return supplied;
  if (status === 401) return "La sessione non è valida. Accedi di nuovo per generare l'analisi.";
  if (status === 429) return "Limite di utilizzo raggiunto. Riprova più tardi.";
  if (status === 409) return "Un'altra analisi è già in corso.";
  if (status === 502) return "OpenAI non è disponibile in questo momento. Riprova più tardi.";
  return "Impossibile generare l'analisi Lorenzo.";
}

export function LorenzoWorkspace({
  workspace,
  embedded = false,
}: {
  workspace: LorenzoWorkspaceData;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = workspace.reports[0];
  async function generate() {
    setError(null);
    setIsGenerating(true);
    try {
      const response = await fetch("/api/lorenzo/reports", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const isJson = response.headers.get("content-type")?.includes("application/json");
      const payload: unknown = isJson ? await response.json() : null;
      if (!response.ok) throw new Error(errorMessage(response.status, payload));
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Impossibile generare l'analisi Lorenzo.",
      );
    } finally {
      setIsGenerating(false);
    }
  }
  return (
    <div className={embedded ? styles.embedded : "page-wrap astra-page"}>
      {!embedded && (
        <div className="placeholder-header">
          <div>
            <p className="eyebrow">AETERNA OS / LORENZO</p>
            <h2>Lorenzo</h2>
            <p>CEO AI: legge i dati aziendali disponibili, propone priorità e non esegue azioni.</p>
          </div>
          <StatusBadge tone={workspace.databaseAvailable ? "success" : "disconnected"}>
            {workspace.databaseAvailable ? "Dati disponibili" : "Dati non disponibili"}
          </StatusBadge>
        </div>
      )}
      <section className={styles.hero} aria-labelledby="lorenzo-title">
        <div className={styles.mark} aria-hidden="true">
          <Bot size={35} strokeWidth={1.3} />
        </div>
        <div className={styles.heroCopy}>
          <p className="eyebrow">ANALISI SU RICHIESTA</p>
          <h1 id="lorenzo-title">Una lettura chiara della situazione AETERNA.</h1>
          <p>
            Ogni analisi usa solo gli ordini, i prodotti, l&apos;inventario, gli obiettivi, le
            attività e i report già presenti. Nessuna automazione viene avviata.
          </p>
        </div>
        <Button
          type="button"
          onClick={generate}
          disabled={isGenerating || !workspace.databaseAvailable}
          icon={
            isGenerating ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />
          }
        >
          {isGenerating ? "Generazione in corso…" : "Genera analisi"}
        </Button>
      </section>
      {error && (
        <div className="system-alert" role="alert">
          <span>{error}</span>
        </div>
      )}
      {!workspace.databaseConfigured && (
        <div className="data-waiting" role="status">
          <strong>Database non configurato</strong>
          <span>Lorenzo potrà operare quando il database aziendale sarà disponibile.</span>
        </div>
      )}
      {workspace.databaseConfigured && !workspace.databaseAvailable && (
        <div className="data-waiting" role="status">
          <strong>Database non raggiungibile</strong>
          <span>
            La generazione è disabilitata finché il servizio non può leggere i dati aziendali.
          </span>
        </div>
      )}
      {latest ? (
        <Report report={latest} />
      ) : (
        <section className={styles.emptyState}>
          <Clock3 size={20} />
          <div>
            <p className="eyebrow">NESSUN REPORT</p>
            <h3>Lorenzo non ha ancora elaborato un&apos;analisi.</h3>
            <p>
              Avvia una sola generazione quando vuoi aggiornare la lettura dei dati disponibili.
            </p>
          </div>
        </section>
      )}
      {workspace.reports.length > 1 && (
        <section className={styles.history} aria-labelledby="lorenzo-history-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className="eyebrow">CRONOLOGIA</p>
              <h3 id="lorenzo-history-title">Report precedenti</h3>
            </div>
            <CheckCircle2 size={18} aria-hidden="true" />
          </div>
          <div className={styles.historyList}>
            {workspace.reports.slice(1).map((report) => (
              <details key={report.id}>
                <summary>
                  <span>{formatDate(report.reportDate)}</span>
                  <strong>{report.priorityOne}</strong>
                </summary>
                <p>{report.generalSituation}</p>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
