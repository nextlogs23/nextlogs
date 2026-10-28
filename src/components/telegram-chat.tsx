"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const telegramUrl = "https://t.me/NEXTLOG_1";
const telegramChannelUrl = "https://t.me/NEXTLOG23";
const inviteStorageKey = "dmb-telegram-channel-invite-seen";

type TelegramSettings = { liveChatUrl: string; channelUrl: string };

function useTelegramSettings() {
  const [settings, setSettings] = useState<TelegramSettings>({ liveChatUrl: telegramUrl, channelUrl: telegramChannelUrl });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/telegram", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<TelegramSettings> : Promise.reject())
      .then(setSettings)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return settings;
}

export function TelegramChat() {
  const pathname = usePathname();
  const settings = useTelegramSettings();

  if (pathname.startsWith("/admin")) return null;

  const dashboard = pathname.startsWith("/dashboard");

  return (
    <a
      className={`telegram-chat${dashboard ? " is-dashboard" : ""}`}
      href={settings.liveChatUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with DMB Logs Portal support on Telegram"
    >
      <span className="telegram-chat-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" role="img">
          <path d="M20.8 3.4 3.9 9.9c-1.15.46-1.14 1.1-.21 1.39l4.34 1.35 1.67 5.12c.2.57.1.8.69.8.45 0 .65-.21.9-.45l2.08-2.02 4.33 3.2c.8.44 1.37.21 1.57-.74l2.84-13.4c.29-1.17-.45-1.7-1.31-1.35Zm-2.5 3.1-7.69 6.94-.3 3.2-1.18-3.84 8.3-5.24c.37-.22.7-.1.87-.3.17-.2.19-.94 0-.76Z" />
        </svg>
      </span>
      <span className="telegram-chat-copy">
        <small>Need help?</small>
        <strong>Chat on Telegram</strong>
      </span>
      <span className="telegram-chat-presence" aria-hidden="true" />
    </a>
  );
}

export function TelegramChannelInvite() {
  const pathname = usePathname();
  const settings = useTelegramSettings();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/admin")) {
      setOpen(false);
      return;
    }

    try {
      if (window.sessionStorage.getItem(inviteStorageKey)) return;
    } catch {
      // Storage can be unavailable in private browsing; the invite still works.
    }

    const timer = window.setTimeout(() => setOpen(true), 2200);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function dismiss() {
    try {
      window.sessionStorage.setItem(inviteStorageKey, "1");
    } catch {
      // Dismissing the invite should never depend on browser storage.
    }
    setOpen(false);
  }

  if (!open || pathname.startsWith("/admin")) return null;

  return (
    <div className="telegram-invite-layer" role="dialog" aria-modal="true" aria-labelledby="telegram-invite-title">
      <button className="telegram-invite-backdrop" type="button" onClick={dismiss} aria-label="Close Telegram channel invitation" />
      <section className="telegram-invite-card">
        <button className="telegram-invite-close" type="button" onClick={dismiss} aria-label="Close invitation">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
        <div className="telegram-invite-art" aria-hidden="true">
          <span className="telegram-invite-orbit one" />
          <span className="telegram-invite-orbit two" />
          <span className="telegram-invite-plane">
            <svg viewBox="0 0 24 24"><path d="M20.8 3.4 3.9 9.9c-1.15.46-1.14 1.1-.21 1.39l4.34 1.35 1.67 5.12c.2.57.1.8.69.8.45 0 .65-.21.9-.45l2.08-2.02 4.33 3.2c.8.44 1.37.21 1.57-.74l2.84-13.4c.29-1.17-.45-1.7-1.31-1.35Zm-2.5 3.1-7.69 6.94-.3 3.2-1.18-3.84 8.3-5.24c.37-.22.7-.1.87-.3.17-.2.19-.94 0-.76Z" /></svg>
          </span>
        </div>
        <div className="telegram-invite-content">
          <span className="telegram-invite-kicker">DMB community</span>
          <h2 id="telegram-invite-title">Join our Telegram channel</h2>
          <p>Get important platform announcements, service updates, offers, and helpful tips directly on Telegram.</p>
          <div className="telegram-invite-actions">
            <a href={settings.channelUrl} target="_blank" rel="noopener noreferrer" onClick={dismiss}>Join Telegram channel</a>
            <button type="button" onClick={dismiss}>Maybe later</button>
          </div>
          <small>You can leave the channel at any time.</small>
        </div>
      </section>
    </div>
  );
}
