"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bolt,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Headphones,
  History,
  MessageSquareText,
  PhoneCall,
  Plus,
  ReceiptText,
  ShieldCheck,
  WalletCards,
  Wifi,
} from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { api } from "@/lib/api-client";

type Transaction = {
  id: string;
  reference?: string;
  serviceType?: string;
  amountMinor?: number;
  retailPriceMinor?: number;
  status?: string;
  createdAt?: string | { seconds?: number };
};

const services = [
  { name: "SMS verification", copy: "Receive verification codes", href: "/dashboard/sms", icon: MessageSquareText, tone: "blue" },
  { name: "Airtime", copy: "Recharge any network", href: "/dashboard/airtime", icon: PhoneCall, tone: "rose" },
  { name: "Mobile data", copy: "Choose a data bundle", href: "/dashboard/data", icon: Wifi, tone: "blue" },
  { name: "Electricity", copy: "Pay prepaid or postpaid", href: "/dashboard/electricity", icon: Bolt, tone: "rose" },
] as const;

const money = (minor = 0) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(minor / 100);

function transactionDate(value: Transaction["createdAt"]) {
  const date = typeof value === "string" ? new Date(value) : value?.seconds ? new Date(value.seconds * 1000) : null;
  return date && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" }).format(date) : "Recently";
}

