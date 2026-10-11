export default function Loading() {
  return (
    <div className="startup-screen" role="status" aria-live="polite" aria-label="Avvio AETERNA OS">
      <p className="startup-kicker">AETERNA OS</p>
      <p className="startup-label">Caricamento della sezione…</p>
      <div className="loading-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
