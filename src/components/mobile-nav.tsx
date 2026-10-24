"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CircleHelp, Layers3, Menu, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  ["Services", "Everything available in one place", "#services", Layers3],
  ["How it works", "A simple four-step process", "#how", Sparkles],
  ["Security", "How your payments stay protected", "#security", ShieldCheck],
  ["FAQs", "Quick answers before you begin", "#faq", CircleHelp],
] as const;

export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", closeOnEscape); };
  }, [open]);

  return <>
    <button onClick={() => setOpen(true)} className="mobile-menu-trigger md:hidden" aria-label="Open navigation" aria-expanded={open} aria-controls="mobile-navigation"><Menu size={20}/></button>
    <div className={`mobile-menu ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <button className="mobile-menu-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)}/>
      <aside id="mobile-navigation" className="mobile-menu-panel" role="dialog" aria-modal="true" aria-label="Mobile navigation">
        <div className="mobile-menu-head"><Link href="/" className="mobile-menu-brand" onClick={() => setOpen(false)}><span><Image src="/dmb-logins-logo.png" alt="" width={64} height={64} /></span><div><b>DMB Logs Portal</b><small>Digital services, simplified</small></div></Link><button onClick={() => setOpen(false)} className="mobile-menu-close" aria-label="Close navigation"><X size={18}/></button></div>
        <div className="mobile-menu-intro"><span>Explore</span><p>Move through the platform quickly and securely.</p></div>
        <nav className="mobile-menu-links">{links.map(([label, copy, href, Icon]) => <a key={href} href={href} onClick={() => setOpen(false)} className="mobile-menu-link"><span><Icon size={18}/></span><div><b>{label}</b><small>{copy}</small></div><ArrowRight className="mobile-menu-arrow" size={16}/></a>)}</nav>
        <div className="mobile-menu-footer"><div className="mobile-menu-theme"><div><b>Appearance</b><small>Choose light or dark mode</small></div><ThemeToggle compact /></div><div className="mobile-menu-actions"><Link onClick={() => setOpen(false)} href="/login" className="mobile-menu-login">Log in</Link><Link onClick={() => setOpen(false)} href="/register" className="mk-primary">Create account <ArrowRight size={15}/></Link></div><p>Secure payments · Provider-confirmed delivery</p></div>
      </aside>
    </div>
  </>;
}
