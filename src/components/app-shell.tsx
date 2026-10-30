"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  Activity,
  Bell,
  Bolt,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Gauge,
  LogOut,
  Menu,
  MessageSquareText,
  Store,
  PhoneCall,
  Search,
  Settings,
  Shield,
  Smartphone,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { auth, firebaseConfigured } from "@/lib/firebase/client";
import { api } from "@/lib/api-client";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = readonly [string, string, typeof Gauge];

const customerNav: NavItem[] = [
  ["Overview", "", Gauge], ["Marketplace", "marketplace", Store], ["SMS verification", "sms", Shield], ["Buy airtime", "airtime", PhoneCall],
  ["Buy data", "data", Smartphone], ["Electricity bills", "electricity", Bolt], ["Fund wallet", "wallet", WalletCards],
  ["Transactions", "transactions", CreditCard], ["Notifications", "notifications", Bell], ["Profile", "profile", UserRound], ["Support", "support", CircleHelp],
];

const adminNav: NavItem[] = [
  ["Overview", "", Gauge], ["Users", "users", Users], ["Marketplace", "marketplace", Store], ["SMS orders", "sms-orders", MessageSquareText],
  ["Airtime orders", "airtime-orders", PhoneCall], ["Data orders", "data-orders", Smartphone], ["Electricity", "electricity-orders", Bolt],
  ["Wallet activity", "wallet-transactions", WalletCards], ["API providers", "providers", Activity], ["Pricing", "pricing", Settings],
  ["Analytics", "analytics", ChartNoAxesCombined], ["Notifications", "notifications", Bell], ["Settings", "settings", Settings],
];

function pathFor(adminMode: boolean, slug: string) {
  return `${adminMode ? "/admin" : "/dashboard"}${slug ? `/${slug}` : ""}`;
}

