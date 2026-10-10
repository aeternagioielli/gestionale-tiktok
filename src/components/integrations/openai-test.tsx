"use client";

import { Bot, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import styles from "./openai-test.module.css";

const configuredModels = ["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra"] as const;

type ModelName = (typeof configuredModels)[number];
type ModelResult = { model: string; available: boolean; errorCode: string | null };
type ModelState = "idle" | "loading" | "available" | "unavailable";

function statusTone(state: ModelState): "muted" | "warning" | "success" | "error" {
  const tones: Record<ModelState, "muted" | "warning" | "success" | "error"> = {
    idle: "muted",
    loading: "warning",
    available: "success",
    unavailable: "error",
  };
  return tones[state];
}

function statusLabel(state: ModelState): string {
  return {
    idle: "Da verificare",
    loading: "Verifica in corso",
    available: "Disponibile",
    unavailable: "Non disponibile",
  }[state];
}

function isModelResult(value: unknown): value is ModelResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "model" in value &&
    "available" in value &&
    typeof value.model === "string" &&
    typeof value.available === "boolean"
  );
}

function responseMessage(status: number, payload: unknown): string {
  const retryAfter =
    typeof payload === "object" && payload !== null && "retryAfterSeconds" in payload
      ? Number(payload.retryAfterSeconds)
      : NaN;
  if (status === 401) return "Sessione scaduta. Accedi di nuovo per eseguire il test.";
  if (status === 429)
    return Number.isFinite(retryAfter) && retryAfter > 0
      ? `Attendi ${Math.ceil(retryAfter)} secondi prima di ripetere il test.`
      : "Il test è stato richiesto troppo di recente. Riprova tra qualche minuto.";
  if (status === 502) return "Uno o più modelli OpenAI non sono disponibili per questo progetto.";
  if (status === 503) return "OpenAI non è configurato o non è momentaneamente disponibile.";
  return "Il test OpenAI non è riuscito. Riprova più tardi.";
}

export function OpenAiTest() {
  const [results, setResults] = useState<Partial<Record<ModelName, ModelResult>>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleTest() {
    setIsTesting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/integrations/openai/test", { method: "POST" });
      const payload: unknown = await response.json().catch(() => null);
      const modelResults =
        typeof payload === "object" &&
        payload !== null &&
        "models" in payload &&
        Array.isArray(payload.models)
          ? payload.models.filter(isModelResult)
          : [];
      const nextResults: Partial<Record<ModelName, ModelResult>> = {};
      for (const result of modelResults) {
        if ((configuredModels as readonly string[]).includes(result.model))
          nextResults[result.model as ModelName] = result;
      }
      if (modelResults.length > 0) setResults(nextResults);
      if (!response.ok) {
        setMessage(responseMessage(response.status, payload));
        return;
      }
      if (modelResults.length !== configuredModels.length) {
        setMessage("Il servizio OpenAI ha restituito una risposta non valida.");
        return;
      }
      setMessage("Verifica completata.");
    } catch {
      setMessage("Impossibile contattare il servizio OpenAI. Riprova più tardi.");
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className={`integration-item ${styles.container}`}>
      <div className={styles.heading}>
        <div className="card-icon">
          <Bot size={17} strokeWidth={1.7} />
        </div>
        <div>
          <span>Astra / OpenAI</span>
          <small>Verifica manuale dei modelli configurati, senza usare il database.</small>
        </div>
      </div>
      <div className={styles.models} aria-live="polite">
        {configuredModels.map((model) => {
          const state: ModelState = isTesting
            ? "loading"
            : results[model]
              ? results[model].available
                ? "available"
                : "unavailable"
              : "idle";
          return (
            <div className={styles.model} key={model}>
              <code>{model}</code>
              <StatusBadge tone={statusTone(state)}>{statusLabel(state)}</StatusBadge>
            </div>
          );
        })}
      </div>
      {message && (
        <p
          className={`${styles.message} ${
            message === "Verifica completata." ? styles.success : styles.error
          }`}
          role="status"
        >
          {message}
        </p>
      )}
      <Button
        type="button"
        variant="secondary"
        onClick={handleTest}
        disabled={isTesting}
        icon={<RefreshCw size={14} className={isTesting ? "spin" : undefined} />}
      >
        {isTesting ? "Test in corso..." : "Test OpenAI"}
      </Button>
    </div>
  );
}
