"use client";

import {
  CheckCircle2,
  ChevronLeft,
  ImagePlus,
  LoaderCircle,
  Plus,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import styles from "@/components/commerce/shopify-product-creator.module.css";

const CATEGORIES = ["Collana", "Bracciale", "Anello", "Orecchini"] as const;

export const AETERNA_PRODUCT_CATALOG = [
  ["COL-001", "Collana Orbis", "Collana"],
  ["COL-002", "Collana Venere Argento", "Collana"],
  ["COL-003", "Collana Venere Oro", "Collana"],
  ["COL-004", "Collana Cora", "Collana"],
  ["COL-005", "Collana Afrodite", "Collana"],
  ["BRA-001", "Bracciale Cora Argento", "Bracciale"],
  ["BRA-002", "Bracciale Aqua", "Bracciale"],
  ["BRA-003", "Bracciale Cora Oro", "Bracciale"],
  ["BRA-004", "Bracciale Trama", "Bracciale"],
  ["BRA-005", "Bracciale Venere Oro", "Bracciale"],
  ["BRA-006", "Bracciale Venere Argento", "Bracciale"],
  ["ANE-001", "Anello Orbis", "Anello"],
  ["ANE-002", "Anello Cora Argento", "Anello"],
  ["ANE-003", "Anello Trama Oro", "Anello"],
  ["ANE-004", "Anello Trama Argento", "Anello"],
  ["ANE-005", "Anello Cora Oro", "Anello"],
  ["ORE-001", "Orecchini Trama", "Orecchini"],
  ["ORE-002", "Orecchini Orbis", "Orecchini"],
] as const satisfies ReadonlyArray<readonly [string, string, (typeof CATEGORIES)[number]]>;

type ProductVariant = { id: string; name: string; sku: string; price: string };
type ProposalProduct = {
  title: string;
  handle: string;
  descriptionHtml?: string;
  seoTitle?: string;
  seoDescription?: string;
  productType?: string | null;
  materials?: string[];
  images?: Array<{ sourceUrl: string; altText: string | null }>;
  variants: Array<{ title: string; sku?: string | null; price: string }>;
};
type Proposal = {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  result: string | null;
  product: ProposalProduct;
};
type FormState = {
  catalogSku: string;
  productName: string;
  sku: string;
  category: (typeof CATEGORIES)[number];
  price: string;
  materials: string;
  factualDescription: string;
  imageUrl: string;
  imageAlt: string;
  variants: ProductVariant[];
};

function newVariant(sku = "", price = ""): ProductVariant {
  return { id: crypto.randomUUID(), name: "", sku, price };
}

function initialForm(): FormState {
  return {
    catalogSku: "",
    productName: "",
    sku: "",
    category: "Collana",
    price: "",
    materials: "",
    factualDescription: "",
    imageUrl: "",
    imageAlt: "",
    variants: [newVariant()],
  };
}

function formatPrice(value: string): string {
  return /^\d+(?:[.,]\d{1,2})?$/.test(value) ? value.replace(",", ".") : "";
}

function plainText(html: string | undefined): string {
  return (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function messageFrom(response: Response, payload: unknown): string {
  return payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : response.ok
      ? "Operazione completata."
      : "Operazione non riuscita.";
}

export function ShopifyProductCreator({ initialProposals }: { initialProposals: Proposal[] }) {
  const [proposals, setProposals] = useState(initialProposals);
  const [form, setForm] = useState<FormState>(initialForm);
  const [preview, setPreview] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState<"proposal" | string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const skuError = useMemo(() => {
    const values = form.variants.map((variant) => variant.sku.trim()).filter(Boolean);
    return values.length !== new Set(values.map((value) => value.toUpperCase())).size
      ? "Ogni SKU deve essere unico."
      : null;
  }, [form.variants]);
  const pricesValid = form.variants.every((variant) => Boolean(formatPrice(variant.price)));

  function patchForm(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function chooseCatalog(sku: string) {
    const entry = AETERNA_PRODUCT_CATALOG.find(([catalogSku]) => catalogSku === sku);
    if (!entry) {
      patchForm({ catalogSku: "" });
      return;
    }
    const [, productName, category] = entry;
    setForm((current) => ({
      ...current,
      catalogSku: sku,
      productName,
      sku,
      category,
      variants: [{ ...current.variants[0]!, sku }],
    }));
  }

  function updateVariant(id: string, patch: Partial<ProductVariant>) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant) =>
        variant.id === id ? { ...variant, ...patch } : variant,
      ),
    }));
  }

  function addVariant() {
    setForm((current) => ({
      ...current,
      variants: [...current.variants, newVariant("", current.price)],
    }));
  }

  function removeVariant(id: string) {
    setForm((current) => ({
      ...current,
      variants:
        current.variants.length === 1
          ? current.variants
          : current.variants.filter((variant) => variant.id !== id),
    }));
  }

  function resetToEdit() {
    setPreview(null);
    setError(null);
    setNotice(null);
  }

  async function generateProposal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (skuError || !pricesValid) {
      setError(skuError ?? "Inserisci un prezzo valido per ogni variante.");
      return;
    }
    setBusy("proposal");
    setError(null);
    setNotice(null);
    try {
      const image = form.imageUrl.trim();
      if (image && !/^https:\/\//i.test(image)) {
        throw new Error("La foto deve usare un URL HTTPS verificabile.");
      }
      const response = await fetch("/api/agents/shopify-product-proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceReference: form.catalogSku
            ? `AETERNA catalog ${form.catalogSku}`
            : `Manual product ${form.sku.trim()}`,
          productName: form.productName,
          productType: form.category,
          factualDescription: form.factualDescription,
          materials: form.materials
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          variants: form.variants.map((variant, index) => {
            const name = variant.name.trim() || (index === 0 ? "Default" : "Variant");
            return {
              title: name,
              sku: variant.sku.trim(),
              price: formatPrice(variant.price),
              optionValues: [{ optionName: "Variant", value: name }],
            };
          }),
          images: image ? [{ sourceUrl: image, altText: form.imageAlt.trim() || null }] : [],
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: { proposalTask?: Omit<Proposal, "product">; proposal?: ProposalProduct };
        error?: string;
      } | null;
      if (!response.ok || !payload?.data?.proposalTask || !payload.data.proposal) {
        throw new Error(messageFrom(response, payload));
      }
      const created: Proposal = { ...payload.data.proposalTask, product: payload.data.proposal };
      setPreview(created);
      setProposals((current) => [created, ...current.filter((proposal) => proposal.id !== created.id)]);
      setNotice("Anteprima pronta. Shopify non e stato modificato.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossibile generare la proposta.");
    } finally {
      setBusy(null);
    }
  }

  async function approveAndCreate(id: string) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/agents/shopify-product-proposals/${encodeURIComponent(id)}/create`,
        { method: "POST" },
      );
      const payload = (await response.json().catch(() => null)) as {
        data?: { task?: Partial<Proposal> };
        error?: string;
      } | null;
      if (!response.ok || !payload?.data?.task) throw new Error(messageFrom(response, payload));
      setProposals((current) =>
        current.map((proposal) =>
          proposal.id === id ? { ...proposal, ...payload.data!.task } : proposal,
        ),
      );
      setPreview((current) =>
        current?.id === id ? { ...current, ...payload.data!.task } : current,
      );
      setNotice("Bozza Shopify creata. Il prodotto e DRAFT e non e stato pubblicato.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Creazione bozza non riuscita.");
    } finally {
      setBusy(null);
    }
  }

  const activeStep = preview?.status === "COMPLETED" ? 4 : preview ? 3 : 1;

  return (
    <section className={styles.workspace} aria-labelledby="shopify-product-creator-title">
      <div className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>ALESSANDRO / SHOPIFY OPERATIONS</p>
          <h2 id="shopify-product-creator-title">Nuovo prodotto AI</h2>
          <p>
            Crea una proposta da dati reali. La bozza Shopify viene creata solo dopo la tua
            approvazione.
          </p>
        </div>
        <span className={styles.humanBadge}>
          <CheckCircle2 size={15} /> Controllo umano
        </span>
      </div>

      <ol className={styles.steps} aria-label="Stato della creazione prodotto">
        {["Dati", "Anteprima AI", "Approvazione", "Bozza Shopify"].map((label, index) => (
          <li key={label} className={index + 1 <= activeStep ? styles.stepActive : undefined}>
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {!preview ? (
        <div className={styles.card}>
          <div className={styles.heading}>
            <div>
              <p className={styles.eyebrow}>1 / DATI VERIFICATI</p>
              <h3>Prepara il prodotto</h3>
              <p>Prezzi, materiali, SKU e immagini devono provenire da fonti reali.</p>
            </div>
          </div>
          <form className={styles.form} onSubmit={generateProposal}>
            <div className={styles.grid}>
              <label className={styles.field}>
                Scegli un prodotto AETERNA
                <select value={form.catalogSku} onChange={(event) => chooseCatalog(event.target.value)}>
                  <option value="">Prodotto non presente nel catalogo</option>
                  {AETERNA_PRODUCT_CATALOG.map(([sku, name]) => (
                    <option key={sku} value={sku}>
                      {name} · {sku}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Categoria
                <select
                  required
                  value={form.category}
                  onChange={(event) =>
                    patchForm({ category: event.target.value as FormState["category"] })
                  }
                >
                  {CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Nome prodotto
                <input
                  required
                  value={form.productName}
                  onChange={(event) => patchForm({ productName: event.target.value })}
                  placeholder="Es. Collana Orbis"
                />
              </label>
              <label className={styles.field}>
                SKU principale
                <input
                  required
                  value={form.variants[0]?.sku ?? ""}
                  onChange={(event) => {
                    const sku = event.target.value;
                    patchForm({
                      sku,
                      variants: form.variants.map((variant, index) =>
                        index === 0 ? { ...variant, sku } : variant,
                      ),
                    });
                  }}
                  placeholder="Es. COL-001"
                />
              </label>
              <label className={styles.field}>
                Prezzo in euro
                <input
                  required
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(event) => {
                    const price = event.target.value;
                    patchForm({
                      price,
                      variants: form.variants.map((variant, index) =>
                        index === 0 ? { ...variant, price } : variant,
                      ),
                    });
                  }}
                  placeholder="0,00"
                />
              </label>
              <label className={styles.field}>
                Materiali
                <input
                  required
                  value={form.materials}
                  onChange={(event) => patchForm({ materials: event.target.value })}
                  placeholder="Es. Argento 925, zirconi"
                />
                <span>Separa piu materiali con una virgola.</span>
              </label>
            </div>
            <label className={styles.field}>
              Descrizione delle caratteristiche reali
              <textarea
                required
                value={form.factualDescription}
                onChange={(event) => patchForm({ factualDescription: event.target.value })}
                placeholder="Inserisci solo caratteristiche confermate del prodotto."
              />
            </label>
            <div className={styles.photo}>
              <ImagePlus size={18} aria-hidden="true" />
              <div>
                <strong>Foto prodotto</strong>
                <p>
                  Il caricamento file non e ancora disponibile. Inserisci un URL HTTPS di un asset
                  reale e verificabile.
                </p>
              </div>
              <label className={styles.field}>
                <span className="sr-only">URL foto HTTPS</span>
                <input
                  value={form.imageUrl}
                  onChange={(event) => patchForm({ imageUrl: event.target.value })}
                  placeholder="https://..."
                />
              </label>
              <label className={styles.field}>
                <span className="sr-only">Descrizione foto</span>
                <input
                  value={form.imageAlt}
                  onChange={(event) => patchForm({ imageAlt: event.target.value })}
                  placeholder="Descrizione foto (facoltativa)"
                />
              </label>
            </div>
            <section className={styles.variants} aria-labelledby="variants-title">
              <div className={styles.variantHeader}>
                <div>
                  <p className={styles.eyebrow}>VARIANTI</p>
                  <h4 id="variants-title">Prezzi e SKU</h4>
                  <p>Lo SKU principale corrisponde alla prima variante.</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={addVariant}
                  icon={<Plus size={15} />}
                >
                  Aggiungi variante
                </Button>
              </div>
              {form.variants.map((variant, index) => (
                <div className={styles.variantRow} key={variant.id}>
                  <label className={styles.field}>
                    Nome variante
                    <input
                      value={variant.name}
                      onChange={(event) => updateVariant(variant.id, { name: event.target.value })}
                      placeholder={index === 0 ? "Default" : "Es. Gold"}
                    />
                  </label>
                  <label className={styles.field}>
                    SKU
                    <input
                      required
                      value={variant.sku}
                      readOnly={index === 0}
                      onChange={(event) => updateVariant(variant.id, { sku: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    Prezzo €
                    <input
                      required
                      inputMode="decimal"
                      type="number"
                      min="0"
                      step="0.01"
                      value={variant.price}
                      onChange={(event) => updateVariant(variant.id, { price: event.target.value })}
                    />
                  </label>
                  <button
                    className={styles.remove}
                    type="button"
                    aria-label="Elimina variante"
                    disabled={form.variants.length === 1 || busy !== null}
                    onClick={() => removeVariant(variant.id)}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </section>
            {skuError && (
              <p className={styles.error} role="alert">
                {skuError}
              </p>
            )}
            {!pricesValid && (
              <p className={styles.error} role="alert">
                Inserisci un prezzo valido per ogni variante.
              </p>
            )}
            <div className={styles.actions}>
              <Button
                type="submit"
                disabled={busy !== null || Boolean(skuError) || !pricesValid}
                icon={
                  busy === "proposal" ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />
                }
              >
                {busy === "proposal" ? "Alessandro sta preparando..." : "Genera prodotto con Alessandro"}
              </Button>
              <span className={styles.hint}>Nessun prodotto verra creato in questa fase.</span>
            </div>
          </form>
        </div>
      ) : (
        <div className={styles.card}>
          <div className={styles.heading}>
            <div>
              <p className={styles.eyebrow}>2 / ANTEPRIMA DI ALESSANDRO</p>
              <h3>{preview.product.title}</h3>
              <p>
                Controlla ogni campo prima dell&apos;approvazione. I dati di prezzo e SKU restano
                quelli forniti.
              </p>
            </div>
            <span className={styles.badge}>
              {preview.status === "COMPLETED" ? "Bozza creata" : "Da approvare"}
            </span>
          </div>
          <div className={styles.previewGrid}>
            <div><span>Categoria</span><strong>{preview.product.productType ?? "Non indicata"}</strong></div>
            <div><span>Materiali</span><strong>{preview.product.materials?.join(", ") || "Non indicati"}</strong></div>
            <div className={styles.previewWide}><span>Descrizione prodotto (inglese)</span><p>{plainText(preview.product.descriptionHtml)}</p></div>
            <div><span>SEO title</span><strong>{preview.product.seoTitle ?? "Non disponibile"}</strong></div>
            <div><span>SEO meta description</span><p>{preview.product.seoDescription ?? "Non disponibile"}</p></div>
            <div className={styles.previewWide}><span>Varianti Shopify</span><ul>{preview.product.variants.map((variant) => <li key={`${variant.sku}-${variant.title}`}>{variant.title} · {variant.sku ?? "SKU non indicato"} · € {variant.price}</li>)}</ul></div>
            {preview.product.images?.length ? <div className={styles.previewWide}><span>Foto da associare</span><p>{preview.product.images.length} asset HTTPS verificabile/i.</p></div> : null}
          </div>
          <div className={styles.actions}>
            <Button type="button" variant="secondary" disabled={busy !== null} onClick={resetToEdit} icon={<ChevronLeft size={15} />}>Modifica dati</Button>
            {preview.status === "AWAITING_APPROVAL" && <Button type="button" disabled={busy !== null} onClick={() => void approveAndCreate(preview.id)} icon={busy === preview.id ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}>{busy === preview.id ? "Creazione bozza..." : "Approva e crea bozza"}</Button>}
          </div>
        </div>
      )}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.card}>
        <div className={styles.heading}><div><p className={styles.eyebrow}>STORICO</p><h3>Proposte e bozze Shopify</h3><p>Solo proposte effettivamente salvate dal sistema.</p></div></div>
        {proposals.length === 0 ? <p className={styles.empty}>Nessuna proposta salvata. I prodotti non vengono generati automaticamente.</p> : <div className={styles.proposalList}>{proposals.map((proposal) => <article className={styles.proposal} key={proposal.id}><div className={styles.heading}><div><strong>{proposal.product.title}</strong><p className={styles.hint}>{proposal.product.productType ?? "Prodotto"} · {proposal.product.variants.length} varianti</p></div><span className={styles.badge}>{proposal.status}</span></div><div className={styles.proposalMeta}><span>Aggiornata {new Date(proposal.updatedAt).toLocaleString("it-IT")}</span>{proposal.result && <span>{proposal.result}</span>}</div>{proposal.status === "AWAITING_APPROVAL" && <Button type="button" disabled={busy !== null} onClick={() => { setPreview(proposal); setNotice(null); setError(null); }} variant="secondary">Rivedi proposta</Button>}</article>)}</div>}
      </div>
    </section>
  );
}
