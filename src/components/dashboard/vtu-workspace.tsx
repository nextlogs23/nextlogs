"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, Check, History, LoaderCircle, PhoneCall, Printer, ReceiptText, ShieldCheck, Tv, Wifi, Zap } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";

type Kind = "airtime" | "data" | "electricity" | "cable";
type Plan = { id: string; name: string; validity?: string; priceMinor: number };
type Provider = { id: string; name: string };
type Result = { reference: string; status: string; token?: string; units?: string; message?: string };
const networks = ["mtn", "airtel", "glo", "9mobile"];
const money = (minor = 0) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(minor / 100);

export function VtuWorkspace({ type }: { type: Kind }) {
  const [network, setNetwork] = useState("mtn"), [phone, setPhone] = useState(""), [amount, setAmount] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]), [plan, setPlan] = useState<Plan | null>(null), [providers, setProviders] = useState<Provider[]>([]), [provider, setProvider] = useState("");
  const [meterType, setMeterType] = useState("prepaid"), [meterNumber, setMeterNumber] = useState(""), [smartcardNumber, setSmartcardNumber] = useState("");
  const [customerName, setCustomerName] = useState(""), [validationId, setValidationId] = useState("");
  const [loading, setLoading] = useState(false), [confirm, setConfirm] = useState(false), [key, setKey] = useState(""), [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (type !== "data") return;
    setPlan(null); setPlans([]);
    api<{ plans: Plan[] }>(`/api/data/plans?network=${network}`).then((data) => setPlans(data.plans)).catch((error) => toast.error(error.message));
  }, [network, type]);

  useEffect(() => {
    if (type !== "electricity" && type !== "cable") return;
    const path = type === "electricity" ? "/api/vtu/electricity/providers" : "/api/vtu/cable/providers";
    api<{ providers: Provider[] }>(path).then((data) => { setProviders(data.providers); setProvider(data.providers[0]?.id || ""); }).catch((error) => toast.error(error.message));
  }, [type]);

  useEffect(() => {
    if (type !== "cable" || !provider) return;
    setPlan(null); setPlans([]); setCustomerName(""); setValidationId("");
    api<{ plans: Plan[] }>(`/api/vtu/cable/plans?provider=${encodeURIComponent(provider)}`).then((data) => setPlans(data.plans)).catch((error) => toast.error(error.message));
  }, [provider, type]);

  const title = type === "airtime" ? "Buy airtime" : type === "data" ? "Buy mobile data" : type === "electricity" ? "Pay electricity bill" : "Pay cable TV";
  const priceMinor = type === "data" || type === "cable" ? plan?.priceMinor || 0 : Math.round(Number(amount) * 100);
  const recipient = type === "electricity" ? meterNumber : type === "cable" ? smartcardNumber : phone;

  async function verifyMeter() {
    setLoading(true);
    try { const data = await api<{ customerName: string; validationId: string }>("/api/orders/electricity/validate", { method: "POST", body: JSON.stringify({ provider, meterType, meterNumber }) }); setCustomerName(data.customerName); setValidationId(data.validationId); toast.success("Meter details verified by VTUGATE."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Meter verification failed"); }
    finally { setLoading(false); }
  }

  async function verifyCable() {
    setLoading(true);
    try { const data = await api<{ customerName: string; validationId: string }>("/api/orders/cable/validate", { method: "POST", body: JSON.stringify({ provider, phone: phone.replace(/[\s-]/g, ""), smartcardNumber }) }); setCustomerName(data.customerName); setValidationId(data.validationId); toast.success("Smartcard verified by VTUGATE."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Smartcard verification failed"); }
    finally { setLoading(false); }
  }

  function review(event: FormEvent) {
    event.preventDefault();
    if ((type === "data" || type === "cable") && !plan) return toast.error("Select an available plan.");
    if ((type === "electricity" || type === "cable") && (!customerName || !validationId)) return toast.error(type === "electricity" ? "Verify the meter before payment." : "Verify the smartcard before payment.");
    setKey(crypto.randomUUID()); setConfirm(true);
  }

  async function purchase() {
    setLoading(true);
    try {
      const cleanPhone = phone.replace(/[\s-]/g, "");
      const payload = type === "electricity" ? { provider, meterType, meterNumber, validationId, phone: cleanPhone, amountMinor: priceMinor, idempotencyKey: key }
        : type === "cable" ? { provider, smartcardNumber, validationId, phone: cleanPhone, planId: plan?.id, idempotencyKey: key }
          : { network, phone: cleanPhone, ...(type === "data" ? { planId: plan?.id } : { amountMinor: priceMinor }), idempotencyKey: key };
      const data = await api<Result>(`/api/orders/${type}`, { method: "POST", body: JSON.stringify(payload) });
      setResult(data); setConfirm(false); toast.success(data.status === "processing" ? "Submitted; provider confirmation is pending." : `Transaction ${data.status}.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Purchase failed"); }
    finally { setLoading(false); }
  }

  async function refresh() {
    if (!result) return; setLoading(true);
    try { const data = await api<Result>(`/api/orders/vtu/${result.reference}`, { method: "POST" }); setResult(data); toast.success(`Provider status: ${data.status}`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to requery transaction"); }
    finally { setLoading(false); }
  }

  function downloadReceipt() {
    if (!result) return;
    const text = ["Nextlogs", `${title} receipt`, `Reference: ${result.reference}`, `Status: ${result.status}`, `Amount: ${money(priceMinor)}`, result.token ? `Electricity token: ${result.token}` : "", result.units ? `Units: ${result.units}` : ""].filter(Boolean).join("\n");
    const href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); const anchor = document.createElement("a"); anchor.href = href; anchor.download = `${result.reference}-receipt.txt`; anchor.click(); URL.revokeObjectURL(href);
  }

  const chooseProvider = (value: string) => { setProvider(value); setCustomerName(""); setValidationId(""); };
  return <>
    <header className="workspace-heading"><div><p className="ui-eyebrow">VTUGATE services</p><h1>{title}</h1><p>Live catalogues, secure wallet reservation and provider-confirmed status.</p></div><Link href="/dashboard/transactions" className="ui-button-secondary"><History size={15} /> View history</Link></header>
    <form onSubmit={review} className="purchase-layout"><section className="ui-card p-5 sm:p-7">
      {(type === "airtime" || type === "data") && <><div className="workspace-card-title"><span>01</span><div><h2>Choose network</h2><p>MTN, Airtel, Glo or 9mobile.</p></div></div><div className="network-grid">{networks.map((item) => <button type="button" key={item} onClick={() => setNetwork(item)} className={`network-card ${network === item ? "is-selected" : ""}`}><b className="uppercase">{item}</b>{network === item && <Check size={14} />}</button>)}</div><div className="workspace-divider" />
        {type === "data" ? <><div className="workspace-card-title"><span>02</span><div><h2>Choose a live bundle</h2><p>Plans and selling prices are retrieved from VTUGATE.</p></div></div><div className="plan-grid">{plans.map((item) => <button type="button" key={item.id} onClick={() => setPlan(item)} className={plan?.id === item.id ? "is-selected" : ""}><Wifi size={17} /><div><b>{item.name}</b><small>{money(item.priceMinor)}{item.validity ? ` · ${item.validity}` : ""}</small></div>{plan?.id === item.id && <Check size={14} />}</button>)}</div></> : <><div className="workspace-card-title"><span>02</span><div><h2>Recharge amount</h2><p>Single airtime purchases are limited to ₦5,000 for safe settlement.</p></div></div><label className="ui-label">Amount<div className="relative"><span className="input-prefix">₦</span><input required min="100" max="5000" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="ui-input pl-8" placeholder="0.00" /></div></label></>}
        <label className="ui-label mt-5">Nigerian phone number<input required value={phone} onChange={(event) => setPhone(event.target.value)} className="ui-input" inputMode="tel" placeholder="080 0000 0000" /></label></>}

      {type === "electricity" && <><div className="workspace-card-title"><span>01</span><div><h2>Verify meter details</h2><p>Distribution companies are loaded from VTUGATE.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><label className="ui-label">Distribution company<select value={provider} onChange={(event) => chooseProvider(event.target.value)} className="ui-input">{providers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="ui-label">Meter type<select value={meterType} onChange={(event) => { setMeterType(event.target.value); setCustomerName(""); setValidationId(""); }} className="ui-input"><option value="prepaid">Prepaid</option><option value="postpaid">Postpaid</option></select></label></div><div className="grid gap-4 sm:grid-cols-[1fr_auto] mt-5"><label className="ui-label">Meter number<input required value={meterNumber} onChange={(event) => { setMeterNumber(event.target.value); setCustomerName(""); setValidationId(""); }} className="ui-input" inputMode="numeric" /></label><button type="button" onClick={verifyMeter} disabled={loading || !provider || meterNumber.length < 5} className="ui-button-secondary self-end"><ShieldCheck size={15} /> Verify meter</button></div>{customerName && <div className="verified-customer"><BadgeCheck size={18} /><div><small>VTUGATE verified customer</small><b>{customerName}</b></div></div>}<div className="grid gap-4 sm:grid-cols-2 mt-5"><label className="ui-label">Contact phone<input required value={phone} onChange={(event) => setPhone(event.target.value)} className="ui-input" inputMode="tel" placeholder="080 0000 0000" /></label><label className="ui-label">Payment amount<div className="relative"><span className="input-prefix">₦</span><input required min="100" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="ui-input pl-8" placeholder="0.00" /></div></label></div></>}

      {type === "cable" && <><div className="workspace-card-title"><span>01</span><div><h2>Choose cable provider</h2><p>Available television services are loaded from VTUGATE.</p></div></div><label className="ui-label">Cable provider<select value={provider} onChange={(event) => chooseProvider(event.target.value)} className="ui-input">{providers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><div className="workspace-divider" /><div className="workspace-card-title"><span>02</span><div><h2>Verify smartcard</h2><p>Confirm the subscription account before payment.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><label className="ui-label">Smartcard number<input required value={smartcardNumber} onChange={(event) => { setSmartcardNumber(event.target.value); setCustomerName(""); setValidationId(""); }} className="ui-input" inputMode="numeric" /></label><label className="ui-label">Contact phone<input required value={phone} onChange={(event) => { setPhone(event.target.value); setCustomerName(""); setValidationId(""); }} className="ui-input" inputMode="tel" placeholder="080 0000 0000" /></label></div><button type="button" onClick={verifyCable} disabled={loading || !provider || smartcardNumber.length < 5 || phone.length < 10} className="ui-button-secondary mt-4"><ShieldCheck size={15} /> Verify smartcard</button>{customerName && <div className="verified-customer"><BadgeCheck size={18} /><div><small>VTUGATE verified customer</small><b>{customerName}</b></div></div>}<div className="workspace-divider" /><div className="workspace-card-title"><span>03</span><div><h2>Choose subscription</h2><p>The final price is rechecked on the server.</p></div></div><div className="plan-grid">{plans.map((item) => <button type="button" key={item.id} onClick={() => setPlan(item)} className={plan?.id === item.id ? "is-selected" : ""}><Tv size={17} /><div><b>{item.name}</b><small>{money(item.priceMinor)}</small></div>{plan?.id === item.id && <Check size={14} />}</button>)}</div></>}

      <button disabled={loading || priceMinor < 10000} className="ui-button-primary mt-7 w-full">Review purchase <ArrowRight size={15} /></button>
    </section><aside className="purchase-aside"><div className="purchase-aside-icon">{type === "airtime" ? <PhoneCall /> : type === "data" ? <Wifi /> : type === "electricity" ? <Zap /> : <Tv />}</div><p className="ui-eyebrow text-[#ffb6c8]">Order summary</p><h2>{title}</h2><div className="purchase-summary-lines"><p><span>Service</span><b className="capitalize">{type === "airtime" || type === "data" ? network : providers.find((item) => item.id === provider)?.name || "—"}</b></p><p><span>Recipient</span><b>{recipient || "—"}</b></p>{plan && <p><span>Plan</span><b>{plan.name}</b></p>}<p><span>Total</span><b>{priceMinor ? money(priceMinor) : "—"}</b></p></div><div className="purchase-safety"><ShieldCheck size={16} /><p>Price and wallet balance are verified again on the server.</p></div></aside></form>
    {confirm && <div className="modal-layer"><button className="modal-backdrop" onClick={() => setConfirm(false)} aria-label="Close" /><div className="modal-card"><p className="ui-eyebrow">Confirm purchase</p><h2 className="mt-2 text-xl font-black">{title}</h2><div className="modal-summary"><p><span>Recipient</span><b>{recipient}</b></p><p><span>Amount</span><b>{money(priceMinor)}</b></p></div><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => setConfirm(false)} className="ui-button-secondary">Go back</button><button type="button" onClick={purchase} disabled={loading} className="ui-button-primary">{loading ? <LoaderCircle className="animate-spin" size={16} /> : <ShieldCheck size={16} />} Pay securely</button></div></div></div>}
    {result && <section className="ui-card mt-5 p-5 sm:p-6"><div className="workspace-card-title"><span><ReceiptText size={16} /></span><div><h2>Provider transaction</h2><p>{result.reference}</p></div></div><div className="purchase-summary-lines"><p><span>Status</span><b className="capitalize">{result.status}</b></p>{result.token && <p><span>Electricity token</span><b>{result.token}</b></p>}{result.units && <p><span>Units</span><b>{result.units}</b></p>}</div><div className="mt-5 flex flex-wrap gap-3">{result.status === "processing" && <button type="button" onClick={refresh} disabled={loading} className="ui-button-primary"><LoaderCircle size={15} /> Requery VTUGATE</button>}<button type="button" onClick={() => window.print()} className="ui-button-secondary"><Printer size={15} /> Print receipt</button><button type="button" onClick={downloadReceipt} className="ui-button-secondary"><ReceiptText size={15} /> Download receipt</button></div></section>}
  </>;
}
