import { NextRequest } from "next/server";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";

function iso(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  if (typeof value === "string") return value;
  return null;
}

function ledgerServiceType(kind: unknown) {
  if (kind === "deposit") return "wallet_funding";
  if (kind === "refund") return "wallet_refund";
  if (kind === "adjustment") return "wallet_adjustment";
  return "wallet_transaction";
}

async function customerCollection(collection: "transactions" | "walletTransactions", uid: string) {
  const base = adminDb().collection(collection).where("userId", "==", uid);
  try {
    return await base.orderBy("createdAt", "desc").limit(75).get();
  } catch (error) {
    if ((error as { code?: number | string }).code !== 9 && (error as { code?: number | string }).code !== "failed-precondition") throw error;
    return base.limit(100).get();
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const [serviceSnapshot, ledgerSnapshot] = await Promise.all([
      customerCollection("transactions", user.uid),
      customerCollection("walletTransactions", user.uid),
    ]);
    const rows = new Map<string, Record<string, unknown>>();

    for (const document of serviceSnapshot.docs) {
      const data = document.data();
      const reference = String(data.reference || document.id);
      rows.set(reference, {
        id: document.id,
        reference,
        serviceType: data.serviceType || "service_purchase",
        amountMinor: data.amountMinor ?? null,
        retailPriceMinor: data.retailPriceMinor ?? data.amountMinor ?? null,
        status: data.status || "pending",
        providerReference: data.providerReference || null,
        kind: "purchase",
        description: data.description || null,
        createdAt: iso(data.createdAt),
      });
    }

    for (const document of ledgerSnapshot.docs) {
      const data = document.data();
      const reference = String(data.reference || document.id);
      if (rows.has(reference)) continue;
      rows.set(reference, {
        id: document.id,
        reference,
        serviceType: ledgerServiceType(data.kind),
        amountMinor: data.amountMinor ?? 0,
        retailPriceMinor: null,
        status: data.status || "successful",
        providerReference: data.providerReference || null,
        kind: data.kind || "wallet",
        description: data.description || null,
        createdAt: iso(data.createdAt),
      });
    }

    const transactions = [...rows.values()]
      .sort((a, b) => Date.parse(String(b.createdAt || "")) - Date.parse(String(a.createdAt || "")))
      .slice(0, 100);
    return Response.json({ transactions });
  } catch (error) {
    return routeError(error);
  }
}
