"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, BellRing, BookOpen, Check, FileText, Mail, Megaphone, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { api } from "@/lib/api-client";

type EmailTemplate = {
  id: string;
  title: string;
  description: string;
  status: "available" | "coming_soon";
  icon: typeof Mail;
  accent: string;
};

const templates: EmailTemplate[] = [
  { id: "welcome", title: "Welcome email", description: "A polished onboarding message for customers who have opted in.", status: "available", icon: Sparkles, accent: "blue" },
  { id: "order", title: "Order update", description: "Clear payment, delivery, and marketplace order notifications.", status: "available", icon: FileText, accent: "emerald" },
  { id: "newsletter", title: "Newsletter", description: "A structured campaign layout for permission-based subscribers.", status: "available", icon: Megaphone, accent: "amber" },
  { id: "security", title: "Security alert", description: "Account activity and safety notifications with strong hierarchy.", status: "coming_soon", icon: BellRing, accent: "rose" },
];

const money = (minor = 0) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(minor / 100);

export function EmailFlashingWorkspace() {
  const [balance, setBalance] = useState(0);
  const [selected, setSelected] = useState<EmailTemplate>(templates[0]);
  const [guideOpen, setGuideOpen] = useState(false);
  const templatesRef = useRef<HTMLDivElement>(null);

  useEffect(() => { api<{ balanceMinor: number }>("/api/wallet").then((data) => setBalance(data.balanceMinor)).catch(() => {}); }, []);

  return <div className="email-flash-page">
    <section className="email-flash-notice"><ShieldCheck size={17} /><p><b>Verified senders only.</b> This workspace is for lawful, permission-based email design and previews. Sender impersonation and forged headers are not supported.</p></section>

    <section className="email-flash-hero">
      <div><p className="ui-eyebrow">Email workspace</p><h1>Email Flashing</h1><p>Create refined transactional and campaign email drafts using the same clean workflow as the rest of NextLogs.</p><div className="email-flash-hero-actions"><button type="button" onClick={() => templatesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>Browse templates <ArrowRight size={14} /></button><button type="button" onClick={() => setGuideOpen((value) => !value)}><BookOpen size={14} /> Quick guide</button></div></div>
      <aside><span><WalletCards size={17} /></span><small>Wallet balance</small><strong>{money(balance)}</strong></aside>
    </section>

    {guideOpen && <section className="email-flash-guide"><span><BadgeCheck size={18} /></span><div><b>How this workspace will operate</b><p>Choose a template, prepare a draft, and preview the layout. Real delivery will require a verified domain, recipient consent, unsubscribe handling, and a configured email provider.</p></div></section>}

    <div ref={templatesRef} className="email-flash-section-head"><div><p className="ui-eyebrow">Template library</p><h2>Choose an email experience</h2><p>Select an available layout to preview its structure.</p></div><span>{templates.filter((item) => item.status === "available").length} available</span></div>

    <section className="email-flash-grid">{templates.map((template) => {
      const Icon = template.icon; const available = template.status === "available"; const active = selected.id === template.id;
      return <button type="button" key={template.id} disabled={!available} onClick={() => setSelected(template)} className={`${active ? "is-selected" : ""} ${!available ? "is-disabled" : ""}`}><span className={`tone-${template.accent}`}><Icon size={21} /></span><div><h3>{template.title}</h3><p>{template.description}</p><small>{available ? <><i /> Available</> : "Coming soon"}</small></div>{active && <em><Check size={13} /></em>}</button>;
    })}</section>

    <section className="email-flash-preview">
      <header><div><p className="ui-eyebrow">Selected template</p><h2>{selected.title}</h2><p>{selected.description}</p></div><span><ShieldCheck size={14} /> Preview mode</span></header>
      <div className="email-preview-canvas"><div className="email-preview-top"><span><Mail size={18} /></span><div><b>NextLogs</b><small>Verified sender preview</small></div></div><div className="email-preview-body"><small>EMAIL PREVIEW</small><h3>{selected.id === "welcome" ? "Welcome to a simpler digital experience" : selected.id === "order" ? "Your order update is ready" : "Fresh updates from NextLogs"}</h3><p>This is a safe layout preview. Content, recipients, and verified sender details will be configured only when a compliant delivery provider is added.</p><span>Primary call to action</span></div></div>
      <footer><div><ShieldCheck size={16} /><p><b>Delivery is not enabled</b><span>No email is sent from this preview workspace.</span></p></div><button type="button" disabled>Continue to draft <ArrowRight size={14} /></button></footer>
    </section>
  </div>;
}
