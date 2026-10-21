"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bolt,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Headphones,
  History,
  MessageSquareText,
  PhoneCall,
  Plus,
  ReceiptText,
  RefreshCw,
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
  { name: "SMS verification", copy: "Rent a number", href: "/dashboard/sms", icon: MessageSquareText, accent: "#123f7d", tint: "#edf4fb" },
  { name: "Buy airtime", copy: "Instant recharge", href: "/dashboard/airtime", icon: PhoneCall, accent: "#a61940", tint: "#fff0f4" },
  { name: "Buy data", copy: "Browse bundles", href: "/dashboard/data", icon: Wifi, accent: "#087e8b", tint: "#eaf9fa" },
  { name: "Electricity", copy: "Pay your meter", href: "/dashboard/electricity", icon: Bolt, accent: "#d57a00", tint: "#fff7e7" },
];

const money = (minor = 0) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(minor / 100);

function transactionDate(value: Transaction["createdAt"]) {
  const date = typeof value === "string" ? new Date(value) : value?.seconds ? new Date(value.seconds * 1000) : null;
  return date && !Number.isNaN(date.valueOf())
    ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" }).format(date)
    : "Recently";
}

function StatusBadge({ status = "pending" }: { status?: string }) {
  const normal = status.toLowerCase();
  const style = normal === "successful" ? "bg-emerald-50 text-emerald-700" : normal === "failed" ? "bg-rose-50 text-rose-700" : normal === "refunded" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black capitalize ${style}`}>{normal.replaceAll("_", " ")}</span>;
}

function MetricCard({ icon: Icon, label, value, note, loading }: { icon: typeof CreditCard; label: string; value: string; note: string; loading: boolean }) {
  return (
    <article className="dashboard-metric group">
      <div className="flex items-start justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#edf4fb] text-[#123f7d]"><Icon size={20} /></span>
        <ArrowUpRight size={17} className="text-[#a7b4c2] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#a61940]" />
      </div>
      <p className="mt-6 text-xs font-bold text-[#728296]">{label}</p>
      {loading ? <div className="mt-2 h-8 w-24 animate-pulse rounded-lg bg-[#edf1f5]" /> : <p className="mt-1 text-3xl font-black tracking-[-.04em] text-[#10263f]">{value}</p>}
      <p className="mt-2 text-[10px] font-semibold text-[#9aa7b5]">{note}</p>
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
  const spentMinor = useMemo(() => successful.reduce((sum, item) => sum + (item.retailPriceMinor ?? item.amountMinor ?? 0), 0), [successful]);

  return (
    <div className="dashboard-home space-y-6">
      <section className="dashboard-welcome relative overflow-hidden rounded-[30px] text-white">
        <div className="dashboard-orb dashboard-orb-one" />
        <div className="dashboard-orb dashboard-orb-two" />
        <div className="relative z-10 grid gap-8 px-5 py-7 sm:px-8 sm:py-9 lg:grid-cols-[1.35fr_.65fr] lg:items-center lg:px-10">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.17em] text-white/75 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ffb5c7]" /> Customer dashboard
            </span>
            <h1 className="mt-5 max-w-2xl text-3xl font-black tracking-[-.045em] sm:text-4xl lg:text-[44px] lg:leading-[1.08]">
              Welcome back, <span className="text-[#ffb5c7]">{firstName}</span>
            </h1>
            <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-white/55 sm:text-sm"><CalendarDays size={16} /> {today}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/dashboard/wallet" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-[#123f7d] shadow-lg transition hover:-translate-y-0.5"><Plus size={16} /> Fund wallet</Link>
              <Link href="/dashboard/transactions" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-xs font-black text-white backdrop-blur transition hover:bg-white/15"><History size={16} /> View transactions</Link>
            </div>
          </div>
          <div className="dashboard-balance-card">
            <div className="flex items-start justify-between">
              <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-white/55">Available balance</p><p className="mt-3 text-4xl font-black tracking-[-.05em] sm:text-[42px]">{loading ? "—" : money(balanceMinor)}</p></div>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-[#ffb5c7]"><WalletCards size={21} /></span>
            </div>
            <div className="mt-7 flex items-center justify-between border-t border-white/10 pt-4 text-[10px] font-bold text-white/45"><span className="flex items-center gap-1.5"><ShieldCheck size={13} /> Secure wallet ledger</span><Link href="/dashboard/wallet" className="text-white/80">Manage <ChevronRight className="inline" size={13} /></Link></div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={ReceiptText} label="Total transactions" value={String(transactions.length)} note="All wallet activity" loading={loading} />
        <MetricCard icon={BadgeCheck} label="Successful services" value={String(successful.length)} note="Provider-confirmed only" loading={loading} />
        <MetricCard icon={CircleDollarSign} label="Total spent" value={money(spentMinor)} note="Across completed orders" loading={loading} />
      </section>

      <section className="dashboard-panel p-5 sm:p-7">
        <div className="flex items-end justify-between gap-4">
          <div><p className="dashboard-kicker">Quick services</p><h2 className="mt-2 text-2xl font-black tracking-[-.035em] text-[#10263f]">What would you like to do?</h2></div>
          <Link href="/dashboard/services" className="hidden items-center gap-1 text-xs font-black text-[#123f7d] sm:flex">View all <ArrowRight size={14} /></Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {services.map(({ name, copy, href, icon: Icon, accent, tint }) => (
            <Link key={name} href={href} className="dashboard-service group">
              <span className="grid h-12 w-12 place-items-center rounded-2xl transition group-hover:scale-105" style={{ backgroundColor: tint, color: accent }}><Icon size={21} /></span>
              <h3 className="mt-5 text-sm font-black text-[#152b43]">{name}</h3>
              <p className="mt-1 text-[11px] font-semibold text-[#8a98a7]">{copy}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-[11px] font-black" style={{ color: accent }}>Continue <ArrowRight size={13} className="transition group-hover:translate-x-1" /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <div className="dashboard-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#e8edf3] px-5 py-5 sm:px-7">
            <div><p className="dashboard-kicker">Activity</p><h2 className="mt-1.5 text-xl font-black tracking-[-.03em] text-[#10263f]">Recent transactions</h2></div>
            <Link href="/dashboard/transactions" className="rounded-xl border border-[#dfe7ef] px-3 py-2 text-[11px] font-black text-[#123f7d] transition hover:border-[#b8cce0] hover:bg-[#f4f8fc]">View history</Link>
          </div>
          {loading ? (
            <div className="space-y-3 p-5 sm:p-7">{[1, 2, 3].map(item => <div key={item} className="h-16 animate-pulse rounded-2xl bg-[#f3f6f9]" />)}</div>
          ) : transactions.length ? (
            <div className="divide-y divide-[#edf1f5] px-5 sm:px-7">
              {transactions.slice(0, 5).map(item => (
                <div key={item.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-4">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf4fb] text-[#123f7d]"><CreditCard size={17} /></span>
                  <div className="min-w-0"><p className="truncate text-sm font-black capitalize text-[#183049]">{item.serviceType?.replaceAll("_", " ") || "Wallet transaction"}</p><p className="mt-1 truncate text-[10px] font-semibold text-[#93a0ad]">{item.reference || item.id} · {transactionDate(item.createdAt)}</p></div>
                  <div className="text-right"><p className="text-xs font-black text-[#183049]">{money(item.retailPriceMinor ?? item.amountMinor)}</p><div className="mt-1"><StatusBadge status={item.status} /></div></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#edf4fb] text-[#123f7d]"><ReceiptText size={23} /></span>
              <h3 className="mt-4 text-sm font-black text-[#183049]">No transactions yet</h3>
              <p className="mt-2 max-w-xs text-xs leading-5 text-[#8493a3]">Your wallet funding and provider-confirmed purchases will appear here.</p>
              <Link href="/dashboard/wallet" className="mt-5 inline-flex items-center gap-1 text-xs font-black text-[#a61940]">Fund your wallet <ArrowRight size={13} /></Link>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <Link href="/dashboard/sms" className="dashboard-verification group block overflow-hidden rounded-[24px] p-6 text-white">
            <div className="flex items-start justify-between"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-[#ffb5c7]"><MessageSquareText size={21} /></span><ArrowUpRight className="text-white/45 transition group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-white" size={20} /></div>
            <p className="mt-8 text-[10px] font-black uppercase tracking-[.18em] text-[#ffb5c7]">Verification centre</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-.035em]">Receive real OTP messages securely.</h2>
            <p className="mt-3 text-xs leading-5 text-white/55">Choose an approved country and service, then monitor your rental status live.</p>
            <div className="mt-6 flex items-center gap-2 text-xs font-black">Start verification <ArrowRight size={14} /></div>
          </Link>

          <div className="dashboard-panel p-5 sm:p-6">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck size={19} /></span><div><h3 className="text-sm font-black text-[#183049]">Account protection</h3><p className="mt-0.5 text-[10px] font-semibold text-[#91a0ae]">Security checks are active</p></div></div>
            <div className="mt-5 space-y-3 border-t border-[#edf1f5] pt-4 text-xs font-bold text-[#5f7183]"><p className="flex items-center justify-between"><span className="flex items-center gap-2"><BadgeCheck size={14} className="text-emerald-600" /> Firebase authentication</span><span className="text-emerald-700">Protected</span></p><p className="flex items-center justify-between"><span className="flex items-center gap-2"><RefreshCw size={14} className="text-[#123f7d]" /> Provider status</span><span>Live checks</span></p></div>
          </div>

          <Link href="/dashboard/support" className="flex items-center gap-4 rounded-[20px] border border-[#e0e7ef] bg-white p-4 shadow-[0_12px_35px_rgba(19,46,76,.05)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(19,46,76,.09)]"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fff0f4] text-[#a61940]"><Headphones size={19} /></span><div className="flex-1"><p className="text-sm font-black text-[#183049]">Need help?</p><p className="mt-1 text-[10px] font-semibold text-[#91a0ae]">Visit the support centre</p></div><ChevronRight size={17} className="text-[#9ba8b5]" /></Link>
        </div>
      </section>
    </div>
  );
}
