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
  Grid2X2,
  LogOut,
  Menu,
  MessageSquareText,
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
  ["Overview", "", Gauge], ["SMS verification", "sms", Shield], ["Buy airtime", "airtime", PhoneCall],
  ["Buy data", "data", Smartphone], ["Electricity bills", "electricity", Bolt], ["Fund wallet", "wallet", WalletCards],
  ["Transactions", "transactions", CreditCard], ["Notifications", "notifications", Bell], ["Profile", "profile", UserRound], ["Support", "support", CircleHelp],
];

const adminNav: NavItem[] = [
  ["Overview", "", Gauge], ["Users", "users", Users], ["SMS orders", "sms-orders", MessageSquareText],
  ["Airtime orders", "airtime-orders", PhoneCall], ["Data orders", "data-orders", Smartphone], ["Electricity", "electricity-orders", Bolt],
  ["Wallet activity", "wallet-transactions", WalletCards], ["API providers", "providers", Activity], ["Pricing", "pricing", Settings],
  ["Analytics", "analytics", ChartNoAxesCombined], ["Notifications", "notifications", Bell], ["Settings", "settings", Settings],
];

function pathFor(adminMode: boolean, slug: string) {
  return `${adminMode ? "/admin" : "/dashboard"}${slug ? `/${slug}` : ""}`;
}

export function AppShell({ adminMode = false, children }: { adminMode?: boolean; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [ready, setReady] = useState(!firebaseConfigured && !adminMode);
  const path = usePathname();
  const router = useRouter();
  const nav = adminMode ? adminNav : customerNav;
  const current = useMemo(() => nav.find(([, slug]) => path === pathFor(adminMode, slug))?.[0] || (adminMode ? "Administration" : "Dashboard"), [path, nav, adminMode]);

  useEffect(() => {
    if (!firebaseConfigured) {
      if (adminMode) router.replace("/login");
      return;
    }
    let settled = false;
    const authTimeout = window.setTimeout(() => {
      if (!settled) router.replace("/login?reason=session-timeout");
    }, 6000);
    const unsubscribe = onAuthStateChanged(auth, async user => {
      settled = true;
      window.clearTimeout(authTimeout);
      if (!user) {
        router.replace("/login");
        return;
      }
      if (adminMode) {
        try { await api("/api/admin/summary"); }
        catch { router.replace("/dashboard"); return; }
      }
      setReady(true);
    }, () => {
      settled = true;
      window.clearTimeout(authTimeout);
      router.replace("/login?reason=session-error");
    });
    return () => {
      settled = true;
      window.clearTimeout(authTimeout);
      unsubscribe();
    };
  }, [router, adminMode]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  async function logout() {
    await signOut(auth);
    router.push("/login");
  }

  if (!ready) return <div className="portal-loading"><span /><p>Securing your workspace…</p></div>;

  const sidebar = (
    <aside className={`portal-sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""} ${adminMode ? "is-admin" : ""}`}>
      <div className="portal-sidebar-brand">
        {collapsed ? <Link href="/" aria-label="DMB Logs Portal"><Image src="/dmb-logins-logo.png" alt="" width={52} height={52} className="h-12 w-12 object-contain" /></Link> : <Brand light />}
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
        {!collapsed && <Link href={adminMode ? "/admin/settings" : "/dashboard/profile"} className="portal-security-note"><UserRound size={16} /><div><b>{auth.currentUser?.displayName || "DMB user"}</b><small>{auth.currentUser?.email || "Secure account"}</small></div></Link>}
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
            <label className="portal-search"><Search size={15} /><input placeholder="Search workspace" aria-label="Search workspace" /></label>
            <ThemeToggle compact />
            <div className="relative">
              <button onClick={() => { setNotificationsOpen(!notificationsOpen); setProfileOpen(false); }} className="portal-icon-button" aria-label="Notifications"><Bell size={17} /><span /></button>
              {notificationsOpen && <div className="portal-popover portal-notifications"><div className="portal-popover-head"><div><b>Notifications</b><p>Account and service updates</p></div><button onClick={() => setNotificationsOpen(false)}><X size={15} /></button></div><div className="ui-empty min-h-[190px]"><span className="ui-empty-icon"><Bell size={20} /></span><b className="mt-4 text-sm">You&apos;re all caught up</b><p className="mt-2 text-xs text-[var(--muted)]">New updates will appear here.</p></div></div>}
            </div>
            <div className="relative">
              <button onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false); }} className="portal-profile-button"><span>D</span><div><b>{auth.currentUser?.displayName || "DMB user"}</b><small>{adminMode ? "Administrator" : "Customer"}</small></div><ChevronDown size={14} /></button>
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
