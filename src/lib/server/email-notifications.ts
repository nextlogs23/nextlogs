import "server-only";

type ManualFundingNotification = {
  reference: string;
  amountMinor: number;
  depositorName: string;
  transferReference: string | null;
  customerEmail: string;
  reviewUrl: string;
};

type CustomerNotification = {
  reference: string;
  amountMinor: number;
  customerEmail: string;
  customerName?: string | null;
};

type WalletFundingNotification = CustomerNotification & { method: string };
type MarketplacePurchaseNotification = CustomerNotification & { productTitle: string; status: string };

export type EmailNotificationResult = {
  status: "sent" | "failed" | "not_configured";
  provider: "resend";
  messageId?: string;
  errorCode?: string;
};

export type TransactionNotificationResult = {
  customer: EmailNotificationResult;
  administrator: EmailNotificationResult;
};

const administratorRecipient = process.env.TRANSACTION_NOTIFICATION_EMAIL?.trim()
  || process.env.MANUAL_FUNDING_NOTIFICATION_EMAIL?.trim()
  || "nextlog23@gmail.com";
const manualFundingRecipient = process.env.MANUAL_FUNDING_NOTIFICATION_EMAIL?.trim() || administratorRecipient;

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}

function money(minor: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(minor / 100);
}

function appUrl(path: string) {
  const origin = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.nextlogs.online").replace(/\/$/, "");
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function greeting(name?: string | null) {
  const normalized = name?.trim();
  return normalized ? `Hello ${normalized},` : "Hello,";
}

function emailFrame(label: string, title: string, body: string, details: Array<[string, string]>, actionLabel: string, actionUrl: string) {
  const rows = details.map(([key, value]) => `<tr><td style="padding:10px 0;color:#64748b">${escapeHtml(key)}</td><td style="padding:10px 0;text-align:right;font-weight:700">${escapeHtml(value)}</td></tr>`).join("");
  return `<div style="background:#f4f7fb;padding:32px;font-family:Arial,sans-serif;color:#10233b"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #dce6ef;border-radius:18px;padding:28px"><p style="margin:0;color:#078df2;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(label)}</p><h1 style="margin:10px 0 8px;font-size:24px">${escapeHtml(title)}</h1><p style="margin:0 0 24px;color:#64748b;line-height:1.6">${escapeHtml(body)}</p><table style="width:100%;border-collapse:collapse">${rows}</table><a href="${escapeHtml(actionUrl)}" style="display:block;margin-top:24px;border-radius:10px;background:#078df2;padding:13px 18px;color:#fff;text-align:center;text-decoration:none;font-weight:700">${escapeHtml(actionLabel)}</a><p style="margin:20px 0 0;color:#94a3b8;font-size:12px;line-height:1.6">This is an automated transaction notification from Nextlogs. Never share your password or one-time code by email.</p></div></div>`;
}

async function sendEmail(input: { to: string; subject: string; text: string; html: string; idempotencyKey: string }): Promise<EmailNotificationResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const to = input.to.trim();
  if (!apiKey || !from) return { status: "not_configured", provider: "resend", errorCode: "missing_email_configuration" };
  if (!to || !to.includes("@")) return { status: "not_configured", provider: "resend", errorCode: "missing_recipient_email" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({ from, to: [to], subject: input.subject, text: input.text, html: input.html }),
      signal: AbortSignal.timeout(8_000),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; name?: string };
    if (!response.ok) return { status: "failed", provider: "resend", errorCode: body.name || `http_${response.status}` };
    return { status: "sent", provider: "resend", messageId: body.id };
  } catch (error) {
    const errorCode = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network_error";
    return { status: "failed", provider: "resend", errorCode };
  }
}

export async function sendManualFundingNotification(input: ManualFundingNotification): Promise<EmailNotificationResult> {
  const details: Array<[string, string]> = [
    ["Reference", input.reference], ["Amount", money(input.amountMinor)], ["Depositor", input.depositorName],
    ["Customer", input.customerEmail || "Not supplied"], ["Bank reference", input.transferReference || "Not supplied"],
  ];
  return sendEmail({
    to: manualFundingRecipient,
    subject: `New manual transfer proof — ${input.reference}`,
    text: ["A customer submitted a new manual wallet-funding proof.", ...details.map(([key, value]) => `${key}: ${value}`), `Review: ${input.reviewUrl}`, "Verify the transfer in the admin dashboard before approving any wallet credit."].join("\n"),
    html: emailFrame("Nextlogs manual funding", "New payment proof received", "A customer submitted a bank-transfer proof. Verify the payment before approving any wallet credit.", details, "Review payment proof", input.reviewUrl),
    idempotencyKey: `manual-funding-submitted/${input.reference}`,
  });
}

