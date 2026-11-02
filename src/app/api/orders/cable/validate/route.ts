import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { vtuProvider } from "@/lib/server/providers";

const schema = z.object({ provider: z.string().min(1).max(80), phone: z.string().max(20).regex(/^(?:\+234|234|0)[789][01]\d{8}$/), smartcardNumber: z.string().regex(/^[0-9A-Za-z-]{5,30}$/) });
export async function POST(req: NextRequest) { try { const user = await requireUser(req); const input = schema.parse(await req.json()); const result = await vtuProvider().validateCable(input); const validationId = randomUUID(); await adminDb().collection("vtuCableVerifications").doc(validationId).create({ uid: user.uid, ...input, ...result, expiresAtMs: Date.now() + 10 * 60 * 1000, createdAt: FieldValue.serverTimestamp() }); return Response.json({ ...result, validationId }); } catch (error) { return routeError(error); } }
