"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BadgeCheck, Banknote, CircleAlert, CloudCog, CreditCard, Gauge, Inbox, Search, Settings2, ShieldAlert, SlidersHorizontal, Users, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";

type Summary = { totalUsers: number; totalWalletBalancesMinor: number; purchases: number; costs: number; successful: number; failed: number; revenueMinor: number; grossProfitMinor: number };
const emptySummary: Summary = { totalUsers: 0, totalWalletBalancesMinor: 0, purchases: 0, costs: 0, successful: 0, failed: 0, revenueMinor: 0, grossProfitMinor: 0 };
const money = (minor = 0) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(minor / 100);

function Header({ title, copy, actionHref = "/admin/providers", actionLabel = "Provider status" }: { title: string; copy: string; actionHref?: string; actionLabel?: string }) {
  return <header className="admin3-heading"><div><div className="admin3-kicker"><i /> Operations console</div><h1>{title}</h1><p>{copy}</p></div><div className="admin3-heading-actions"><button onClick={() => toast.info("Advanced filters become available when records are present.")} className="admin3-button secondary"><SlidersHorizontal size={15} /> Filters</button><Link href={actionHref} className="admin3-button primary">{actionLabel}<ArrowRight size={15} /></Link></div></header>;
}

function Metric({ label, value, icon: Icon, loading, tone = "blue", note = "Live total" }: { label: string; value: string; icon: typeof Users; loading?: boolean; tone?: string; note?: string }) {
  return <article className={`admin3-metric ${tone}`}><div className="admin3-metric-top"><span><Icon size={18} /></span><small>{note}</small></div>{loading ? <div className="admin3-skeleton" /> : <strong>{value}</strong>}<h3>{label}</h3><p>Calculated from confirmed platform records.</p></article>;
}

function AdminInsights({ summary }: { summary: Summary }) {
  const total = summary.successful + summary.failed;
  const successRate = total ? Math.round((summary.successful / total) * 100) : 0;
  const max = Math.max(summary.revenueMinor, summary.costs, summary.grossProfitMinor, 1);
  const finance = [
    ["Retail revenue", summary.revenueMinor, "revenue"],
    ["Provider costs", summary.costs, "cost"],
    ["Gross profit", summary.grossProfitMinor, "profit"],
  ] as const;
  return <div className="admin3-insights">
    <section className="admin3-card admin3-finance-card"><div className="admin3-card-head"><div><span>Financial performance</span><h2>Revenue and margin</h2><p>Based only on completed platform records.</p></div><span className="admin3-live"><i /> Live ledger</span></div><div className="admin3-finance-total"><p>Gross transaction value</p><strong>{money(summary.purchases)}</strong></div><div className="admin3-finance-bars">{finance.map(([label, value, tone]) => <div key={label}><div><span>{label}</span><b>{money(value)}</b></div><em><i className={tone} style={{ width: `${Math.max(value ? 5 : 0, (value / max) * 100)}%` }} /></em></div>)}</div></section>
    <section className="admin3-card"><div className="admin3-card-head compact"><div><span>Transaction health</span><h2>Provider outcomes</h2></div><span className="admin3-period">All time</span></div><div className="admin3-outcomes"><div className="admin3-donut" style={{ background: `conic-gradient(#1d9b68 0 ${successRate}%, #dbe4ec ${successRate}% 100%)` }}><span><b>{successRate}%</b><small>success rate</small></span></div><div className="admin3-legend"><p><i className="success" /><span>Successful</span><b>{summary.successful}</b></p><p><i className="failed" /><span>Failed</span><b>{summary.failed}</b></p><p><i className="pending" /><span>Other activity</span><b>{Math.max(0, total - summary.successful - summary.failed)}</b></p></div></div></section>
  </div>;
}

function EmptyTable({ label, description = "Real provider and Firestore records will appear here. This console never generates sample transactions." }: { label: string; description?: string }) {
  return <section className="admin3-card admin3-table-card"><div className="admin3-table-toolbar"><div><span>Records</span><h2>{label}</h2></div><label><Search size={15} /><input placeholder="Search reference, user or service" /></label></div><div className="admin3-table-scroll"><table><thead><tr><th>Reference</th><th>User</th><th>Service</th><th>Value</th><th>Status</th><th>Provider reference</th></tr></thead></table></div><div className="admin3-empty"><span><Inbox size={22} /></span><h3>No records available</h3><p>{description}</p></div></section>;
}

function ProviderReadiness() {
  return <section className="admin3-card admin3-providers"><div className="admin3-card-head compact"><div><span>Infrastructure</span><h2>Provider readiness</h2></div><Link href="/admin/providers">Manage <ArrowRight size={13} /></Link></div><div className="admin3-provider-list">{[["SMS verification", "Number provider"], ["VTU services", "Airtime, data and bills"], ["Paystack", "Wallet funding"]].map(([name, type]) => <div key={name}><span><CloudCog size={17} /></span><p><b>{name}</b><small>{type}</small></p><em>Check required</em></div>)}</div><p className="admin3-provider-note"><ShieldAlert size={14} /> Secrets remain in protected server environment variables.</p></section>;
}

const orderTitles: Record<string, string> = { "sms-orders": "SMS orders", "airtime-orders": "Airtime orders", "data-orders": "Data orders", "electricity-orders": "Electricity transactions", "wallet-transactions": "Wallet transactions" };

