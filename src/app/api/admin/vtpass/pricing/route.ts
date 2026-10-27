import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
const schema = z.object({ serviceId: z.string().regex(/^[a-z0-9-]{2,80}$/), active: z.boolean(), markupPercent: z.number().min(0).max(100), flatFeeMinor: z.number().int().min(0).max(1000000) });
export async function GET(req: NextRequest) { try { await requireAdmin(req); const docs = await adminDb().collection("servicePricing").where("provider", "==", "vtpass").get(); return Response.json({ pricing: docs.docs.map((doc) => ({ id: doc.id, ...doc.data() })) }); } catch (error) { return routeError(error); } }
export async function PATCH(req: NextRequest) { try { const admin = await requireAdmin(req), input = schema.parse(await req.json()), id = `vtpass_${input.serviceId}`, db = adminDb(), batch = db.batch(); batch.set(db.collection("servicePricing").doc(id), { provider: "vtpass", ...input, updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); batch.create(db.collection("adminAuditLogs").doc(), { actorUid: admin.uid, action: "vtpass_pricing_update", target: id, changes: input, createdAt: FieldValue.serverTimestamp() }); await batch.commit(); return Response.json({ ok: true }); } catch (error) { return routeError(error); } }
