"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Bot,
  CheckSquare,
  Compass,
  LogOut,
  Menu,
  ShoppingBag,
  Settings2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { navigationGroups, getNavigationItem } from "@/lib/navigation";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { LinkButton } from "@/components/ui/button";

function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    router.push("/login");
  }

  return (
    <aside className="sidebar">
      <div className="brand-row">
        <Link href="/" prefetch={false} className="brand-lockup" onClick={onClose}>
          <span className="brand-mark">A</span>
          <span>
            <span className="brand-name">AETERNA</span>
            <span className="brand-os">OS</span>
          </span>
        </Link>
        {onClose && (
          <button className="mobile-close" onClick={onClose} aria-label="Chiudi menu">
            <X size={18} />
          </button>
        )}
      </div>
      <nav className="sidebar-nav" aria-label="Navigazione principale">
        {navigationGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-group-label">{group.label}</p>
            {group.items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  prefetch={false}
                  className={isActive ? "nav-item nav-item-active" : "nav-item"}
                  href={item.href}
                  key={item.href}
                  onClick={onClose}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon icon={item.icon} size={16} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <StatusBadge tone="muted">Ambiente locale</StatusBadge>
        <p>Nessun dato demo viene inserito automaticamente.</p>
        <button className="sidebar-logout" type="button" onClick={handleLogout}>
          <LogOut size={13} /> Esci dalla sessione
        </button>
      </div>
    </aside>
  );
}

function Topbar() {
  const pathname = usePathname();
  const current = getNavigationItem(pathname);
  return (
    <header className="topbar">
      <div className="mobile-menu-slot">
        <button
          className="mobile-menu"
          aria-label="Apri menu"
          onClick={() => window.dispatchEvent(new Event("aeterna:open-menu"))}
        >
          <Menu size={20} />
        </button>
      </div>
      <div className="topbar-title">
        <p className="eyebrow">AETERNA OS / {current.label.toUpperCase()}</p>
        <h1>{current.label}</h1>
        <p>{current.description}</p>
      </div>
      <div className="topbar-actions">
        <StatusBadge tone="disconnected">Integrazioni non collegate</StatusBadge>
        <LinkButton href="/astra" variant="ghost" icon={<Bot size={15} />}>
          Apri TEAM AI <ArrowUpRight size={14} />
        </LinkButton>
      </div>
    </header>
  );
}

function ConnectionStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <div
      className={online ? "connection-status" : "connection-status connection-status-offline"}
      role="status"
    >
      <span className="status-dot" />
      {online ? "Connessione disponibile" : "Offline: azioni server sospese"}
    </div>
  );
}

function MobileNav() {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Home", icon: Compass },
    { href: "/orders", label: "Ordini", icon: ShoppingBag },
    { href: "/tasks", label: "Task", icon: CheckSquare },
    { href: "/settings", label: "Settings", icon: Settings2 },
  ];
  return (
    <nav className="mobile-nav" aria-label="Navigazione rapida">
      {items.map((item) => {
        const ItemIcon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            className={active ? "mobile-nav-item mobile-nav-item-active" : "mobile-nav-item"}
            href={item.href}
            key={item.href}
          >
            <ItemIcon size={18} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    const handler = () => setMenuOpen(true);
    window.addEventListener("aeterna:open-menu", handler);
    return () => window.removeEventListener("aeterna:open-menu", handler);
  }, []);
  if (pathname === "/login") {
    return (
      <div className="auth-shell">
        <main>{children}</main>
      </div>
    );
  }
  return (
    <div className="app-shell">
      <div className={menuOpen ? "sidebar-mobile open" : "sidebar-mobile"}>
        <Sidebar onClose={() => setMenuOpen(false)} />
      </div>
      <div className="sidebar-desktop">
        <Sidebar />
      </div>
      <div className="main-content">
        <Topbar />
        <ConnectionStatus />
        <main>{children}</main>
        <MobileNav />
      </div>
    </div>
  );
}
