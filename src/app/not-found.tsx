import { Compass } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="page-wrap">
      <section className="empty-state">
        <Compass size={24} aria-hidden="true" />
        <div>
          <p className="eyebrow">ERRORE 404</p>
          <h1>Pagina non trovata</h1>
          <p>Questo indirizzo non corrisponde a una sezione del gestionale.</p>
          <LinkButton href="/" variant="primary">
            Torna alla panoramica
          </LinkButton>
        </div>
      </section>
    </div>
  );
}
