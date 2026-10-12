import { z } from "zod";

const agent = z.enum(["LORENZO", "MARCO", "GIULIA", "ALESSANDRO", "MATTEO", "FRANCESCA"]);
const status = z.enum([
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "AWAITING_APPROVAL",
  "CANCELLED",
]);
const task = z.object({
  id: z.string(),
  agent,
  title: z.string(),
  description: z.string().nullable(),
  source: z.enum(["MANUAL", "AUTOMATIC", "EVENT"]),
  priority: z.number(),
  status,
  requiresApproval: z.boolean(),
  approvalReason: z.string().nullable(),
  result: z.string().nullable(),
  executionId: z.string().nullable(),
  aiInvocationId: z.string().nullable(),
  parentTaskId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const tasksResponse = z.object({ tasks: z.array(task) });
export const taskResponse = z.object({ task });
export const planResponse = z.object({
  databaseConfigured: z.boolean(),
  databaseAvailable: z.boolean(),
  generatedAt: z.string().datetime(),
  dataAvailability: z.object({
    shopify: z.boolean(),
    metaAds: z.boolean(),
    analytics: z.boolean(),
    recordedOrders: z.number().nullable(),
  }),
  proposals: z.array(
    z.object({
      agent,
      title: z.string(),
      description: z.string(),
      priority: z.number(),
      risk: z.enum([
        "ANALYSIS",
        "DATA_COLLECTION",
        "CONFIGURATION",
        "PUBLIC_SHOPIFY_CHANGE",
        "META_CAMPAIGN_CHANGE",
        "AD_SPEND",
        "CUSTOMER_COMMUNICATION",
        "CONTENT_PUBLICATION",
      ]),
      dedupeKey: z.string(),
    }),
  ),
  notes: z.array(z.string()),
});
export const savedPlanResponse = z.object({
  plan: planResponse,
  tasks: z.array(task),
  created: z.number(),
});

export async function requestTeamData<T>(
  url: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new Error(
      "Connessione interrotta. Aggiorna il registro per verificare l'esito prima di riprovare.",
    );
  }
  if (response.status === 401)
    throw new Error("Sessione scaduta. Accedi nuovamente al gestionale.");
  if (response.status === 429)
    throw new Error("Troppe richieste. Attendi qualche istante prima di riprovare.");
  if (response.status === 400 || response.status === 409)
    throw new Error(
      "L'attività non può essere aggiornata. Ricarica il registro e verifica lo stato.",
    );
  if (!response.ok) throw new Error("Servizio operativo non disponibile. Riprova più tardi.");
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Risposta non valida. Verifica la sessione e aggiorna la pagina.");
  }
  try {
    return schema.parse(await response.json());
  } catch {
    throw new Error("I dati ricevuti non sono leggibili. Aggiorna la pagina prima di riprovare.");
  }
}
