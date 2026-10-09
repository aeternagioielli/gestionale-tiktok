export default function Loading() {
  return (
    <div className="startup-screen" role="status" aria-live="polite" aria-label="Avvio AETERNA OS">
      <div className="startup-orbit" aria-hidden="true">
        <span>A</span>
      </div>
      <p className="startup-kicker">AETERNA OS</p>
      <p className="startup-label">Preparazione dello spazio operativo</p>
      <div className="startup-progress" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}
