import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { getTelegramSettings, normalizeTelegramUrl } from "@/lib/server/telegram-settings";

const schema = z.object({ liveChatUrl: z.string().min(2).max(120), channelUrl: z.string().min(2).max(120) });

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    return Response.json(await getTelegramSettings());
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const input = schema.parse(await request.json());
    const settings = {
      liveChatUrl: normalizeTelegramUrl(input.liveChatUrl),
      channelUrl: normalizeTelegramUrl(input.channelUrl),
    };
    const db = adminDb();
    const batch = db.batch();
    batch.set(db.collection("platformSettings").doc("telegram"), {
      ...settings,
      updatedBy: admin.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    batch.create(db.collection("adminAuditLogs").doc(), {
      actorUid: admin.uid,
      action: "telegram_settings_update",
      target: "platformSettings/telegram",
      changes: settings,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return Response.json({ ok: true, ...settings });
  } catch (error) {
    if (error instanceof z.ZodError) return routeError(Object.assign(new Error("Enter valid Telegram account details."), { status: 400 }));
    return routeError(error);
  }
}
