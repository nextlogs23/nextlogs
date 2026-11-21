import { NextRequest } from "next/server";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";

function iso(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") return (value as { toDate(): Date }).toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const db = adminDb();
    const [users, wallets, ledger] = await Promise.all([
      db.collection("users").get(),
      db.collection("wallets").get(),
      db.collection("walletTransactions").get(),
    ]);

    const walletByUser = new Map(wallets.docs.map((doc) => [doc.id, doc.data()]));
    const activityByUser = new Map<string, Array<Record<string, unknown>>>();
    for (const doc of ledger.docs) {
      const data = doc.data();
      const userId = typeof data.userId === "string" ? data.userId : "";
      if (!userId) continue;
      const amountMinor = Number(data.amountMinor);
      const item = {
        reference: data.reference || doc.id,
        amountMinor: Number.isFinite(amountMinor) ? amountMinor : 0,
        kind: data.kind || "other",
        description: data.description || "Wallet activity",
        status: data.status || "unknown",
        balanceAfterMinor: Number(data.balanceAfterMinor) || 0,
        createdAt: iso(data.createdAt),
      };
      const entries = activityByUser.get(userId) || [];
      entries.push(item);
      activityByUser.set(userId, entries);
    }

    const rows = users.docs.map((doc) => {
      const data = doc.data();
      const userId = doc.id;
      const entries = (activityByUser.get(userId) || []).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      const creditsMinor = entries.reduce((total, item) => total + (Number(item.amountMinor) > 0 ? Number(item.amountMinor) : 0), 0);
      const debitsMinor = entries.reduce((total, item) => total + (Number(item.amountMinor) < 0 ? Math.abs(Number(item.amountMinor)) : 0), 0);
      const wallet = walletByUser.get(userId) || {};
      return {
        uid: userId,
        email: data.email || null,
        displayName: data.displayName || null,
        phone: data.phone || null,
        role: data.role || "customer",
        status: data.status || "active",
        createdAt: iso(data.createdAt),
        updatedAt: iso(data.updatedAt),
        balanceMinor: Number(wallet.balanceMinor) || 0,
        creditsMinor,
        debitsMinor,
        transactionCount: entries.length,
        recentTransactions: entries.slice(0, 8),
      };
    }).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    return Response.json({ users: rows });
  } catch (error) {
    return routeError(error);
  }
}
