import { NextRequest } from "next/server";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { reconcileVtpass } from "@/lib/server/vtpass-reconcile";
import { z } from "zod";
function iso(value: unknown) { const date = value && typeof value === "object" && "toDate" in value ? (value as { toDate(): Date }).toDate() : null; return date?.toISOString() || null; }
export async function GET(req: NextRequest) { try { await requireAdmin(req); const rows = await Promise.all(["airtimeOrders", "dataOrders", "electricityOrders"].map((collection) => adminDb().collection(collection).orderBy("createdAt", "desc").limit(100).get())); const orders = rows.flatMap((set) => set.docs.map((doc) => { const data = doc.data(); return { id: doc.id, ...data, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt) }; })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); return Response.json({ orders }); } catch (error) { return routeError(error); } }
export async function POST(req: NextRequest) { try { const admin = await requireAdmin(req); const { reference } = z.object({ reference: z.string().min(12).max(100) }).parse(await req.json()); const result = await reconcileVtpass(reference); await adminDb().collection("adminAuditLogs").add({ actorUid: admin.uid, action: "vtpass_requery", reference, result, createdAt: new Date() }); return Response.json(result); } catch (error) { return routeError(error); } }
