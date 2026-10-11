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
import { useEffect, useRef, useState } from "react";
import { navigationGroups, getNavigationItem } from "@/lib/navigation";
import { Icon } from "@/components/ui/icon";
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
        <p>Spazio di lavoro AETERNA</p>
        <button className="sidebar-logout" type="button" onClick={handleLogout}>
          <LogOut size={13} /> Esci dalla sessione
        </button>
      </div>
    </aside>
  );
}

function Topbar({ menuOpen, onMenuOpen }: { menuOpen: boolean; onMenuOpen: () => void }) {
  const pathname = usePathname();
  const current = getNavigationItem(pathname);
  return (
    <header className="topbar">
      <div className="mobile-menu-slot">
        <button
          className="mobile-menu"
          aria-label="Apri menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation-drawer"
          onClick={onMenuOpen}
        >
          <Menu size={20} />
        </button>
      </div>
      <div className="topbar-title">
        <nav aria-label="Percorso" className="breadcrumb">
          <Link href="/">AETERNA OS</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{current.label}</span>
        </nav>
      </div>
      <div className="topbar-actions">
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
            aria-current={active ? "page" : undefined}
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
  const drawerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (!menuOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLElement>(".mobile-close")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
      if (event.key === "Tab" && drawer) {
        const nodes = Array.from(
          drawer.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
        ).filter((node) => node.getClientRects().length > 0);
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const desktop = window.matchMedia("(min-width: 1025px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMenuOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      desktop.removeEventListener("change", closeOnDesktop);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [menuOpen]);
  if (pathname === "/login") {
    return (
      <div className="auth-shell">
        <main>{children}</main>
      </div>
    );
  }
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Vai al contenuto
      </a>
      <div
        ref={drawerRef}
        role={menuOpen ? "dialog" : undefined}
        aria-modal={menuOpen || undefined}
        aria-label="Menu di navigazione"
        className={menuOpen ? "sidebar-mobile open" : "sidebar-mobile"}
        id="mobile-navigation-drawer"
        aria-hidden={!menuOpen}
      >
        {menuOpen && (
          <button
            className="sidebar-backdrop"
            type="button"
            aria-label="Chiudi il menu di navigazione"
            onClick={() => setMenuOpen(false)}
          />
        )}
        {menuOpen && <Sidebar onClose={() => setMenuOpen(false)} />}
      </div>
      <div className="sidebar-desktop">
        <Sidebar />
      </div>
      <div className="main-content" inert={menuOpen}>
        <Topbar menuOpen={menuOpen} onMenuOpen={() => setMenuOpen(true)} />
        <ConnectionStatus />
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
