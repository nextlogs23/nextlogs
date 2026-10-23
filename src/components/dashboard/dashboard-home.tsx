"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BadgeCheck, BarChart3, Bolt, CalendarDays, ChevronRight, CircleDollarSign, Clock3, CreditCard, MessageSquareText, PhoneCall, Plus, ReceiptText, ShieldCheck, WalletCards, Wifi } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { api } from "@/lib/api-client";

type Transaction = { id: string; reference?: string; serviceType?: string; amountMinor?: number; retailPriceMinor?: number; status?: string; createdAt?: string | { seconds?: number } };
const money = (minor = 0) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(minor / 100);
const services = [
  { name: "SMS verification", copy: "Receive real provider messages", href: "/dashboard/sms", icon: MessageSquareText, color: "sky" },
  { name: "Buy airtime", copy: "Recharge supported networks", href: "/dashboard/airtime", icon: PhoneCall, color: "blue" },
  { name: "Buy data", copy: "Browse live data bundles", href: "/dashboard/data", icon: Wifi, color: "cyan" },
  { name: "Electricity bills", copy: "Validate and pay your meter", href: "/dashboard/electricity", icon: Bolt, color: "amber" },
] as const;

function dateText(value: Transaction["createdAt"]) {
  const date = typeof value === "string" ? new Date(value) : value?.seconds ? new Date(value.seconds * 1000) : null;
  return date && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" }).format(date) : "Recently";
}

function Status({ value = "pending" }: { value?: string }) {
  const status = value.toLowerCase();
  const tone = status === "successful" ? "success" : status === "failed" ? "danger" : status === "refunded" ? "info" : "pending";
  return <span className={`dash2-status ${tone}`}>{status.replaceAll("_", " ")}</span>;
}

function Stat({ icon: Icon, label, value, caption, loading }: { icon: typeof CreditCard; label: string; value: string; caption: string; loading: boolean }) {
  return <article className="dash2-stat"><div className="dash2-stat-top"><span><Icon size={17} /></span><small>Account</small></div>{loading ? <div className="dash2-skeleton mt-5 h-8 w-24" /> : <strong>{value}</strong>}<h3>{label}</h3><p>{caption}</p></article>;
}

export function DashboardHome() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("there");
  const [today, setToday] = useState("Today");

  useEffect(() => {
    let active = true;
    setName(auth.currentUser?.displayName?.trim().split(/\s+/)[0] || "there");
    setToday(new Intl.DateTimeFormat("en-NG", { weekday: "long", day: "numeric", month: "long" }).format(new Date()));
    Promise.allSettled([api<{ balanceMinor: number }>("/api/wallet"), api<{ transactions: Transaction[] }>("/api/transactions")]).then(([wallet, activity]) => {
      if (!active) return;
      if (wallet.status === "fulfilled") setBalance(wallet.value.balanceMinor);
      if (activity.status === "fulfilled") setTransactions(activity.value.transactions);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const successful = useMemo(() => transactions.filter(item => item.status?.toLowerCase() === "successful"), [transactions]);
  const pending = useMemo(() => transactions.filter(item => ["pending", "processing"].includes(item.status?.toLowerCase() || "")), [transactions]);
  const spent = useMemo(() => successful.reduce((sum, item) => sum + (item.retailPriceMinor ?? item.amountMinor ?? 0), 0), [successful]);
  const activity = useMemo(() => {
    const totals = new Map<string, number>();
    transactions.forEach(item => { const key = item.serviceType?.replaceAll("_", " ") || "Wallet"; totals.set(key, (totals.get(key) || 0) + (item.retailPriceMinor ?? item.amountMinor ?? 0)); });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [transactions]);

  return <div className="dash2-page">
    <header className="dash2-greeting"><div><p className="ui-eyebrow">Account overview</p><h1>Good morning, {name}</h1><p>Here&apos;s what&apos;s happening with your account today.</p></div><div className="dash2-date"><CalendarDays size={15} /> {today}</div></header>

    <section className="dash2-summary">
      <article className="dash2-wallet"><div className="dash2-wallet-top"><span><WalletCards size={19} /></span><small>Primary wallet</small></div><p>Available balance</p><h2>{loading ? "—" : money(balance)}</h2><div className="dash2-wallet-bottom"><span><ShieldCheck size={13} /> Secure wallet ledger</span><Link href="/dashboard/wallet"><Plus size={14} /> Fund wallet</Link></div></article>
      <div className="dash2-stat-grid"><Stat icon={ReceiptText} label="Transactions" value={String(transactions.length)} caption="All account activity" loading={loading} /><Stat icon={BadgeCheck} label="Successful" value={String(successful.length)} caption="Provider-confirmed" loading={loading} /><Stat icon={Clock3} label="Pending" value={String(pending.length)} caption="Awaiting confirmation" loading={loading} /><Stat icon={CircleDollarSign} label="Total spending" value={money(spent)} caption="Successful purchases" loading={loading} /></div>
    </section>

    <section className="dash2-panel"><div className="dash2-panel-head"><div><p className="ui-eyebrow">Quick services</p><h2>What would you like to do?</h2></div><Link href="/dashboard/services">View all services <ArrowRight size={14} /></Link></div><div className="dash2-services">{services.map(({ name: title, copy, href, icon: Icon, color }) => <Link href={href} key={title} className="dash2-service"><span className={color}><Icon size={19} /></span><div><h3>{title}</h3><p>{copy}</p></div><ChevronRight size={17} /></Link>)}</div></section>

    <section className="dash2-lower">
      <article className="dash2-panel dash2-analytics"><div className="dash2-panel-head"><div><p className="ui-eyebrow">Spending overview</p><h2>Service activity</h2></div><span className="dash2-live"><i /> Live ledger</span></div>{activity.length ? <div className="dash2-bars">{activity.map(([label, amount]) => { const max = Math.max(...activity.map(([, value]) => value), 1); return <div key={label}><div><b>{label}</b><span>{money(amount)}</span></div><em><i style={{ width: `${Math.max(7, (amount / max) * 100)}%` }} /></em></div>; })}</div> : <div className="dash2-empty compact"><span><BarChart3 size={21} /></span><div><h3>No spending activity yet</h3><p>Your real service activity will appear here.</p></div></div>}</article>
      <article className="dash2-panel dash2-recent"><div className="dash2-panel-head"><div><p className="ui-eyebrow">Recent activity</p><h2>Latest transactions</h2></div><Link href="/dashboard/transactions">View all <ArrowRight size={14} /></Link></div>{loading ? <div className="p-5"><div className="dash2-skeleton h-16" /><div className="dash2-skeleton mt-3 h-16" /></div> : transactions.length ? <div className="dash2-list">{transactions.slice(0, 4).map(item => <div key={item.id}><span className="dash2-transaction-icon"><CreditCard size={16} /></span><div><h3>{item.serviceType?.replaceAll("_", " ") || "Wallet transaction"}</h3><p>{dateText(item.createdAt)} · {item.reference || item.id}</p></div><div><strong>{money(item.retailPriceMinor ?? item.amountMinor)}</strong><Status value={item.status} /></div></div>)}</div> : <div className="dash2-empty"><span><ReceiptText size={21} /></span><h3>No transactions yet</h3><p>Deposits and completed service purchases will appear here.</p><Link href="/dashboard/wallet">Fund your wallet <ArrowRight size={13} /></Link></div>}</article>
    </section>
  </div>;
}
