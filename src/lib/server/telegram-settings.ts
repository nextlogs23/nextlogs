import { adminDb } from "./firebase-admin";

export const defaultTelegramSettings = {
  liveChatUrl: "https://t.me/NEXTLOG_1",
  channelUrl: "https://t.me/NEXTLOG23",
};

export type TelegramSettings = typeof defaultTelegramSettings;

export function normalizeTelegramUrl(value: string) {
  const trimmed = value.trim();
  const handle = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const candidate = handle.startsWith("http://") || handle.startsWith("https://")
    ? handle
    : `https://t.me/${handle.replace(/^t\.me\//i, "")}`;
  const url = new URL(candidate);
  if (!["t.me", "www.t.me", "telegram.me", "www.telegram.me"].includes(url.hostname.toLowerCase())) {
    throw Object.assign(new Error("Use a valid Telegram username or t.me link."), { status: 400 });
  }
  const username = url.pathname.split("/").filter(Boolean)[0];
  if (!username || !/^[A-Za-z0-9_]{5,32}$/.test(username)) {
    throw Object.assign(new Error("Telegram usernames must contain 5–32 letters, numbers, or underscores."), { status: 400 });
  }
  return `https://t.me/${username}`;
}

export async function getTelegramSettings(): Promise<TelegramSettings> {
  const snapshot = await adminDb().collection("platformSettings").doc("telegram").get();
  const data = snapshot.data();
  return {
    liveChatUrl: typeof data?.liveChatUrl === "string" ? data.liveChatUrl : defaultTelegramSettings.liveChatUrl,
    channelUrl: typeof data?.channelUrl === "string" ? data.channelUrl : defaultTelegramSettings.channelUrl,
  };
}
