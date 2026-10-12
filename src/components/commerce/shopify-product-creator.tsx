"use client";

import { LoaderCircle, Plus, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import styles from "@/components/commerce/shopify-product-creator.module.css";

type Proposal = {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  result: string | null;
  product: { title: string; handle: string; variants: Array<{ title: string; price: string }> };
};

const exampleVariants = '[{"title":"Default","price":"0.00","optionValues":[{"optionName":"Title","value":"Default"}]}]';

function messageFrom(response: Response, payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") return payload.error;
  return response.ok ? "Operazione completata." : "Operazione non riuscita.";
}

export function ShopifyProductCreator({ initialProposals }: { initialProposals: Proposal[] }) {
  const [proposals, setProposals] = useState(initialProposals);
  const [busy, setBusy] = useState<"proposal" | string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    sourceReference: "",
    productName: "",
    productType: "",
    factualDescription: "",
    materials: "",
    variants: exampleVariants,
    images: "[]",
  });

  function update(key: keyof typeof form, value: string) { setForm((current) => ({ ...current, [key]: value })); }

  async function createProposal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("proposal"); setError(null); setNotice(null);
    try {
      const variants = JSON.parse(form.variants) as unknown;
      const images = JSON.parse(form.images) as unknown;
      const response = await fetch("/api/agents/shopify-product-proposals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceReference: form.sourceReference, productName: form.productName,
          productType: form.productType.trim() || null, factualDescription: form.factualDescription,
          materials: form.materials.split(",").map((value) => value.trim()).filter(Boolean), variants, images,
        }),
      });
      const payload = await response.json().catch(() => null) as { data?: { proposalTask?: { id: string; title: string; status: string; updatedAt: string; result: string | null }; proposal?: Proposal["product"] }; error?: string } | null;
      if (!response.ok || !payload?.data?.proposalTask || !payload.data.proposal) throw new Error(messageFrom(response, payload));
      const task = payload.data.proposalTask;
      const created = { ...task, product: payload.data.proposal };
      setProposals((current) => [created, ...current.filter((proposal) => proposal.id !== created.id)]);
      setNotice("Proposta salvata. Nessun prodotto Shopify e stato creato: attende la tua approvazione.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Impossibile preparare la proposta."); }
    finally { setBusy(null); }
  }

  async function approveAndCreate(id: string) {
    setBusy(id); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/agents/shopify-product-proposals/${encodeURIComponent(id)}/create`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { data?: { task?: Proposal }; error?: string } | null;
      if (!response.ok || !payload?.data?.task) throw new Error(messageFrom(response, payload));
      setProposals((current) => current.map((proposal) => proposal.id === id ? { ...proposal, ...payload.data!.task } : proposal));
      setNotice("Bozza Shopify creata. Il prodotto resta DRAFT e non e stato pubblicato.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Creazione bozza non riuscita."); }
    finally { setBusy(null); }
  }

  return <section className={styles.workspace} aria-labelledby="shopify-product-creator-title">
    <div className={styles.card}>
      <div className={styles.heading}><div><p className={styles.eyebrow}>ALESSANDRO / SHOPIFY</p><h2 id="shopify-product-creator-title">Nuovo prodotto AI</h2><p>Invia solo dati e asset verificati. Alessandro prepara una proposta; Shopify non viene modificato.</p></div></div>
      <form className={styles.form} onSubmit={createProposal}>
        <div className={styles.grid}>
          <label className={styles.field}>Riferimento interno verificabile<input required value={form.sourceReference} onChange={(event) => update("sourceReference", event.target.value)} placeholder="Es. scheda fornitore 2026-10-12" /></label>
          <label className={styles.field}>Nome prodotto verificato<input required value={form.productName} onChange={(event) => update("productName", event.target.value)} /></label>
          <label className={styles.field}>Tipo prodotto<input value={form.productType} onChange={(event) => update("productType", event.target.value)} placeholder="Es. Jewelry" /></label>
          <label className={styles.field}>Materiali verificati (separati da virgola)<input required value={form.materials} onChange={(event) => update("materials", event.target.value)} placeholder="Sterling silver, cubic zirconia" /></label>
        </div>
        <label className={styles.field}>Descrizione fattuale verificata<textarea required value={form.factualDescription} onChange={(event) => update("factualDescription", event.target.value)} /></label>
        <label className={styles.field}>Varianti e prezzi verificati (JSON)<textarea required value={form.variants} onChange={(event) => update("variants", event.target.value)} /></label>
        <label className={styles.field}>Asset immagine HTTPS reali (JSON, opzionale)<textarea value={form.images} onChange={(event) => update("images", event.target.value)} placeholder={'[{"sourceUrl":"https://...","altText":"..."}]'} /></label>
        <div className={styles.actions}><Button type="submit" disabled={busy !== null} icon={busy === "proposal" ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}>{busy === "proposal" ? "Preparazione..." : "Prepara proposta"}</Button><span className={styles.hint}>L&apos;approvazione e obbligatoria prima della creazione della bozza.</span></div>
      </form>
      {notice && <p className={styles.notice} role="status">{notice}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
    </div>
    <div className={styles.card}><div className={styles.heading}><div><p className={styles.eyebrow}>STORICO</p><h3>Proposte e bozze Shopify</h3></div></div>
      {proposals.length === 0 ? <p className={styles.empty}>Nessuna proposta salvata. I prodotti non vengono generati automaticamente.</p> : <div className={styles.proposalList}>{proposals.map((proposal) => <article className={styles.proposal} key={proposal.id}><div className={styles.heading}><div><strong>{proposal.product.title}</strong><p className={styles.hint}>/{proposal.product.handle} · {proposal.product.variants.length} varianti</p></div><span className={styles.badge}>{proposal.status}</span></div><div className={styles.proposalMeta}><span>Aggiornata {new Date(proposal.updatedAt).toLocaleString("it-IT")}</span>{proposal.result && <span>{proposal.result}</span>}</div>{proposal.status === "AWAITING_APPROVAL" && <Button type="button" disabled={busy !== null} onClick={() => void approveAndCreate(proposal.id)} icon={busy === proposal.id ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}>{busy === proposal.id ? "Creazione..." : "Approva e crea bozza"}</Button>}</article>)}</div>}
    </div>
  </section>;
}
