"use client";

import { RefreshCw, Store } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

type ShopifyStatus = {
  configured: boolean;
  storeDomain: string | null;
  status: "NOT_CONFIGURED" | "CONNECTED" | "SYNCING" | "ERROR" | "DISCONNECTED";
  lastSyncedAt: string | null;
  lastError: string | null;
};

function statusTone(
  status: ShopifyStatus["status"],
): "success" | "warning" | "error" | "disconnected" {
  if (status === "CONNECTED") return "success";
  if (status === "SYNCING") return "warning";
  if (status === "ERROR") return "error";
  return "disconnected";
}

function statusLabel(status: ShopifyStatus["status"]): string {
  return {
    NOT_CONFIGURED: "Non configurato",
    CONNECTED: "Collegato",
    SYNCING: "Sincronizzazione in corso",
    ERROR: "Errore",
    DISCONNECTED: "Disconnesso",
  }[status];
}

export function ShopifySettings({ initialStatus }: { initialStatus: ShopifyStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSync() {
    setIsSyncing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/integrations/shopify", { method: "POST" });
      const payload = (await response.json()) as {
        data?: { integration: ShopifyStatus };
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Sincronizzazione non riuscita.");
      if (payload.data?.integration) setStatus(payload.data.integration);
      setMessage("Sincronizzazione completata.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sincronizzazione non riuscita.");
      const refresh = await fetch("/api/integrations/shopify");
      if (refresh.ok) setStatus((await refresh.json()) as ShopifyStatus);
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <section className="settings-card" aria-labelledby="shopify-settings-title">
      <div className="settings-card-heading">
        <div className="card-icon">
          <Store size={17} strokeWidth={1.7} />
        </div>
        <div>
          <p className="eyebrow">INTEGRAZIONE DATI</p>
          <h2 id="shopify-settings-title">Shopify</h2>
          <p>Sincronizza ordini, prodotti, clienti e inventario nel database locale.</p>
        </div>
        <StatusBadge tone={statusTone(status.status)}>{statusLabel(status.status)}</StatusBadge>
      </div>
      <div className="settings-details">
        <div>
          <span>Store</span>
          <strong>{status.storeDomain ?? "Non configurato"}</strong>
        </div>
        <div>
          <span>Ultima sincronizzazione</span>
          <strong>
            {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString("it-IT") : "Mai"}
          </strong>
        </div>
      </div>
      {status.lastError && (
        <p className="task-error" role="alert">
          {status.lastError}
        </p>
      )}
      {message && (
        <p
          className={message === "Sincronizzazione completata." ? "settings-success" : "task-error"}
          role="status"
        >
          {message}
        </p>
      )}
      <div className="settings-actions">
        <p>Il token Shopify resta solo nelle variabili ambiente server e non viene mostrato.</p>
        <Button
          type="button"
          onClick={handleSync}
          disabled={!status.configured || isSyncing}
          icon={<RefreshCw size={14} className={isSyncing ? "spin" : undefined} />}
        >
          {isSyncing ? "Sincronizzazione..." : "Sincronizza ora"}
        </Button>
      </div>
    </section>
  );
}