function StatusBadge({ status = "pending" }: { status?: string }) {
  const value = status.toLowerCase();
  const color = value === "successful" ? "bg-emerald-50 text-emerald-700" : value === "failed" ? "bg-rose-50 text-rose-700" : value === "refunded" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold capitalize ${color}`}>{value.replaceAll("_", " ")}</span>;
}

function Metric({ icon: Icon, label, value, detail, loading }: { icon: typeof CreditCard; label: string; value: string; detail: string; loading: boolean }) {
  return (
    <article className="dash-metric">
      <div className="flex items-center gap-3">
        <span className="dash-icon-blue"><Icon size={18} /></span>
        <p className="text-xs font-extrabold text-[#607286]">{label}</p>
      </div>
      {loading ? <div className="mt-5 h-8 w-24 animate-pulse rounded-lg bg-[#edf1f5]" /> : <p className="mt-5 text-[30px] font-black tracking-[-.04em] text-[#132a44]">{value}</p>}
      <p className="mt-1 text-[10px] font-semibold text-[#98a4b1]">{detail}</p>
    </article>
  );
}

export function DashboardHome() {
  const [balanceMinor, setBalanceMinor] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("there");
  const [today, setToday] = useState("Your account overview");

  useEffect(() => {
    let active = true;
    setFirstName(auth.currentUser?.displayName?.trim().split(/\s+/)[0] || "there");
    setToday(new Intl.DateTimeFormat("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()));
    async function load() {
      const [wallet, activity] = await Promise.allSettled([
        api<{ balanceMinor: number }>("/api/wallet"),
        api<{ transactions: Transaction[] }>("/api/transactions"),
      ]);
      if (!active) return;
      if (wallet.status === "fulfilled") setBalanceMinor(wallet.value.balanceMinor);
      if (activity.status === "fulfilled") setTransactions(activity.value.transactions);
      setLoading(false);
    }
    if (auth.currentUser) load();
    else setLoading(false);
    return () => { active = false; };
  }, []);

  const successful = useMemo(() => transactions.filter(item => item.status?.toLowerCase() === "successful"), [transactions]);
  const pending = useMemo(() => transactions.filter(item => ["pending", "processing"].includes(item.status?.toLowerCase() || "")), [transactions]);
  const spentMinor = useMemo(() => successful.reduce((sum, item) => sum + (item.retailPriceMinor ?? item.amountMinor ?? 0), 0), [successful]);
  const activityByService = useMemo(() => {
    const totals = new Map<string, number>();
    transactions.forEach(item => {
      const key = item.serviceType?.replaceAll("_", " ") || "Wallet";
      totals.set(key, (totals.get(key) || 0) + (item.retailPriceMinor ?? item.amountMinor ?? 0));
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [transactions]);

  return (
    <div className="dash-page">
      <section className="dash-hero">
        <div className="dash-hero-grid">
          <div className="min-w-0">
            <span className="dash-label"><span /> Dashboard overview</span>
            <h1 className="mt-4 text-[32px] font-black leading-[1.08] tracking-[-.045em] text-[#132a44] sm:text-[40px]">Good to see you, <span className="text-[#a61940]">{firstName}</span></h1>
            <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#78899a] sm:text-sm"><CalendarDays size={15} className="text-[#123f7d]" /> {today}</p>
            <p className="mt-5 max-w-xl text-sm leading-6 text-[#687c90]">Manage your wallet, purchase essential services, and monitor every transaction from one secure workspace.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/dashboard/wallet" className="dash-btn-primary"><Plus size={16} /> Fund wallet</Link>
              <Link href="/dashboard/transactions" className="dash-btn-secondary"><History size={16} /> Transaction history</Link>
            </div>
          </div>

          <div className="dash-wallet-card">
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-white/55">Available balance</p><p className="mt-4 text-[38px] font-black tracking-[-.055em] text-white">{loading ? "—" : money(balanceMinor)}</p></div>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-white"><WalletCards size={20} /></span>
            </div>
            <div className="relative z-10 mt-8 flex items-center justify-between border-t border-white/10 pt-4">
              <span className="flex items-center gap-2 text-[10px] font-bold text-white/50"><ShieldCheck size={13} /> Secure ledger</span>
              <Link href="/dashboard/wallet" className="flex items-center gap-1 text-[10px] font-extrabold text-white">Manage <ChevronRight size={13} /></Link>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ReceiptText} label="Total transactions" value={String(transactions.length)} detail="All recorded activity" loading={loading} />
        <Metric icon={BadgeCheck} label="Successful purchases" value={String(successful.length)} detail="Provider-confirmed services" loading={loading} />
        <Metric icon={Clock3} label="Pending transactions" value={String(pending.length)} detail="Awaiting final provider status" loading={loading} />
        <Metric icon={CircleDollarSign} label="Total spent" value={money(spentMinor)} detail="Completed purchases only" loading={loading} />
      </section>

      <section className="dash-surface">
        <div className="dash-section-heading"><div><p className="dash-eyebrow">Spending insight</p><h2>Service activity</h2><p>Built only from your recorded transactions.</p></div><span className="ui-badge ui-badge-success">Live ledger</span></div>
        {activityByService.length ? <div className="dash-chart">{activityByService.map(([label, value]) => { const max = Math.max(...activityByService.map(([, total]) => total), 1); return <div key={label}><div><b className="capitalize">{label}</b><span>{money(value)}</span></div><span><i style={{ width: `${Math.max(6, (value / max) * 100)}%` }} /></span></div>; })}</div> : <div className="dash-chart-empty"><BarChart3 size={23} /><div><b>Your chart is ready</b><p>It will populate as real purchases are completed.</p></div></div>}
      </section>

      <section className="dash-surface">
        <div className="dash-section-heading">
          <div><p className="dash-eyebrow">Services</p><h2>Quick actions</h2><p>Choose a service to get started.</p></div>
          <Link href="/dashboard/services" className="dash-text-link">Explore all services <ArrowRight size={14} /></Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {services.map(({ name, copy, href, icon: Icon, tone }) => (
            <Link key={name} href={href} className="dash-service-card group">
              <div className={`dash-service-icon ${tone === "rose" ? "dash-service-icon-rose" : "dash-service-icon-blue"}`}><Icon size={20} /></div>
              <h3>{name}</h3>
              <p>{copy}</p>
              <span>Continue <ArrowRight size={13} /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.55fr)]">
        <div className="dash-surface overflow-hidden p-0">
          <div className="dash-activity-header">
            <div><p className="dash-eyebrow">Account activity</p><h2>Recent transactions</h2></div>
            <Link href="/dashboard/transactions" className="dash-small-button">View all</Link>
          </div>
          {loading ? (
            <div className="space-y-3 p-5 sm:p-7">{[1, 2, 3].map(item => <div key={item} className="h-16 animate-pulse rounded-xl bg-[#f2f5f8]" />)}</div>
          ) : transactions.length ? (
            <div className="divide-y divide-[#edf1f5] px-5 sm:px-7">
              {transactions.slice(0, 5).map(item => (
                <div key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-4">
                  <span className="dash-icon-blue"><CreditCard size={17} /></span>
                  <div className="min-w-0"><p className="truncate text-sm font-extrabold capitalize text-[#20364d]">{item.serviceType?.replaceAll("_", " ") || "Wallet transaction"}</p><p className="mt-1 truncate text-[10px] font-semibold text-[#95a2af]">{item.reference || item.id} · {transactionDate(item.createdAt)}</p></div>
                  <div className="text-right"><p className="text-xs font-extrabold text-[#20364d]">{money(item.retailPriceMinor ?? item.amountMinor)}</p><div className="mt-1.5"><StatusBadge status={item.status} /></div></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#edf3fa] text-[#123f7d]"><ReceiptText size={23} /></span>
              <h3 className="mt-4 text-sm font-extrabold text-[#20364d]">No transactions yet</h3>
              <p className="mt-2 max-w-sm text-xs leading-5 text-[#8494a4]">Wallet deposits and provider-confirmed purchases will appear here automatically.</p>
              <Link href="/dashboard/wallet" className="dash-text-link mt-5">Fund your wallet <ArrowRight size={13} /></Link>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <Link href="/dashboard/sms" className="dash-verification-card group">
            <div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-white"><MessageSquareText size={20} /></span><ArrowRight size={18} className="text-white/55 transition group-hover:translate-x-1 group-hover:text-white" /></div>
            <p className="mt-8 text-[9px] font-extrabold uppercase tracking-[.2em] text-[#ffb6c8]">SMS verification</p>
            <h2 className="mt-2 text-xl font-black leading-tight tracking-[-.035em] text-white">Get a number and receive your code.</h2>
            <p className="mt-3 text-xs leading-5 text-white/55">Real provider availability and live rental status.</p>
          </Link>

          <div className="dash-surface p-5">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf3fa] text-[#123f7d]"><ShieldCheck size={18} /></span><div><p className="text-sm font-extrabold text-[#20364d]">Account protected</p><p className="mt-0.5 text-[10px] font-semibold text-[#92a0ae]">Firebase authentication active</p></div></div>
          </div>

          <Link href="/dashboard/support" className="dash-support-card"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#fff0f4] text-[#a61940]"><Headphones size={19} /></span><div className="min-w-0 flex-1"><p className="text-sm font-extrabold text-[#20364d]">Need help?</p><p className="mt-1 truncate text-[10px] font-semibold text-[#92a0ae]">Visit the support centre</p></div><ChevronRight size={17} className="text-[#9ba8b5]" /></Link>
        </div>
      </section>
    </div>
  );
}
