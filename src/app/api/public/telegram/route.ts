import { defaultTelegramSettings, getTelegramSettings } from "@/lib/server/telegram-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getTelegramSettings();
    return Response.json(settings, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(defaultTelegramSettings, { headers: { "Cache-Control": "no-store" } });
  }
}
