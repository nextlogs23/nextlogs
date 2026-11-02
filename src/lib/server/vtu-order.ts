import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { requireUser, routeError } from "./auth";
import { adminDb } from "./firebase-admin";
import { enforceRateLimit } from "./rate-limit";
import { vtuProvider } from "./providers";
import { finalizePurchaseRefund, reservePurchase } from "./wallet";
import { readVtugatePricing, retailPrice, VtugateError, vtugateConfig, vtuReferenceFor } from "./vtugate";

const schema = z.object({ phone: z.string().max(20).optional(), network: z.enum(["mtn", "airtel", "glo", "9mobile"]).optional(), planId: z.string().max(180).optional(), provider: z.string().max(80).optional(), meterType: z.enum(["prepaid", "postpaid"]).optional(), meterNumber: z.string().regex(/^[0-9]{5,20}$/).optional(), smartcardNumber: z.string().regex(/^[0-9A-Za-z-]{5,30}$/).optional(), validationId: z.string().max(100).optional(), amountMinor: z.number().int().min(10000).max(10000000).optional(), idempotencyKey: z.string().min(16).max(100) });
function validPhone(value: string) { return /^(?:\+234|234|0)[789][01]\d{8}$/.test(value); }

export async function POST(req: NextRequest, { params }: { params: Promise<{ service: string }> }) {
  let uid = "", ref = "";
  try {
    const service = (await params).service, collection = `${service}Orders`;
    if (!["airtime", "data", "electricity", "cable"].includes(service)) return Response.json({ error: "Unsupported service" }, { status: 404 });
    const user = await requireUser(req); uid = user.uid;
    if (!vtugateConfig().purchasesEnabled) throw Object.assign(new Error("VTUGATE purchases are disabled while testing is in progress"), { status: 503 });
    await enforceRateLimit(`buy_${service}_${uid}`, 10, 60 * 60 * 1000);
    const body = schema.parse(await req.json());
    if (!body.phone || !validPhone(body.phone.replace(/[\s-]/g, ""))) throw Object.assign(new Error("Enter a valid Nigerian phone number"), { status: 400 });
    if (["airtime", "data"].includes(service) && !body.network) throw Object.assign(new Error("Select a supported network"), { status: 400 });
    if (service === "data" && !body.planId) throw Object.assign(new Error("Select a valid data plan"), { status: 400 });
    if (service === "electricity" && (!body.provider || !body.meterType || !body.meterNumber || !body.validationId)) throw Object.assign(new Error("Validate the meter before payment"), { status: 400 });
    if (service === "cable" && (!body.provider || !body.smartcardNumber || !body.planId || !body.validationId)) throw Object.assign(new Error("Verify the smartcard and select a cable plan before payment"), { status: 400 });
    let providerCostMinor = body.amountMinor || 0, retailPriceMinor = 0, serviceId = body.network || "";
    let providerServiceId: string | undefined, providerPlanCode: string | undefined, planName: string | undefined;
    if (service === "data") { const plan = (await vtuProvider().dataPlans(body.network!)).find((item) => item.id === body.planId); if (!plan) throw Object.assign(new Error("This data plan is no longer available"), { status: 409 }); providerCostMinor = plan.providerCostMinor; retailPriceMinor = plan.priceMinor; serviceId = plan.providerServiceId || body.network!; providerServiceId = plan.providerServiceId; providerPlanCode = plan.providerPlanCode; planName = plan.name; }
    else if (service === "cable") { const plan = (await vtuProvider().cablePlans(body.provider!)).find((item) => item.id === body.planId); if (!plan) throw Object.assign(new Error("This cable plan is no longer available"), { status: 409 }); providerCostMinor = plan.providerCostMinor; retailPriceMinor = plan.priceMinor; serviceId = plan.providerServiceId; providerServiceId = plan.providerServiceId; providerPlanCode = plan.providerPlanCode; planName = plan.name; }
    else { if (!providerCostMinor) throw Object.assign(new Error("Enter a valid amount"), { status: 400 }); serviceId = service === "electricity" ? body.provider! : `airtime-${body.network!}`; const pricing = await readVtugatePricing(serviceId); if (!pricing.active) throw Object.assign(new Error("This service is currently unavailable"), { status: 409 }); retailPriceMinor = retailPrice(providerCostMinor, pricing); }
    if (service === "electricity") { const validation = await adminDb().collection("vtuMeterVerifications").doc(body.validationId!).get(), data = validation.data(); if (!validation.exists || data?.uid !== uid || data?.provider !== body.provider || data?.meterType !== body.meterType || data?.meterNumber !== body.meterNumber || Number(data?.expiresAtMs) < Date.now()) throw Object.assign(new Error("Meter verification has expired; validate the meter again"), { status: 409 }); }
    if (service === "cable") { const validation = await adminDb().collection("vtuCableVerifications").doc(body.validationId!).get(), data = validation.data(); if (!validation.exists || data?.uid !== uid || data?.provider !== body.provider || data?.smartcardNumber !== body.smartcardNumber || Number(data?.expiresAtMs) < Date.now()) throw Object.assign(new Error("Smartcard verification has expired; verify it again"), { status: 409 }); }
    ref = await vtuReferenceFor(uid, service, body.idempotencyKey);
    const metadata = { phone: body.phone || null, network: body.network || null, planId: body.planId || null, planName: planName || null, provider: body.provider || null, providerServiceId: providerServiceId || null, providerPlanCode: providerPlanCode || null, meterType: body.meterType || null, meterNumber: body.meterNumber || null, smartcardNumber: body.smartcardNumber || null, serviceId };
    const reservation = await reservePurchase({ uid, reference: ref, amountMinor: retailPriceMinor, service, metadata, providerOrder: { collection, data: { userId: uid, serviceType: service, status: "processing", retailPriceMinor, providerCostMinor, expectedMarginMinor: retailPriceMinor - providerCostMinor, ...metadata, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() } } });
    if (reservation.idempotent) { const existing = await adminDb().collection("transactions").doc(ref).get(), data = existing.data() || {}; return Response.json({ reference: ref, status: data.status || "processing", token: data.token || undefined, idempotent: true }); }
    try {
      const result = await vtuProvider().purchase({ ...body, providerServiceId, providerPlanCode, planName, type: service as "airtime" | "data" | "electricity" | "cable", reference: ref, amountMinor: providerCostMinor });
      const actualCost = result.providerCostMinor || providerCostMinor; const updates = { status: result.status, provider: "vtugate", providerReference: result.providerReference, providerExternalReference: result.externalReference || null, providerStatus: result.rawStatus, providerCode: result.rawCode || null, providerCostMinor: actualCost, retailPriceMinor, expectedMarginMinor: retailPriceMinor - actualCost, ...(result.token ? { token: result.token } : {}), ...(result.units ? { units: result.units } : {}), ...(result.customerName ? { customerName: result.customerName } : {}), ...(result.customerAddress ? { customerAddress: result.customerAddress } : {}), ...(result.paymentUsedFor ? { paymentUsedFor: result.paymentUsedFor } : {}), ...(result.debtBefore !== undefined ? { debtBefore: result.debtBefore } : {}), ...(result.debtRemaining !== undefined ? { debtRemaining: result.debtRemaining } : {}), updatedAt: FieldValue.serverTimestamp() };
      await Promise.all([adminDb().collection("transactions").doc(ref).set(updates, { merge: true }), adminDb().collection(collection).doc(ref).set(updates, { merge: true })]);
      if (result.status === "failed") await finalizePurchaseRefund({ uid, purchaseReference: ref, refundReference: `refund_${ref}`, amountMinor: retailPriceMinor, description: `Refund for confirmed failed ${service}`, providerReference: result.providerReference, providerOrderCollection: collection, providerOrderStatus: "refunded", providerOrderUpdates: updates });
      return Response.json({ reference: ref, status: result.status === "failed" ? "refunded" : result.status, token: result.token });
    } catch (providerError) {
      if (providerError instanceof VtugateError && providerError.outcomeKnown) {
        const updates = { status: "failed", provider: "vtugate", providerStatus: "rejected", lastError: providerError.message, updatedAt: FieldValue.serverTimestamp() };
        await Promise.all([adminDb().collection("transactions").doc(ref).set(updates, { merge: true }), adminDb().collection(collection).doc(ref).set(updates, { merge: true })]);
        await finalizePurchaseRefund({ uid, purchaseReference: ref, refundReference: `refund_${ref}`, amountMinor: retailPriceMinor, description: `Refund for rejected ${service}`, providerReference: ref, providerOrderCollection: collection, providerOrderStatus: "refunded", providerOrderUpdates: updates });
        return Response.json({ reference: ref, status: "refunded", message: providerError.message });
      }
      const updates = { status: "processing", provider: "vtugate", providerStatus: "provider_review", lastError: providerError instanceof Error ? providerError.message : "VTUGATE provider error", updatedAt: FieldValue.serverTimestamp() };
      await Promise.all([adminDb().collection("transactions").doc(ref).set(updates, { merge: true }), adminDb().collection(collection).doc(ref).set(updates, { merge: true })]);
      return Response.json({ reference: ref, status: "processing", message: "Provider confirmation is pending. Funds remain reserved while the transaction is requeried." }, { status: 202 });
    }
  } catch (error) { return routeError(error); }
}
