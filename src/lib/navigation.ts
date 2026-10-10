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
    label: "Workspace",
    items: [
      { label: "Overview", href: "/", description: "La vista generale di AETERNA", icon: Compass },
      { label: "Analytics", href: "/analytics", description: "Dati e andamento", icon: BarChart3 },
      { label: "Orders", href: "/orders", description: "Ordini e vendite", icon: ShoppingBag },
      { label: "Products", href: "/products", description: "Catalogo prodotti", icon: Package },
      {
        label: "Inventory",
        href: "/inventory",
        description: "Scorte e disponibilità",
        icon: Boxes,
      },
      { label: "Customers", href: "/customers", description: "Clienti e relazioni", icon: Users },
      {
        label: "Advertising",
        href: "/advertising",
        description: "Pubblicità e campagne",
        icon: Megaphone,
      },
      { label: "Content", href: "/content", description: "Piano dei contenuti", icon: FileText },
      {
        label: "Creators",
        href: "/creators",
        description: "Creator e collaborazioni",
        icon: Sparkles,
      },
      { label: "Website", href: "/website", description: "Andamento del sito", icon: Globe2 },
      { label: "SEO", href: "/seo", description: "Visibilità organica", icon: Search },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Tasks", href: "/tasks", description: "Azioni operative", icon: CheckSquare },
      { label: "Goals", href: "/goals", description: "Obiettivi e percorso", icon: Goal },
      {
        label: "Experiments",
        href: "/experiments",
        description: "Test e apprendimento",
        icon: Code2,
      },
    ],
  },
  {
    label: "TEAM AI",
    items: [
      { label: "TEAM AI", href: "/astra", description: "Centro di controllo degli agenti", icon: Bot },
      {
        label: "Astra Reports",
        href: "/astra-reports",
        description: "Storico dei report",
        icon: FileText,
      },
    ],
  },
  {
    label: "System",
    items: [{ label: "Settings", href: "/settings", description: "Impostazioni", icon: Settings2 }],
  },
];

export const navigationItems = navigationGroups.flatMap((group) => group.items);
export function getNavigationItem(pathname: string): NavigationItem {
  return navigationItems.find((item) => item.href === pathname) ?? navigationItems[0];
}
