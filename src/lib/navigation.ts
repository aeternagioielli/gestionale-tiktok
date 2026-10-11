import type { ComponentType } from "react";
import {
  BarChart3,
  Bot,
  Boxes,
  CheckSquare,
  Code2,
  Compass,
  FileText,
  Globe2,
  Goal,
  Megaphone,
  Package,
  Search,
  Settings2,
  ShoppingBag,
  Sparkles,
  Users,
} from "lucide-react";

export type NavigationItem = {
  label: string;
  href: string;
  description: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};
export type NavigationGroup = { label: string; items: NavigationItem[] };

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Azienda",
    items: [
      {
        label: "Panoramica",
        href: "/",
        description: "La vista generale di AETERNA",
        icon: Compass,
      },
      { label: "Ordini", href: "/orders", description: "Ordini e vendite", icon: ShoppingBag },
      { label: "Prodotti", href: "/products", description: "Catalogo prodotti", icon: Package },
      {
        label: "Inventario",
        href: "/inventory",
        description: "Scorte e disponibilità",
        icon: Boxes,
      },
      { label: "Clienti", href: "/customers", description: "Clienti e relazioni", icon: Users },
    ],
  },
  {
    label: "Operatività",
    items: [
      { label: "Attività", href: "/tasks", description: "Azioni operative", icon: CheckSquare },
      { label: "Obiettivi", href: "/goals", description: "Obiettivi e percorso", icon: Goal },
      {
        label: "Esperimenti",
        href: "/experiments",
        description: "Test e apprendimento",
        icon: Code2,
      },
    ],
  },
  {
    label: "Crescita",
    items: [
      { label: "Analytics", href: "/analytics", description: "Dati e andamento", icon: BarChart3 },
      {
        label: "Pubblicità",
        href: "/advertising",
        description: "Pubblicità e campagne",
        icon: Megaphone,
      },
      { label: "Sito web", href: "/website", description: "Andamento del sito", icon: Globe2 },
      { label: "SEO", href: "/seo", description: "Visibilità organica", icon: Search },
    ],
  },
  {
    label: "Contenuti",
    items: [
      { label: "Contenuti", href: "/content", description: "Piano dei contenuti", icon: FileText },
      {
        label: "Creator",
        href: "/creators",
        description: "Creator e collaborazioni",
        icon: Sparkles,
      },
    ],
  },
  {
    label: "TEAM AI",
    items: [
      {
        label: "TEAM AI",
        href: "/astra",
        description: "Centro di controllo degli agenti",
        icon: Bot,
      },
      {
        label: "Report AI",
        href: "/astra-reports",
        description: "Storico dei report",
        icon: FileText,
      },
    ],
  },
  {
    label: "Sistema",
    items: [
      { label: "Impostazioni", href: "/settings", description: "Impostazioni", icon: Settings2 },
    ],
  },
];

export const navigationItems = navigationGroups.flatMap((group) => group.items);

export function getNavigationItem(pathname: string): NavigationItem {
  return navigationItems.find((item) => item.href === pathname) ?? navigationItems[0];
}
