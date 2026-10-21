"use client";

import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

const links = [
  ["Services", "#services"],
  ["How it works", "#how"],
  ["Security", "#security"],
  ["FAQ", "#faq"],
] as const;

export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return <>
    <button onClick={() => setOpen(true)} className="mobile-menu-trigger md:hidden" aria-label="Open navigation" aria-expanded={open}><Menu size={21}/></button>
    <div className={`mobile-menu ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <button className="mobile-menu-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)}/>
      <aside className="mobile-menu-panel">
        <div className="flex items-center justify-between border-b border-[#e7e3f4] pb-5"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#6757e8]">DMB Logs Portal</p><p className="mt-1 text-xs text-[#85829a]">Digital services, simplified.</p></div><button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl bg-[#f1effb]" aria-label="Close navigation"><X size={18}/></button></div>
        <nav className="mt-6 grid gap-2">{links.map(([label, href], index) => <a key={href} href={href} onClick={() => setOpen(false)} className="mobile-menu-link"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f0edff] text-[10px] font-black text-[#6757e8]">0{index + 1}</span><b>{label}</b><ArrowRight className="ml-auto" size={15}/></a>)}</nav>
        <div className="mt-auto grid gap-3 pt-8"><Link onClick={() => setOpen(false)} href="/register" className="btn-primary w-full">Create account <ArrowRight size={15}/></Link><Link onClick={() => setOpen(false)} href="/login" className="rounded-xl border border-[#dfdced] py-3 text-center text-sm font-black">Log in</Link></div>
      </aside>
    </div>
  </>;
}
