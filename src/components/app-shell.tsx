"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  Bell,
  Bolt,
  ChartNoAxesCombined,
  CircleHelp,
  CreditCard,
  Gauge,
  Grid2X2,
  LogOut,
  Menu,
  MessageSquareText,
  PhoneCall,
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

const customer = [
  ["Dashboard", "", Gauge],
  ["Verification", "sms", Shield],
  ["Fund wallet", "wallet", WalletCards],
  ["Services", "services", Grid2X2],
  ["Transactions", "transactions", CreditCard],
  ["Profile", "profile", UserRound],
  ["Support", "support", CircleHelp],
] as const;

const primaryCustomer = customer.slice(0, 5);

const admin = [
  ["Overview", "", Gauge],
  ["Users", "users", Users],
  ["SMS Orders", "sms-orders", MessageSquareText],
  ["Airtime Orders", "airtime-orders", PhoneCall],
  ["Data Orders", "data-orders", Smartphone],
  ["Electricity", "electricity-orders", Bolt],
  ["Wallet Transactions", "wallet-transactions", WalletCards],
  ["API Providers", "providers", Shield],
  ["Pricing Management", "pricing", Settings],
  ["Revenue Analytics", "analytics", ChartNoAxesCombined],
  ["Notifications", "notifications", Bell],
  ["Settings", "settings", Settings],
] as const;

export function AppShell({ adminMode = false, children }: { adminMode?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(!firebaseConfigured && !adminMode);
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!firebaseConfigured) {
      if (adminMode) router.replace("/login");
      return;
    }
    return onAuthStateChanged(auth, async user => {
      if (!user) {
        router.replace("/login");
        return;
      }
      if (adminMode) {
        try {
          await api("/api/admin/summary");
        } catch {
          router.replace("/dashboard");
          return;
        }
      }
      setReady(true);
    });
  }, [router, adminMode]);

  async function logout() {
    await signOut(auth);
    router.push("/login");
  }

  if (!ready) {
    return <div className="grid min-h-screen place-items-center bg-[#f6f8fb] text-sm font-semibold text-[#718096]">Securing your workspace…</div>;
  }

  if (!adminMode) {
    return (
      <div className="min-h-screen bg-[#f6f8fb] text-[#132a44]">
        <header className="sticky top-0 z-40 border-b border-[#e1e8f0] bg-white/95 backdrop-blur-xl">
          <div className="mx-auto flex h-[78px] max-w-[1320px] items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
            <Brand />
            <nav className="hidden items-center gap-1 lg:flex">
              {primaryCustomer.map(([label, slug, Icon]) => {
                const href = slug ? `/dashboard/${slug}` : "/dashboard";
                const active = path === href;
                return (
                  <Link key={label} href={href} className={`flex h-11 items-center gap-2 rounded-xl px-3.5 text-[12px] font-extrabold transition ${active ? "bg-[#edf3fa] text-[#123f7d]" : "text-[#6d7f92] hover:bg-[#f5f7fa] hover:text-[#123f7d]"}`}>
                    <Icon size={16} strokeWidth={2.2} />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-2">
              <Link href="/dashboard/notifications" aria-label="Notifications" className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#e0e7ef] bg-white text-[#597086] transition hover:border-[#c8d5e2] hover:bg-[#f7f9fb]">
                <Bell size={17} />
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#a61940] ring-2 ring-white" />
              </Link>
              <Link href="/dashboard/profile" className="hidden h-10 items-center gap-2 rounded-xl border border-[#e0e7ef] bg-white px-2.5 pr-3 transition hover:border-[#c8d5e2] sm:flex">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#123f7d] text-[10px] font-black text-white">D</span>
                <span className="text-[11px] font-extrabold text-[#2a4056]">My account</span>
              </Link>
              <button onClick={logout} aria-label="Log out" className="hidden h-10 w-10 place-items-center rounded-xl bg-[#123f7d] text-white shadow-[0_8px_18px_rgba(18,63,125,.16)] transition hover:bg-[#0d3266] md:grid">
                <LogOut size={16} />
              </button>
              <button onClick={() => setOpen(!open)} aria-label="Open navigation" className="grid h-10 w-10 place-items-center rounded-xl border border-[#e0e7ef] bg-white text-[#2a4056] lg:hidden">
                {open ? <X size={19} /> : <Menu size={19} />}
              </button>
            </div>
          </div>
          {open && (
            <nav className="border-t border-[#e6ecf2] bg-white px-4 py-4 shadow-[0_18px_35px_rgba(20,46,75,.08)] lg:hidden">
              <div className="mx-auto grid max-w-[1320px] gap-1 sm:grid-cols-2">
                {customer.map(([label, slug, Icon]) => {
                  const href = slug ? `/dashboard/${slug}` : "/dashboard";
                  const active = path === href;
                  return (
                    <Link key={label} href={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold ${active ? "bg-[#edf3fa] text-[#123f7d]" : "text-[#63778b]"}`}>
                      <Icon size={17} />
                      {label}
                    </Link>
                  );
                })}
                <button onClick={logout} className="flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-[#a61940]"><LogOut size={17} /> Log out</button>
              </div>
            </nav>
          )}
        </header>
        <main className="mx-auto max-w-[1320px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-9">{children}</main>
        <footer className="py-10 text-center text-xs font-semibold text-[#95a2af]">© 2026 DMB Logs Portal · Secure digital services</footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f6ff]">
      <aside className={`fixed inset-y-0 left-0 z-40 w-[272px] bg-[#211b52] p-5 text-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between"><Brand light /><button className="lg:hidden" onClick={() => setOpen(false)}><X /></button></div>
        <p className="mt-8 px-3 text-[10px] font-black uppercase tracking-[.18em] text-white/35">Administration</p>
        <nav className="mt-3 space-y-1">
          {admin.map(([label, slug, Icon]) => {
            const href = slug ? `/admin/${slug}` : "/admin";
            return <Link key={label} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold ${path === href ? "bg-[#6757e8] text-white" : "text-white/60 hover:bg-white/5 hover:text-white"}`}><Icon size={17} />{label}</Link>;
          })}
        </nav>
      </aside>
      <div className="lg:pl-[272px]">
        <header className="flex h-20 items-center justify-between border-b border-[#e5e2f1] bg-white px-6"><button onClick={() => setOpen(true)} className="lg:hidden"><Menu /></button><b className="text-sm">DMB Logs Portal operations</b><button onClick={logout} className="btn-primary py-2.5 text-xs"><LogOut size={14} /> Log out</button></header>
        <main className="p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}
