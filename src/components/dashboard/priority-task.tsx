"use client";

import { useState } from "react";
import { Check, Clock3, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

type PriorityTaskData = {
  id: string;
  title: string;
  description: string | null;
  priority: number;
  status: string;
  dueDate: Date | string | null;
};

export function PriorityTask({ task }: { task: PriorityTaskData }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleComplete() {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}/complete`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Impossibile completare la task.");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Errore inatteso.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="priority-task">
      <div className="task-topline">
        <StatusBadge tone="warning">Priorità #{task.priority || 1}</StatusBadge>
        {task.dueDate ? (
          <span className="task-time">
            <Clock3 size={14} /> Scadenza {new Date(task.dueDate).toLocaleDateString("it-IT")}
          </span>
        ) : (
          <span className="task-time">
            <Clock3 size={14} /> Nessuna scadenza
          </span>
        )}
      </div>
      <h3>{task.title}</h3>
      <p className="task-reason">
        <strong>Perché ora:</strong>{" "}
        {task.description ??
          "Questa è la prossima attività disponibile secondo il percorso operativo."}
      </p>
      <div className="task-action">
        <div className="task-step">
          <span className="step-number">OPERATIVA</span>
          <span>Completa questa task per verificare e sbloccare il prossimo passo.</span>
        </div>
        <Button
          variant="primary"
          onClick={handleComplete}
          disabled={isSaving || task.status === "LOCKED" || task.status === "BLOCKED"}
          icon={isSaving ? undefined : <Check size={15} />}
        >
          {isSaving ? "Salvataggio..." : "Completa task"}
        </Button>
      </div>
      {error && (
        <p className="task-error" role="alert">
          {error}
        </p>
      )}
      <div className="task-lock">
        <LockKeyhole size={13} /> Il completamento aggiorna il database e registra un audit.
      </div>
    </article>
  );
}
