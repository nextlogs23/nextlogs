import { Suspense } from "react";
import { AdminLogin } from "@/components/admin/admin-login";

export default function Page() {
  return <Suspense fallback={<div className="portal-loading"><span /><p>Preparing secure admin access…</p></div>}><AdminLogin /></Suspense>;
}
