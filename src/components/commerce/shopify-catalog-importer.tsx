"use client";

import { CheckCircle2, LoaderCircle, Play, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { AETERNA_PRODUCT_CATALOG } from "@/lib/aeterna-product-catalog";
import { Button } from "@/components/ui/button";
import styles from "@/components/commerce/shopify-catalog-importer.module.css";

type Item = {
  taskId: string;
  sku: string;
  name: string;
  category: string;
  status: string;
  message: string | null;
  updatedAt: string;
};
type ImportView = {
  batch: { id: string; status: string; result: string | null };
  items: Item[];
  totals: {
    total: number;
    queued: number;
    running: number;
    draftCreated: number;
    alreadyPresent: number;
    requiresInformation: number;
    failed: number;
  };
};
type SkuRepairView = {
  batch: { id: string; status: string };
  items: Array<{ taskId: string; name: string; sku: string; status: string; message: string | null }>;
  totals: { total: number; ready: number; repaired: number; blocked: number; failed: number };
};

function responseError(response: Response, body: unknown): string {
  return body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : response.ok
      ? "Operazione completata."
      : "Operazione non riuscita.";
}

function statusLabel(status: string): string {
  return {
    QUEUED: "In attesa",
    RUNNING: "In elaborazione",
    DRAFT_CREATED: "Bozza creata",
    ALREADY_PRESENT: "Gia presente",
    REQUIRES_INFORMATION: "Richiede informazioni",
    FAILED: "Errore",
  }[status] ?? status;
}

export function ShopifyCatalogImporter({ initialImport }: { initialImport: ImportView | null }) {
  const [catalogImport, setCatalogImport] = useState(initialImport);
  const [skuRepair, setSkuRepair] = useState<SkuRepairView | null>(null);
  const [busy, setBusy] = useState<"prepare" | "run" | "reconcile" | "repair" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function request(url: string): Promise<ImportView> {
    const response = await fetch(url, { method: "POST" });
    const body = (await response.json().catch(() => null)) as { data?: ImportView; error?: string } | null;
    if (!response.ok || !body?.data) throw new Error(responseError(response, body));
    return body.data;
  }

  async function prepare() {
    setBusy("prepare");
    setError(null);
    setNotice(null);
    try {
      const data = await request("/api/agents/shopify-catalog-import");
      setCatalogImport(data);
      setNotice("Il catalogo e pronto. Nessuna richiesta OpenAI o Shopify e stata eseguita.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossibile preparare il catalogo.");
    } finally {
      setBusy(null);
    }
  }

  async function authorizeAndRun() {
    if (!catalogImport) return;
    const consent = window.confirm(
      "Autorizzi Alessandro a creare fino a 18 bozze Shopify, una alla volta? Ogni bozza restera non pubblicata e con prezzo da definire. Nessun prodotto verra pubblicato.",
    );
    if (!consent) return;
    setBusy("run");
    setError(null);
    setNotice(null);
    try {
      let data = await request(
        "/api/agents/shopify-catalog-import/" + encodeURIComponent(catalogImport.batch.id) + "/authorize",
      );
      setCatalogImport(data);
      // Each request processes exactly one persisted item. The browser can stop
      // safely: the next visit resumes from the stored queue without duplicates.
      for (let step = 0; step < 18 && data.totals.queued > 0; step += 1) {
        data = await request(
          "/api/agents/shopify-catalog-import/" + encodeURIComponent(data.batch.id) + "/step",
        );
        setCatalogImport(data);
      }
      setNotice("Importazione completata. Le bozze restano non pubblicate e ogni prezzo e da definire prima di una pubblicazione.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Importazione interrotta. Puoi riprendere dal catalogo salvato.");
    } finally {
      setBusy(null);
    }
  }

  async function reconcileCreatedProducts() {
    if (!catalogImport) return;
    const uncertain = catalogImport.items.filter((item) => item.message?.startsWith("ERROR: WRITE_OUTCOME_UNKNOWN:")).length;
    if (!uncertain) return;
    setBusy("reconcile");
    setError(null);
    setNotice(null);
    try {
      let data = catalogImport;
      // One read-only query per persisted task. A page reload is safe because
      // the service conditionally claims each task before reading Shopify.
      for (let step = 0; step < uncertain; step += 1) {
        data = await request(
          "/api/agents/shopify-catalog-import/" + encodeURIComponent(data.batch.id) + "/reconcile",
        );
        setCatalogImport(data);
      }
      const remaining = data.items.filter((item) => item.message?.startsWith("ERROR: WRITE_OUTCOME_UNKNOWN:")).length;
      setNotice(
        remaining
          ? "Alcune bozze richiedono ancora verifica manuale. Nessuna modifica Shopify e stata eseguita."
          : "Le bozze trovate e verificate sono state riconciliate. Nessuna modifica Shopify e stata eseguita.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossibile verificare le bozze gia create.");
    } finally {
      setBusy(null);
    }
  }

  async function repairMissingSkus() {
    if (!catalogImport) return;
    if (!window.confirm("Avvia la verifica in sola lettura degli SKU mancanti? Non verranno eseguite modifiche Shopify in questo passaggio.")) return;
    setBusy("repair"); setError(null); setNotice(null);
    try {
      let repair = await request(`/api/agents/shopify-catalog-import/${encodeURIComponent(catalogImport.batch.id)}/sku-repair`);
      // The repair plan is returned with the same envelope but different fields.
      const repairData = repair as unknown as { batch: { id: string }; totals: { total: number; ready: number } };
      setSkuRepair(repair as unknown as SkuRepairView);
      for (let step = 0; step < repairData.totals.total; step += 1) {
        repair = await request(`/api/agents/shopify-catalog-import/${encodeURIComponent(catalogImport.batch.id)}/sku-repair/${encodeURIComponent(repairData.batch.id)}/analyze`) as unknown as ImportView;
        setSkuRepair(repair as unknown as SkuRepairView);
      }
      const ready = (repair as unknown as { totals: { ready: number } }).totals.ready;
      setNotice(ready ? "Anteprima pronta: controlla gli SKU proposti e conferma separatamente la riparazione." : "Nessun prodotto e idoneo alla riparazione automatica. Verifica gli elementi bloccati manualmente.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Riparazione SKU interrotta senza retry automatici."); }
    finally { setBusy(null); }
  }

  async function approveAndRunSkuRepair() {
    if (!catalogImport || !skuRepair || !skuRepair.totals.ready) return;
    if (!window.confirm(`${skuRepair.totals.ready} SKU sono pronti. Confermi l'assegnazione alle sole varianti esistenti?`)) return;
    setBusy("repair"); setError(null);
    try {
      let repair = await request(`/api/agents/shopify-catalog-import/${encodeURIComponent(catalogImport.batch.id)}/sku-repair/${encodeURIComponent(skuRepair.batch.id)}/authorize`) as unknown as SkuRepairView;
      setSkuRepair(repair);
      for (let step = 0; step < skuRepair.totals.ready; step += 1) { repair = await request(`/api/agents/shopify-catalog-import/${encodeURIComponent(catalogImport.batch.id)}/sku-repair/${encodeURIComponent(skuRepair.batch.id)}/step`) as unknown as SkuRepairView; setSkuRepair(repair); }
      const refreshed = await fetch(`/api/agents/shopify-catalog-import/${encodeURIComponent(catalogImport.batch.id)}`).then((r) => r.json()) as { data?: ImportView };
      if (refreshed.data) setCatalogImport(refreshed.data);
      setNotice("Riparazione completata: ogni SKU applicato e stato riletto su Shopify prima della riconciliazione.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Riparazione SKU interrotta senza retry automatici."); }
    finally { setBusy(null); }
  }

  const completed = catalogImport
    ? catalogImport.totals.draftCreated + catalogImport.totals.alreadyPresent + catalogImport.totals.requiresInformation + catalogImport.totals.failed
    : 0;
  const progress = catalogImport?.totals.total ? Math.round((completed / catalogImport.totals.total) * 100) : 0;
  const rows = catalogImport?.items ?? AETERNA_PRODUCT_CATALOG.map((item) => ({
    taskId: item.sku,
    sku: item.sku,
    name: item.name,
    category: item.category,
    status: "QUEUED",
    message: null,
    updatedAt: "",
  }));
  const uncertainCount = catalogImport?.items.filter((item) => item.message?.startsWith("ERROR: WRITE_OUTCOME_UNKNOWN:")).length ?? 0;

  return (
    <section className={styles.workspace} aria-labelledby="catalog-import-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>ALESSANDRO / CATALOG OPERATIONS</p>
          <h2 id="catalog-import-title">Importa catalogo con Alessandro AI</h2>
          <p>18 prodotti AETERNA, elaborati in sequenza e salvati a ogni passaggio. Prezzi, immagini e dettagli restano da definire.</p>
        </div>
        <span className={styles.safety}><ShieldCheck size={15} /> Solo bozze Shopify</span>
      </header>

      <div className={styles.summary}>
        <div><span>Prodotti</span><strong>18</strong><small>SKU immutabili</small></div>
        <div><span>Avanzamento</span><strong>{progress}%</strong><small>{completed} di {catalogImport?.totals.total ?? 18} elaborati</small></div>
        <div><span>Bozze create</span><strong>{catalogImport?.totals.draftCreated ?? 0}</strong><small>Prezzo da definire</small></div>
      </div>
      <div className={styles.progress} aria-label={"Avanzamento importazione: " + progress + "%"}>
        <span style={{ width: progress + "%" }} />
      </div>

      {!catalogImport ? (
        <div className={styles.callout}>
          <Sparkles size={18} />
          <div>
            <strong>Prima di iniziare</strong>
            <p>Verranno registrate 18 attivita persistenti. L&apos;autorizzazione e unica: verranno create solo bozze Shopify, senza prezzo commerciale, immagini o pubblicazione.</p>
          </div>
          <Button type="button" disabled={busy !== null} onClick={() => void prepare()} icon={busy === "prepare" ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />}>
            Prepara importazione
          </Button>
        </div>
      ) : (
        <div className={styles.callout}>
          <CheckCircle2 size={18} />
          <div>
            <strong>{catalogImport.batch.status === "AWAITING_APPROVAL" ? "Autorizzazione richiesta" : "Importazione salvata"}</strong>
            <p>Ogni passaggio viene elaborato in una richiesta separata: puoi chiudere la pagina e riprendere senza duplicati.</p>
          </div>
          {catalogImport.batch.status !== "COMPLETED" && (
            <Button type="button" disabled={busy !== null} onClick={() => void authorizeAndRun()} icon={busy === "run" ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />}>
              {busy === "run" ? "Alessandro sta elaborando..." : "Autorizza e avvia importazione"}
            </Button>
          )}
          {uncertainCount > 0 && (
            <Button type="button" disabled={busy !== null} onClick={() => void reconcileCreatedProducts()} icon={busy === "reconcile" ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}>
              {busy === "reconcile" ? "Verifica in corso..." : "Verifica prodotti gia creati"}
            </Button>
          )}
          {catalogImport.items.some((item) => item.message?.startsWith("ERROR: RECONCILIATION_SKU_MISSING:")) && (
            <Button type="button" disabled={busy !== null} onClick={() => void repairMissingSkus()} icon={busy === "repair" ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}>
              {busy === "repair" ? "Riparazione in corso..." : "Ripara SKU prodotti esistenti"}
            </Button>
          )}
        </div>
      )}

      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {skuRepair && (
        <div className={styles.callout} aria-live="polite">
          <CheckCircle2 size={18} />
          <div>
            <strong>Anteprima riparazione SKU</strong>
            <p>{skuRepair.totals.ready} pronti, {skuRepair.totals.blocked + skuRepair.totals.failed} bloccati, {skuRepair.totals.repaired} verificati.</p>
            {skuRepair.items.filter((item) => item.status === "READY").slice(0, 18).map((item) => <small key={item.taskId}>{item.name}: variante esistente → {item.sku}</small>)}
          </div>
          {skuRepair.totals.ready > 0 && skuRepair.batch.status === "AWAITING_APPROVAL" && <Button type="button" disabled={busy !== null} onClick={() => void approveAndRunSkuRepair()} icon={<ShieldCheck size={15} />}>Approva e ripara SKU</Button>}
        </div>
      )}
      <div className={styles.list} role="list" aria-label="Stato prodotti catalogo">
        {rows.map((item) => (
          <article className={styles.row} key={item.taskId} role="listitem">
            <div><strong>{item.name}</strong><span>{item.category} · {item.sku}</span></div>
            <div className={styles.rowStatus}><span data-status={item.status}>{statusLabel(item.status)}</span>{item.message && <small>{item.message.replace(/^[A-Z_]+:\s*/, "")}</small>}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
