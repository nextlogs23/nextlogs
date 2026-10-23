"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { ArrowLeft, ArrowRight, BadgeCheck, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api-client";
import { auth, firebaseConfigured } from "@/lib/firebase/client";

export function AdminLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(searchParams.get("reason") === "unauthorized" ? "This account does not have administrator access." : "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!firebaseConfigured) {
      setError("Firebase authentication is not configured for this deployment.");
      return;
    }
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await signInWithEmailAndPassword(auth, String(form.get("email")), String(form.get("password")));
      await api("/api/admin/summary");
      toast.success("Administrator access verified.");
      router.replace("/admin");
      router.refresh();
    } catch (loginError) {
      await signOut(auth).catch(() => undefined);
      const message = loginError instanceof Error && loginError.message.includes("Administrator access required")
        ? "This account is valid, but it is not authorized as an administrator."
        : "Unable to verify administrator access. Check your credentials and admin role.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="admin-login-shell">
    <section className="admin-login-visual">
      <Brand light />
      <div className="admin-login-visual-copy">
        <span><ShieldCheck size={14} /> Restricted operations workspace</span>
        <h1>Control the platform.<br /><em>Protect every transaction.</em></h1>
        <p>Monitor users, providers, wallet activity, service pricing and operational performance from one protected console.</p>
        <div className="admin-login-assurances">
          <div><BadgeCheck size={17} /><span><b>Role-verified access</b><small>Firestore administrator permission required</small></span></div>
          <div><LockKeyhole size={17} /><span><b>Server-side authorization</b><small>Every admin request is verified again</small></span></div>
        </div>
      </div>
      <p className="admin-login-visual-footer"><LockKeyhole size={15} /> DMB Logs Portal administrative console</p>
    </section>

    <section className="admin-login-panel">
      <div className="admin-login-toolbar"><Link href="/"><ArrowLeft size={15} /> Return to website</Link><ThemeToggle compact /></div>
      <div className="admin-login-wrap">
        <div className="admin-login-mobile-brand"><Brand /></div>
        <div className="admin-login-card">
          <span className="admin-login-badge"><KeyRound size={13} /> Administrator sign in</span>
          <h2>Welcome to operations</h2>
          <p>Use an account assigned the <code>admin</code> role in Firestore.</p>
          {error && <div className="admin-login-error"><ShieldCheck size={16} /><span>{error}</span></div>}
          <form onSubmit={submit}>
            <label>Email address<span><Mail size={18} /><input required name="email" type="email" autoComplete="email" placeholder="admin@example.com" /></span></label>
            <label>Password<span><LockKeyhole size={18} /><input required name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
            <button className="admin-login-submit" disabled={busy}><span>{busy ? "Verifying access…" : "Enter admin console"}</span>{!busy && <ArrowRight size={17} />}</button>
          </form>
          <div className="admin-login-separator"><span>Customer account?</span></div>
          <Link href="/login" className="admin-login-customer">Go to customer sign in <ArrowRight size={14} /></Link>
          <p className="admin-login-security"><ShieldCheck size={14} /> Authentication alone does not grant admin access. Your server-side role is verified before entry.</p>
        </div>
      </div>
    </section>
  </main>;
}
