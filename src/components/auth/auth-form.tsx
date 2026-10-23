"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { ArrowLeft, ArrowRight, BadgeCheck, Eye, EyeOff, LockKeyhole, Mail, Phone, ShieldCheck, Sparkles, UserRound, WalletCards, Zap } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { auth, firebaseConfigured } from "@/lib/firebase/client";
import { api } from "@/lib/api-client";

type Mode = "login" | "register" | "forgot";

const content = {
  login: { eyebrow: "Secure account access", title: "Welcome back", description: "Sign in to manage your wallet, services and transactions.", button: "Sign in to dashboard" },
  register: { eyebrow: "Create your secure account", title: "Get started today", description: "Set up your digital-services wallet in less than a minute.", button: "Create my account" },
  forgot: { eyebrow: "Account recovery", title: "Reset your password", description: "Enter your email and we will send you a secure reset link.", button: "Send reset link" },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const copy = content[mode];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firebaseConfigured) {
      toast.error("Firebase is not configured. Add the public Firebase environment variables first.");
      return;
    }
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    try {
      if (mode === "forgot") {
        await sendPasswordResetEmail(auth, email);
        toast.success("Password reset email sent.");
        return;
      }
      const password = String(form.get("password"));
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: String(form.get("name")) });
        await sendEmailVerification(credential.user);
        await api("/api/auth/bootstrap", { method: "POST", body: JSON.stringify({ displayName: String(form.get("name")), phone: String(form.get("phone")) }) });
        toast.success("Account created. Please verify your email.");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.push("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to continue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth2-shell">
      <aside className="auth2-showcase">
        <div className="auth2-orb auth2-orb-one" />
        <div className="auth2-orb auth2-orb-two" />
        <Brand light />
        <div className="auth2-showcase-copy">
          <span className="auth2-showcase-kicker"><Sparkles size={14} /> One secure digital wallet</span>
          <h1>Everything you need.<br /><em>One login away.</em></h1>
          <p>Access verified digital services, monitor every order and keep your wallet activity clear from one elegant workspace.</p>
          <div className="auth2-benefits">
            <div><span><WalletCards size={18} /></span><p><b>One smart wallet</b><small>Every credit and debit is tracked</small></p></div>
            <div><span><Zap size={18} /></span><p><b>Fast service access</b><small>Airtime, data, bills and SMS</small></p></div>
            <div><span><BadgeCheck size={18} /></span><p><b>Honest status updates</b><small>Provider-confirmed outcomes only</small></p></div>
          </div>
        </div>
        <div className="auth2-showcase-footer"><ShieldCheck size={17} /><span><b>Protected by secure authentication</b><small>Your credentials are handled by Firebase Authentication</small></span></div>
      </aside>

      <section className="auth2-panel">
        <div className="auth2-toolbar">
          <Link href="/" className="auth2-back"><ArrowLeft size={16} /> Back home</Link>
          <ThemeToggle compact />
        </div>

        <div className="auth2-card-wrap">
          <div className="auth2-mobile-brand"><Brand /></div>
          <div className="auth2-card">
            <span className="auth2-eyebrow"><LockKeyhole size={13} /> {copy.eyebrow}</span>
            <h2>{copy.title}</h2>
            <p className="auth2-description">{copy.description}</p>

            <form onSubmit={submit} className="auth2-form">
              {mode === "register" && <>
                <label className="auth2-label">Full name
                  <span className="auth2-field"><UserRound size={18} /><input required name="name" autoComplete="name" placeholder="Ada Okafor" /></span>
                </label>
                <label className="auth2-label">Phone number
                  <span className="auth2-field"><Phone size={18} /><input required name="phone" autoComplete="tel" placeholder="080 0000 0000" inputMode="tel" /></span>
                </label>
              </>}

              <label className="auth2-label">Email address
                <span className="auth2-field"><Mail size={18} /><input required name="email" type="email" autoComplete="email" placeholder="you@example.com" /></span>
              </label>

              {mode !== "forgot" && <label className="auth2-label">
                <span className="auth2-label-row"><span>Password</span>{mode === "login" && <Link href="/forgot-password">Forgot password?</Link>}</span>
                <span className="auth2-field"><LockKeyhole size={18} /><input required minLength={8} name="password" type={show ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters" /><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>
              </label>}

              <button disabled={busy} className="auth2-submit"><span>{busy ? "Please wait…" : copy.button}</span>{!busy && <ArrowRight size={17} />}</button>
            </form>

            {mode === "login" && <p className="auth2-switch">New to DMB Logs Portal? <Link href="/register">Create an account</Link></p>}
            {mode === "register" && <p className="auth2-switch">Already have an account? <Link href="/login">Sign in</Link></p>}
            {mode === "forgot" && <p className="auth2-switch"><Link href="/login"><ArrowLeft size={13} /> Back to sign in</Link></p>}

            <div className="auth2-trust"><ShieldCheck size={15} /><span>Your sign-in is encrypted and protected. We never ask for your password outside this page.</span></div>
          </div>
          <p className="auth2-legal">By continuing, you agree to our Terms of Service and permitted-use policy.</p>
        </div>
      </section>
    </main>
  );
}
