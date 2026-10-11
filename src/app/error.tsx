"use client";

import { AlertTriangle } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

export default function PageError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="page-wrap">
      <section className="empty-state" role="alert">
        <AlertTriangle size={24} aria-hidden="true" />
        <div>
          <p className="eyebrow">CARICAMENTO INTERROTTO</p>
          <h1>La pagina non è disponibile</h1>
          <p>
            Non è stato possibile caricare questa sezione. Riprova oppure torna alla panoramica.
          </p>
          <div className="recovery-actions">
            <button className="button button-primary" onClick={retry}>
              Riprova
            </button>
            <LinkButton href="/" variant="ghost">
              Torna alla panoramica
            </LinkButton>
          </div>
        </div>
      </section>
    </div>
  );
}