export function AdminWorkspace({ section = "" }: { section?: string }) {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<Summary>("/api/admin/summary").then(setSummary).catch(error => toast.error(error instanceof Error ? error.message : "Unable to load admin summary")).finally(() => setLoading(false)); }, []);

  if (orderTitles[section]) return <div className="admin3-page"><Header title={orderTitles[section]} copy="Review provider status, costs, margins and references from a single operational view." /><EmptyTable label={orderTitles[section]} /></div>;
  if (section === "users") return <div className="admin3-page"><Header title="User management" copy="Review profiles, wallet position and account risk without exposing private credentials." actionHref="/admin/settings" actionLabel="Account controls" /><div className="admin3-kpi-grid three"><Metric icon={Users} value={String(summary.totalUsers)} label="Registered users" loading={loading} /><Metric icon={ShieldAlert} value="0" label="Suspended accounts" loading={loading} tone="amber" /><Metric icon={CircleAlert} value="0" label="Flagged for review" loading={loading} tone="rose" /></div><EmptyTable label="User directory" description="User profiles and administrative review controls will appear here when returned by the protected admin API." /></div>;
  if (section === "providers") return <div className="admin3-page"><Header title="API providers" copy="Monitor connection readiness without returning secret values to the browser." actionHref="/admin/settings" actionLabel="Environment guide" /><div className="admin3-provider-grid">{[["SMS verification", "SMS provider"], ["VTU services", "VTU provider"], ["Paystack", "Payment gateway"]].map(([name, kind]) => <article key={name} className="admin3-provider-card"><div><span><CloudCog size={20} /></span><em>Check required</em></div><small>{kind}</small><h2>{name}</h2><p>Connectivity is verified through a protected server route. Secret values are never displayed.</p><button onClick={() => toast.info("Provider health checks require the configured server environment.")}>Test connection <ArrowRight size={14} /></button></article>)}</div><div className="admin3-security-note"><ShieldAlert size={19} /><div><b>Server-side secrets only</b><p>Provider credentials are read from protected environment variables and are never included in client bundles.</p></div></div></div>;
  if (section === "pricing") return <div className="admin3-page"><Header title="Pricing management" copy="Set retail prices, availability and expected margins with a clear audit trail." actionHref="/admin/analytics" actionLabel="View margins" /><section className="admin3-card admin3-form-card"><div className="admin3-form-grid"><label>Service<select><option>SMS verification</option><option>Data plan</option><option>Electricity fee</option></select></label><label>Provider cost<input placeholder="₦0.00" /></label><label>Retail price<input placeholder="₦0.00" /></label><label>Availability<select><option>Enabled</option><option>Disabled</option></select></label></div><div className="admin3-form-footer"><p><b>Expected margin</b><span>Calculated after valid provider and retail prices are entered.</span></p><button onClick={() => toast.info("Save pricing through the protected admin API after configuration.")}>Save pricing <ArrowRight size={14} /></button></div></section></div>;
  if (section === "analytics") return <div className="admin3-page"><Header title="Revenue analytics" copy="Track retail value, provider costs and estimated gross margin from real transactions." /><div className="admin3-kpi-grid three"><Metric icon={CreditCard} value={money(summary.purchases)} label="Gross service value" loading={loading} /><Metric icon={ArrowDownRight} value={money(summary.costs)} label="Provider costs" loading={loading} tone="amber" /><Metric icon={ArrowUpRight} value={money(summary.grossProfitMinor)} label="Estimated gross profit" loading={loading} tone="green" /></div><AdminInsights summary={summary} /></div>;
  if (section === "notifications" || section === "settings") return <div className="admin3-page"><Header title={section === "settings" ? "Platform settings" : "Notifications"} copy={section === "settings" ? "Manage service controls and operational guardrails." : "Create clear platform messages for selected audiences."} /><section className="admin3-card admin3-settings"><div className="admin3-settings-head"><span><Settings2 size={19} /></span><div><h2>{section === "settings" ? "General configuration" : "Compose notification"}</h2><p>Changes are applied only through protected administrative routes.</p></div></div><label>{section === "settings" ? "Support email" : "Title"}<input placeholder={section === "settings" ? "support@yourdomain.com" : "Message title"} /></label><label>{section === "settings" ? "Maintenance notice" : "Message"}<textarea placeholder="Enter details…" /></label><button onClick={() => toast.info("Save through the protected admin API after configuration.")}>Save changes <ArrowRight size={14} /></button></section></div>;

  return <div className="admin3-page"><Header title="Operations overview" copy="A live view of platform health, money movement and provider-confirmed delivery." /><div className="admin3-kpi-grid"><Metric icon={Users} value={String(summary.totalUsers)} label="Total users" loading={loading} /><Metric icon={WalletCards} value={money(summary.totalWalletBalancesMinor)} label="Wallet balances" loading={loading} tone="cyan" /><Metric icon={Banknote} value={money(summary.revenueMinor)} label="Total revenue" loading={loading} tone="green" /><Metric icon={BadgeCheck} value={String(summary.successful)} label="Successful transactions" loading={loading} tone="indigo" /></div><AdminInsights summary={summary} /><div className="admin3-lower"><ProviderReadiness /><EmptyTable label="Latest platform activity" /></div></div>;
}
