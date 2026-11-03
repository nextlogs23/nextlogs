import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getManualFundingSettings, manualFundingReady } from "@/lib/server/manual-funding";

export const runtime = "nodejs";

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const blobStoreId = process.env.NEXTLOGS_NEW_STORE_ID || process.env.BLOB_STORE_ID;
const submissionSchema = z.object({
  amountMinor: z.coerce.number().int().min(10000).max(100_000_000_00),
  depositorName: z.string().trim().min(2).max(100),
  transferReference: z.string().trim().max(100).default(""),
  idempotencyKey: z.string().uuid(),
});

function imageType(bytes: Buffer) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", extension: "png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", extension: "webp" };
  return null;
}

const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : null;

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const db = adminDb();
    const [settings, requests] = await Promise.all([
      getManualFundingSettings(),
      db.collection("manualFundingRequests").where("userId", "==", user.uid).limit(50).get(),
    ]);
    return Response.json({
      settings: manualFundingReady(settings) ? settings : { enabled: false },
      requests: requests.docs.map((doc) => { const data = doc.data(); return { reference: doc.id, amountMinor: data.amountMinor, status: data.status, depositorName: data.depositorName, transferReference: data.transferReference || null, proofFileName: data.proof?.fileName || "Payment proof", createdAt: iso(data.createdAt), reviewedAt: iso(data.reviewedAt), rejectionReason: data.status === "rejected" ? data.reviewReason || null : null }; }).sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || "")).slice(0, 20),
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    await enforceRateLimit(`manual_funding_${user.uid}`, 10, 24 * 60 * 60 * 1000);
    const form = await request.formData();
    const input = submissionSchema.parse({ amountMinor: form.get("amountMinor"), depositorName: form.get("depositorName"), transferReference: form.get("transferReference") || "", idempotencyKey: form.get("idempotencyKey") });
    const proof = form.get("proof");
    if (!(proof instanceof File)) throw Object.assign(new Error("Upload a payment screenshot"), { status: 400 });
    if (proof.size < 32 || proof.size > MAX_PROOF_BYTES) throw Object.assign(new Error("Payment proof must be an image smaller than 5 MB"), { status: 400 });
    const settings = await getManualFundingSettings();
    if (!manualFundingReady(settings)) throw Object.assign(new Error("Bank-transfer funding is not currently available"), { status: 503 });
    if (input.amountMinor < settings.minimumAmountMinor) throw Object.assign(new Error(`Minimum bank transfer is ₦${(settings.minimumAmountMinor / 100).toLocaleString("en-NG")}`), { status: 400 });

    const reference = `NXL-BANK-${createHash("sha256").update(`${user.uid}:${input.idempotencyKey}`).digest("hex").slice(0, 24).toUpperCase()}`;
    const db = adminDb(); const requestRef = db.collection("manualFundingRequests").doc(reference);
    const existing = await requestRef.get();
    if (existing.exists) return Response.json({ reference, status: existing.data()?.status || "pending", idempotent: true });

    const bytes = Buffer.from(await proof.arrayBuffer());
    const detected = imageType(bytes);
    if (!detected) throw Object.assign(new Error("Only genuine PNG, JPEG, or WebP screenshots are accepted"), { status: 400 });
    const pathname = `wallet/payment-proofs/${reference}.${detected.extension}`;
    const blob = await put(pathname, bytes, { access: "private", contentType: detected.mime, addRandomSuffix: false, cacheControlMaxAge: 60, storeId: blobStoreId });
    await requestRef.create({
      reference, userId: user.uid, userEmail: user.email, amountMinor: input.amountMinor,
      depositorName: input.depositorName, transferReference: input.transferReference || null,
      bankSnapshot: { bankName: settings.bankName, accountName: settings.accountName, accountNumber: settings.accountNumber },
      proof: { pathname: blob.pathname, fileName: proof.name.slice(0, 120) || `proof.${detected.extension}`, contentType: detected.mime, size: proof.size },
      status: "pending", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    return Response.json({ reference, status: "pending" }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return routeError(Object.assign(new Error(error.issues[0]?.message || "Check the transfer details"), { status: 400 }));
    return routeError(error);
  }
}
