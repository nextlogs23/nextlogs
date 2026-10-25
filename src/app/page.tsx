import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Bolt, Check, ChevronRight, CreditCard, LockKeyhole, MessageSquareText, PhoneCall, ReceiptText, ShieldCheck, Smartphone, Store, WalletCards, Wifi } from "lucide-react";
import { Brand } from "@/components/brand";
import { MobileNav } from "@/components/mobile-nav";
import { MotionReveal } from "@/components/motion-reveal";
import { ThemeToggle } from "@/components/theme-toggle";

const services = [
  { title: "Digital marketplace", copy: "Preview approved digital products, creative assets, and live number services.", href: "/dashboard/marketplace", icon: Store },
  { title: "SMS verification", copy: "Provider-supported numbers with real inbound message status.", href: "/dashboard/sms", icon: MessageSquareText },
  { title: "Airtime recharge", copy: "Fast top-ups across supported Nigerian mobile networks.", href: "/dashboard/airtime", icon: PhoneCall },
  { title: "Mobile data", copy: "Browse live bundles and complete a simple, secure checkout.", href: "/dashboard/data", icon: Wifi },
  { title: "Electricity bills", copy: "Validate your meter details before making a payment.", href: "/dashboard/electricity", icon: Bolt },
  { title: "Wallet funding", copy: "Fund through Paystack and track every credit in your ledger.", href: "/dashboard/wallet", icon: WalletCards },
];
const faqs = [
  ["What can I use the wallet for?", "Use your balance for marketplace products, SMS verification, airtime, mobile data and supported electricity bill payments."],
  ["How does SMS verification work?", "Choose an available country and service, review the live price, then receive real provider messages inside your dashboard."],
  ["Are purchases confirmed instantly?", "The platform only marks a purchase successful after the configured provider confirms the outcome."],
  ["How are wallet deposits protected?", "Deposits are credited only after Paystack verifies the payment, using signed webhooks and idempotent wallet operations."],
];
const supportedBrands = [
  { name: "mtn", label: "MTN" },
  { name: "airtel", label: "Airtel" },
  { name: "glo", label: "Glo" },
  { name: "9mobile", label: "9mobile" },
  { name: "telegram", label: "Telegram" },
  { name: "instagram", label: "Instagram" },
  { name: "tiktok", label: "TikTok" },
  { name: "google", label: "Google" },
];

function ProductPreview() {
  return <div className="mk-preview"><div className="mk-preview-glow" /><div className="mk-phone"><div className="mk-phone-top"><span>9:41</span><i /></div><div className="mk-phone-brand"><Image src="/dmb-logins-logo.png" alt="" width={28} height={28} /><b>DMB Portal</b><span>•••</span></div><p className="mk-phone-welcome">Good morning, Ada</p><div className="mk-phone-wallet"><small>AVAILABLE BALANCE</small><strong>₦12,450.00</strong><div><span>Secure wallet</span><b>•••• 2210</b></div></div><div className="mk-phone-actions">{[[Smartphone,"Airtime"],[Wifi,"Data"],[MessageSquareText,"SMS"],[ReceiptText,"History"]].map(([Icon,label]) => <div key={String(label)}><span><Icon size={13} /></span><small>{String(label)}</small></div>)}</div><div className="mk-phone-heading"><b>Quick services</b><span>View all</span></div>{[["MTN Airtime","Instant recharge","/logos/mtn.png"],["Airtel Data","Live bundles","/logos/airtel.png"],["Glo Data","Live bundles","/logos/glo.png"]].map(([name,copy,logo]) => <div className="mk-phone-row" key={name}><Image src={logo} alt="" width={25} height={25} /><div><b>{name}</b><small>{copy}</small></div><ChevronRight size={12} /></div>)}</div><div className="mk-float one"><span><BadgeCheck size={15} /></span><div><b>Payment verified</b><small>Wallet credited securely</small></div></div><div className="mk-float two"><span><MessageSquareText size={15} /></span><div><b>SMS received</b><small>Live provider message</small></div></div></div>;
}

