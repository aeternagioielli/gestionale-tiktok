import { describe, expect, it } from "vitest";
import { buildLorenzoPrompt, parseLorenzoReport } from "@/server/services/lorenzo-service";

const validReport = {
  generalSituation: "Dati iniziali disponibili.",
  orders: { summary: "Nessun ordine disponibile.", observations: ["Serve una fonte ordini."] },
  trend: "Non valutabile con i dati disponibili.",
  whatWorks: ["La base dati è pronta."],
  whatDoesNotWork: ["Mancano dati di vendita."],
  problems: ["Nessun ordine importato."],
  opportunities: ["Collegare una fonte ordini."],
  priorityOne: "Rendere disponibile la prima serie di dati commerciali.",
  priorities: ["Raccogliere dati", "Verificare inventario", "Definire obiettivi"],
  recommendedTasks: ["Marco", "Giulia", "Alessandro", "Matteo", "Francesca"].map((person) => ({
    person,
    actions: ["Verificare i dati disponibili prima di agire."],
  })),
};

describe("Lorenzo report contract", () => {
  it("builds a data-grounded prompt without operational tools", () => {
    const prompt = buildLorenzoPrompt({ orders: { totalOrders: 0 } });
    expect(prompt).toContain("esclusivamente i dati");
    expect(prompt).toContain('"totalOrders":0');
    expect(prompt).toContain("Non impartire comandi");
  });

  it("accepts only the complete report contract returned by a simulated model", () => {
    expect(parseLorenzoReport(JSON.stringify(validReport))).toMatchObject({
      priorityOne: validReport.priorityOne,
      recommendedTasks: expect.arrayContaining([expect.objectContaining({ person: "Marco" })]),
    });
  });

  it("rejects incomplete model output instead of saving an invented report", () => {
    expect(() => parseLorenzoReport('{"generalSituation":"incompleto"}')).toThrow(
      "formato utilizzabile",
    );
  });
});
