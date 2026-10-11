import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";
import { OrdersTable, ProductsTable, CustomersTable, InventoryTable } from "../commerce/commerce-tables";
import { navigationItems } from "@/lib/navigation";
import Loading from "@/app/loading";
import NotFound from "@/app/not-found";

describe("Presentation and navigation", () => {
  it("does not imply disconnected services for an empty list", () => {
    const html = renderToStaticMarkup(createElement(EmptyState, {title: "Nessuna attività", description: "Non ci sono attività."}));
    expect(html).not.toContain("Non collegato");
    expect(html).toContain("Nessuna attività");
  });
  it("preserves the existing navigation URLs without duplicates", () => {
    expect(navigationItems.map(item => item.href)).toEqual(["/", "/orders", "/products", "/inventory", "/customers", "/tasks", "/goals", "/experiments", "/analytics", "/advertising", "/website", "/seo", "/content", "/creators", "/astra", "/astra-reports", "/settings"]);
  });
  it("renders commerce empty states without fabricated records", () => {
    const views = [createElement(OrdersTable, {orders: []}), createElement(ProductsTable, {products: []}), createElement(CustomersTable, {customers: []}), createElement(InventoryTable, {inventory: []})];
    for (const view of views) {
      const html = renderToStaticMarkup(view);
      expect(html).toContain("disponibile");
      expect(html).not.toContain("<table");
    }
  });
  it("makes populated tables keyboard-scrollable and labelled", () => {
    const html = renderToStaticMarkup(createElement(CustomersTable, {customers: [{id: "fixture", name: "Cliente di test", email: null, orderCount: 0, lastOrderAt: null}]}));
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('<caption class="sr-only">Clienti</caption>');
    expect(html).toContain('scope="col"');
  });
  it("announces loading without invented progress", () => {
    const html = renderToStaticMarkup(createElement(Loading));
    expect(html).toContain('role="status"');
    expect(html).not.toContain("progressbar");
  });
  it("offers a working recovery link for missing pages", () => {
    const html = renderToStaticMarkup(createElement(NotFound));
    expect(html).toContain("Pagina non trovata");
    expect(html).toContain('href="/"');
  });
});
