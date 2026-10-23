"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { ArrowLeft, ArrowRight, Eye, EyeOff, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { auth, firebaseConfigured } from "@/lib/firebase/client";
import { api } from "@/lib/api-client";

type Mode = "login" | "register" | "forgot";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firebaseConfigured) { toast.error("Firebase is not configured. Add the public Firebase environment variables first."); return; }
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    try {
      if (mode === "forgot") { await sendPasswordResetEmail(auth, email); toast.success("Password reset email sent."); return; }
      const password = String(form.get("password"));
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: String(form.get("name")) });
        await sendEmailVerification(credential.user);
        await api("/api/auth/bootstrap", { method: "POST", body: JSON.stringify({ displayName: String(form.get("name")), phone: String(form.get("phone")) }) });
        toast.success("Account created. Please verify your email.");
      } else await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to continue"); }
    finally { setBusy(false); }
  }
  const copy = mode === "login" ? ["Welcome back", "Sign in to manage your wallet and services."] : mode === "register" ? ["Create your account", "A secure digital-service wallet in under a minute."] : ["Reset your password", "We will email you a secure reset link."];

  return <main className="grid min-h-screen bg-[var(--cream)] lg:grid-cols-[1.05fr_.95fr]">
    <section className="auth-visual hidden p-14 text-white lg:flex lg:flex-col lg:justify-between"><Brand light /><div className="max-w-xl"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-[#ffc1d2]"><Sparkles size={14} /> One balance, more possibilities</p><h1 className="mt-5 text-6xl font-black leading-[1.02] tracking-[-.055em]">The simple way to keep life moving.</h1><p className="mt-6 max-w-md leading-7 text-white/60">SMS verification, airtime, data and electricity—managed with clear status updates and an auditable wallet.</p></div><div className="flex items-center gap-3 text-sm text-white/60"><ShieldCheck className="text-[#ffc1d2]" />Protected payments and provider-verified delivery</div></section>
    <section className="relative flex items-center justify-center bg-[var(--surface)] px-6 py-16"><Link href="/" className="absolute left-7 top-7 flex items-center gap-2 text-sm font-bold text-[var(--muted)]"><ArrowLeft size={16} /> Home</Link><div className="absolute right-7 top-7"><ThemeToggle compact /></div><div className="w-full max-w-md"><div className="lg:hidden"><Brand /></div><p className="ui-eyebrow mt-10">Secure access</p><h2 className="mt-3 text-4xl font-black tracking-[-.045em]">{copy[0]}</h2><p className="mt-3 text-sm text-[var(--muted)]">{copy[1]}</p><form onSubmit={submit} className="mt-8 space-y-5">{mode === "register" && <><label className="ui-label">Full name<input required name="name" className="ui-input" placeholder="Ada Okafor" /></label><label className="ui-label">Phone number<input required name="phone" className="ui-input" placeholder="080 0000 0000" inputMode="tel" /></label></>}<label className="ui-label">Email address<input required name="email" type="email" className="ui-input" placeholder="you@example.com" /></label>{mode !== "forgot" && <label className="ui-label">Password<div className="relative"><input required minLength={8} name="password" type={show ? "text" : "password"} className="ui-input pr-12" placeholder="At least 8 characters" /><button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-[19px] border-0 bg-transparent text-[var(--muted)]">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>}<button disabled={busy} className="ui-button-primary w-full disabled:opacity-60">{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset link"} {!busy && <ArrowRight size={16} />}</button></form>{mode === "login" && <div className="mt-5 flex justify-between text-xs"><Link className="font-black text-[var(--brand)]" href="/forgot-password">Forgot password?</Link><span>New here? <Link className="font-black text-[var(--brand)]" href="/register">Register</Link></span></div>}{mode === "register" && <p className="mt-5 text-center text-xs">Already have an account? <Link className="font-black text-[var(--brand)]" href="/login">Sign in</Link></p>}{mode === "forgot" && <p className="mt-5 text-center text-xs"><Link className="font-black text-[var(--brand)]" href="/login">Back to sign in</Link></p>}<p className="mt-10 text-center text-[10px] leading-5 text-[var(--muted)]">By continuing, you agree to our Terms and permitted-use policy.</p></div></section>
  </main>;
}