export default function Home() {
  return <main className="mk-site"><MotionReveal />
    <nav className="mk-nav"><div className="shell"><Brand /><div className="mk-nav-links desktop-only"><a href="#services">Services</a><a href="#how">How it works</a><a href="#security">Security</a><a href="#faq">FAQs</a></div><div className="mk-nav-actions"><ThemeToggle compact /><Link href="/login" className="mk-login desktop-only">Log in</Link><Link href="/register" className="mk-primary mk-nav-cta">Create account <ArrowRight size={14} /></Link><MobileNav /></div></div></nav>

    <section className="mk-hero"><div className="shell mk-hero-grid"><div className="mk-hero-copy"><span className="mk-kicker"><i /> Digital services, one secure wallet</span><h1>Everyday payments.<br /><em>Handled beautifully.</em></h1><p>Explore approved digital products, buy airtime and data, pay electricity bills, and access permitted SMS verification services from one reliable financial workspace.</p><div className="mk-hero-actions"><Link href="/register" className="mk-primary large">Get started free <ArrowRight size={16} /></Link><a href="#how" className="mk-secondary">See how it works <ChevronRight size={15} /></a></div><div className="mk-trust"><span><ShieldCheck size={16} /> Secure payments</span><span><BadgeCheck size={16} /> Provider-confirmed delivery</span></div></div><ProductPreview /></div></section>

    <section id="supported-networks" className="mk-logo-strip"><div className="shell mk-logo-strip-inner"><p>Supported networks &amp; platforms</p><div className="mk-logo-list">{supportedBrands.map(({ name, label }) => <div className="mk-logo-brand" key={name}><span><Image src={`/logos/${name}.png`} alt={`${label} logo`} width={30} height={30} /></span><b>{label}</b></div>)}</div></div></section>

    <section id="services" className="mk-section shell"><div className="mk-section-heading"><div><span className="mk-kicker"><i /> Built for everyday life</span><h2>All your essential digital services</h2><p>Clear steps, secure payments and honest provider status across every transaction.</p></div><Link href="/register" className="mk-secondary">Explore the platform <ArrowRight size={14} /></Link></div><div className="mk-service-grid">{services.map(({ title, copy, href, icon: Icon }, index) => <Link href={href} className={`mk-service ${index === 0 ? "featured" : ""}`} key={title}><span><Icon size={21} /></span><small>0{index + 1}</small><h3>{title}</h3><p>{copy}</p><b>Open service <ArrowRight size={13} /></b></Link>)}</div></section>

    <section id="how" className="mk-soft-section"><div className="shell"><div className="mk-section-heading"><div><span className="mk-kicker"><i /> How it works</span><h2>Simple from start to finish</h2><p>A focused journey designed to keep every action clear.</p></div></div><div className="mk-steps">{[["01","Create your account","Sign up and verify your email securely."],["02","Fund your wallet","Add money through verified Paystack checkout."],["03","Choose a service","Select airtime, data, electricity or SMS."],["04","Track the outcome","See the real provider-confirmed transaction status."]].map(([number,title,copy]) => <article key={number}><span>{number}</span><div><Check size={16} /></div><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section>

    <section id="security" className="mk-section shell"><div className="mk-security"><div><span className="mk-dark-kicker">Security by design</span><h2>Built to protect every transaction.</h2><p>Private provider keys stay on the server. Wallet credits are verified, atomic and protected against duplication.</p><Link href="/register" className="mk-light-button">Create your account <ArrowRight size={14} /></Link></div><div className="mk-security-grid">{[[LockKeyhole,"Private API credentials"],[CreditCard,"Verified wallet funding"],[ShieldCheck,"Server-side authorization"],[ReceiptText,"Auditable transactions"]].map(([Icon,label]) => <div key={String(label)}><span><Icon size={18} /></span><b>{String(label)}</b></div>)}</div></div></section>

    <section id="faq" className="mk-section shell"><div className="mk-faq-layout"><div><span className="mk-kicker"><i /> Questions answered</span><h2>Everything you need to know.</h2><p>Clear answers about payments, delivery and verification services.</p></div><div>{faqs.map(([question,answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></div></section>

    <section id="closing-cta" className="mk-final shell"><div className="mk-final-copy"><span>Everything in one secure account</span><h2>Ready to simplify your everyday digital services?</h2><p>Fund your wallet once, choose the service you need, and follow every transaction from one elegant dashboard.</p><div className="mk-final-actions"><Link href="/register" className="mk-light-button">Create free account <ArrowRight size={14} /></Link><Link href="/login" className="mk-final-login">Sign in to your account <ChevronRight size={14} /></Link></div></div><div className="mk-final-proof"><div><span><ShieldCheck size={18} /></span><p><b>Protected payments</b><small>Secure Paystack verification</small></p></div><div><span><BadgeCheck size={18} /></span><p><b>Honest delivery status</b><small>Real provider confirmations</small></p></div><div><span><WalletCards size={18} /></span><p><b>One auditable wallet</b><small>Every credit and debit tracked</small></p></div></div></section>

    <div id="footer" aria-hidden="true" />
    <footer className="mk-footer"><div className="shell mk-footer-grid"><div className="mk-footer-brand"><Brand light /><p>A secure platform for approved digital products, SMS verification, airtime, data, electricity and wallet payments.</p></div><div><h3>Services</h3><Link href="/dashboard/marketplace">Marketplace</Link><Link href="/dashboard/sms">SMS Verification</Link><Link href="/dashboard/airtime">Buy Airtime</Link><Link href="/dashboard/data">Buy Data</Link><Link href="/dashboard/electricity">Electricity Bills</Link><Link href="/dashboard/wallet">Fund Wallet</Link></div><div><h3>Company</h3><a href="#services">About Us</a><a href="#faq">Contact</a><a href="#faq">Help Centre</a><a href="#faq">FAQs</a></div><div><h3>Legal</h3><span>Privacy Policy</span><span>Terms of Service</span><span>Refund Policy</span></div></div><div className="shell mk-footer-bottom"><span>© {new Date().getFullYear()} DMB Logs Portal. All rights reserved.</span><span><ShieldCheck size={13} /> Secure digital services</span></div></footer>
  </main>;
}