export function AppShell({ adminMode = false, children }: { adminMode?: boolean; children: ReactNode }) {
  const path = usePathname();
  const adminLoginRoute = adminMode && path === "/admin/login";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [ready, setReady] = useState(adminLoginRoute || (!firebaseConfigured && !adminMode));
  const router = useRouter();
  const nav = adminMode ? adminNav : customerNav;
  const current = useMemo(() => nav.find(([, slug]) => path === pathFor(adminMode, slug))?.[0] || (adminMode ? "Administration" : "Dashboard"), [path, nav, adminMode]);
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return query ? nav.filter(([label]) => label.toLowerCase().includes(query)).slice(0, 6) : nav.slice(0, 5);
  }, [nav, searchQuery]);

  useEffect(() => {
    if (adminLoginRoute) {
      setReady(true);
      return;
    }
    if (!firebaseConfigured) {
      if (adminMode) router.replace("/admin/login?reason=not-configured");
      return;
    }
    let settled = false;
    const authTimeout = window.setTimeout(() => {
      if (!settled) router.replace(adminMode ? "/admin/login?reason=session-timeout" : "/login?reason=session-timeout");
    }, 6000);
    const unsubscribe = onAuthStateChanged(auth, async user => {
      settled = true;
      window.clearTimeout(authTimeout);
      if (!user) {
        router.replace(adminMode ? "/admin/login" : "/login");
        return;
      }
      if (adminMode) {
        try { await api("/api/admin/summary"); }
        catch { router.replace("/admin/login?reason=unauthorized"); return; }
      }
      setReady(true);
    }, () => {
      settled = true;
      window.clearTimeout(authTimeout);
      router.replace(adminMode ? "/admin/login?reason=session-error" : "/login?reason=session-error");
    });
    return () => {
      settled = true;
      window.clearTimeout(authTimeout);
      unsubscribe();
    };
  }, [router, adminMode, adminLoginRoute]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === "/" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        document.getElementById("portal-navigation-search")?.focus();
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  async function logout() {
    await signOut(auth);
    router.push("/login");
  }

  if (!ready) return <div className="portal-loading"><span /><p>Securing your workspace…</p></div>;
  if (adminLoginRoute) return <>{children}</>;
  const avatarInitial = (auth.currentUser?.displayName || auth.currentUser?.email || "N").trim().charAt(0).toUpperCase();

  const sidebar = (
    <aside className={`portal-sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""} ${adminMode ? "is-admin" : ""}`}>
      <div className="portal-sidebar-brand">
        {collapsed ? <Link href="/" aria-label="Nextlogs" className={`theme-mark h-12 w-12 ${adminMode ? "is-light" : ""}`}><Image src="/nextlogs-mark.png" alt="" width={430} height={430} className="logo-light h-12 w-12 object-contain" /><Image src="/nextlogs-mark-dark.png" alt="" aria-hidden="true" width={430} height={430} className="logo-dark h-12 w-12 object-contain" /></Link> : <Brand light={adminMode} />}
        <button onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="portal-mobile-close"><X size={18} /></button>
      </div>
      <div className="portal-sidebar-label">{adminMode ? "Operations" : "Personal workspace"}</div>
      <nav className="portal-sidebar-nav">
        {nav.map(([label, slug, Icon]) => {
          const href = pathFor(adminMode, slug);
          const active = path === href;
          return <Link key={label} href={href} onClick={() => setMobileOpen(false)} title={collapsed ? label : undefined} className={`portal-nav-link ${active ? "is-active" : ""}`}><Icon size={18} /><span>{label}</span>{active && !collapsed && <ChevronRight size={14} className="ml-auto" />}</Link>;
        })}
      </nav>
      <div className="portal-sidebar-footer">
        {!collapsed && <Link href={adminMode ? "/admin/settings" : "/dashboard/profile"} className="portal-security-note"><UserRound size={16} /><div><b>{auth.currentUser?.displayName || "Nextlogs user"}</b><small>{auth.currentUser?.email || "Secure account"}</small></div></Link>}
        <button onClick={logout} className="portal-logout" title={collapsed ? "Log out" : undefined}><LogOut size={17} /><span>Log out</span></button>
      </div>
      <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="portal-collapse">{collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
    </aside>
  );

  return (
    <div className={`portal-shell ${adminMode ? "portal-admin" : ""}`}>
      <button className={`portal-backdrop ${mobileOpen ? "is-visible" : ""}`} onClick={() => setMobileOpen(false)} aria-label="Close navigation" />
      {sidebar}
      <div className={`portal-main ${collapsed ? "sidebar-collapsed" : ""}`}>
        <header className="portal-topbar">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="portal-mobile-menu" aria-label="Open navigation"><Menu size={19} /></button>
            <div className="min-w-0"><p className="portal-topbar-kicker">{adminMode ? "Admin console" : "Customer portal"}</p><h1 className="truncate">{current}</h1></div>
          </div>
          <div className="portal-topbar-actions">
            <div className="portal-search-wrap"><label className="portal-search"><Search size={15} /><input id="portal-navigation-search" value={searchQuery} onFocus={() => setSearchOpen(true)} onBlur={() => window.setTimeout(() => setSearchOpen(false), 140)} onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }} placeholder="Go to a page…" aria-label="Search workspace pages" /><kbd>/</kbd></label>{searchOpen && <div className="portal-search-results"><div><span>{searchQuery ? "Matching pages" : "Quick navigation"}</span><small>{searchResults.length} result{searchResults.length === 1 ? "" : "s"}</small></div>{searchResults.length ? searchResults.map(([label, slug, Icon]) => <Link key={label} href={pathFor(adminMode, slug)} onMouseDown={(event) => event.preventDefault()} onClick={() => { setSearchOpen(false); setSearchQuery(""); }}><Icon size={16} /><span><b>{label}</b><small>{adminMode ? "Admin console" : "Customer workspace"}</small></span><ChevronRight size={14} /></Link>) : <p>No page matches “{searchQuery}”.</p>}</div>}</div>
            <ThemeToggle compact />
            <div className="relative">
              <button onClick={() => { setNotificationsOpen(!notificationsOpen); setProfileOpen(false); }} className="portal-icon-button" aria-label="Notifications"><Bell size={17} /><span /></button>
              {notificationsOpen && <div className="portal-popover portal-notifications"><div className="portal-popover-head"><div><b>Notifications</b><p>Account and service updates</p></div><button onClick={() => setNotificationsOpen(false)}><X size={15} /></button></div><div className="ui-empty min-h-[190px]"><span className="ui-empty-icon"><Bell size={20} /></span><b className="mt-4 text-sm">You&apos;re all caught up</b><p className="mt-2 text-xs text-[var(--muted)]">New updates will appear here.</p></div></div>}
            </div>
            <div className="relative">
              <button onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false); }} className="portal-profile-button"><span>{avatarInitial}</span><div><b>{auth.currentUser?.displayName || "Nextlogs user"}</b><small>{adminMode ? "Administrator" : "Customer"}</small></div><ChevronDown size={14} /></button>
              {profileOpen && <div className="portal-popover portal-profile-menu"><Link href={adminMode ? "/admin/settings" : "/dashboard/profile"} onClick={() => setProfileOpen(false)}><UserRound size={16} /> Profile & settings</Link><Link href={adminMode ? "/admin/notifications" : "/dashboard/support"} onClick={() => setProfileOpen(false)}><CircleHelp size={16} /> Help & support</Link><button onClick={logout}><LogOut size={16} /> Log out</button></div>}
            </div>
          </div>
        </header>
        <main className="portal-content">{children}</main>
        {!adminMode && <nav className="portal-mobile-bottom">{customerNav.slice(0, 5).map(([label, slug, Icon]) => { const href = pathFor(false, slug); return <Link key={label} href={href} className={path === href ? "is-active" : ""}><Icon size={19} /><span>{label === "SMS verification" ? "SMS" : label.replace("Buy ", "")}</span></Link>; })}</nav>}
      </div>
    </div>
  );
}