export async function sendWalletFundingNotifications(input: WalletFundingNotification): Promise<TransactionNotificationResult> {
  const amount = money(input.amountMinor);
  const walletUrl = appUrl("/dashboard/wallet");
  const adminWalletUrl = appUrl("/admin/wallet-transactions");
  const customerDetails: Array<[string, string]> = [["Amount credited", amount], ["Reference", input.reference], ["Funding method", input.method]];
  const adminDetails: Array<[string, string]> = [["Customer", input.customerEmail], ["Amount credited", amount], ["Reference", input.reference], ["Funding method", input.method]];
  const [customer, administrator] = await Promise.all([
    sendEmail({
      to: input.customerEmail,
      subject: `Your Nextlogs wallet was funded with ${amount}`,
      text: [greeting(input.customerName), "Your wallet funding has been confirmed and the balance is now available.", ...customerDetails.map(([key, value]) => `${key}: ${value}`), `View wallet: ${walletUrl}`].join("\n"),
      html: emailFrame("Nextlogs wallet", "Wallet funding confirmed", `${greeting(input.customerName)} Your payment was confirmed and your wallet balance has been updated.`, customerDetails, "View wallet", walletUrl),
      idempotencyKey: `wallet-funded-customer/${input.reference}`,
    }),
    sendEmail({
      to: administratorRecipient,
      subject: `Wallet funded — ${amount} — ${input.reference}`,
      text: ["A customer wallet was successfully funded.", ...adminDetails.map(([key, value]) => `${key}: ${value}`), `View wallet activity: ${adminWalletUrl}`].join("\n"),
      html: emailFrame("Nextlogs transaction alert", "Customer wallet funded", "A confirmed payment has been credited to a customer wallet.", adminDetails, "View wallet activity", adminWalletUrl),
      idempotencyKey: `wallet-funded-admin/${input.reference}`,
    }),
  ]);
  return { customer, administrator };
}

export async function sendMarketplacePurchaseNotifications(input: MarketplacePurchaseNotification): Promise<TransactionNotificationResult> {
  const amount = money(input.amountMinor);
  const marketplaceUrl = appUrl("/dashboard/marketplace");
  const adminMarketplaceUrl = appUrl("/admin/marketplace");
  const ready = input.status === "successful" || input.status === "completed";
  const customerDetails: Array<[string, string]> = [["Product", input.productTitle], ["Amount", amount], ["Reference", input.reference], ["Status", ready ? "Ready" : "Processing"]];
  const adminDetails: Array<[string, string]> = [["Customer", input.customerEmail], ...customerDetails];
  const [customer, administrator] = await Promise.all([
    sendEmail({
      to: input.customerEmail,
      subject: `Nextlogs purchase confirmed — ${input.productTitle}`,
      text: [greeting(input.customerName), ready ? "Your digital product is ready in your Nextlogs purchases." : "Your order has been received and is being processed.", ...customerDetails.map(([key, value]) => `${key}: ${value}`), `View purchase: ${marketplaceUrl}`].join("\n"),
      html: emailFrame("Nextlogs marketplace", "Purchase confirmed", `${greeting(input.customerName)} ${ready ? "Your digital product is ready in your Nextlogs purchases." : "Your order has been received and is being processed."}`, customerDetails, "View purchase", marketplaceUrl),
      idempotencyKey: `marketplace-purchase-customer/${input.reference}`,
    }),
    sendEmail({
      to: administratorRecipient,
      subject: `New marketplace purchase — ${input.reference}`,
      text: ["A customer completed a marketplace purchase.", ...adminDetails.map(([key, value]) => `${key}: ${value}`), `Open marketplace: ${adminMarketplaceUrl}`].join("\n"),
      html: emailFrame("Nextlogs transaction alert", "New marketplace purchase", "A customer completed a marketplace checkout.", adminDetails, "Open marketplace", adminMarketplaceUrl),
      idempotencyKey: `marketplace-purchase-admin/${input.reference}`,
    }),
  ]);
  return { customer, administrator };
}
