import "server-only";

type ManualFundingNotification = {
  reference: string;
  amountMinor: number;
  depositorName: string;
  transferReference: string | null;
  customerEmail: string;
  reviewUrl: string;
};

export type EmailNotificationResult = {
  status: "sent" | "failed" | "not_configured";
  provider: "resend";
  messageId?: string;
  errorCode?: string;
};

const recipient = process.env.MANUAL_FUNDING_NOTIFICATION_EMAIL?.trim() || "nextlog23@gmail.com";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}

function money(minor: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(minor / 100);
}

export async function sendManualFundingNotification(input: ManualFundingNotification): Promise<EmailNotificationResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) return { status: "not_configured", provider: "resend", errorCode: "missing_email_configuration" };

  const safe = {
    reference: escapeHtml(input.reference),
    amount: escapeHtml(money(input.amountMinor)),
    depositorName: escapeHtml(input.depositorName),
    transferReference: escapeHtml(input.transferReference || "Not supplied"),
    customerEmail: escapeHtml(input.customerEmail || "Not supplied"),
    reviewUrl: escapeHtml(input.reviewUrl),
  };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `manual-funding/${input.reference}`,
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: `New manual transfer proof — ${input.reference}`,
        text: [
          "A customer submitted a new manual wallet-funding proof.",
          `Reference: ${input.reference}`,
          `Amount: ${money(input.amountMinor)}`,
          `Depositor: ${input.depositorName}`,
          `Customer email: ${input.customerEmail || "Not supplied"}`,
          `Bank reference: ${input.transferReference || "Not supplied"}`,
          `Review: ${input.reviewUrl}`,
          "Verify the transfer in the admin dashboard before approving any wallet credit.",
        ].join("\n"),
        html: `<div style="background:#f4f7fb;padding:32px;font-family:Arial,sans-serif;color:#10233b"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #dce6ef;border-radius:18px;padding:28px"><p style="margin:0;color:#078df2;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Nextlogs manual funding</p><h1 style="margin:10px 0 8px;font-size:24px">New payment proof received</h1><p style="margin:0 0 24px;color:#64748b;line-height:1.6">A customer submitted a bank-transfer proof. Verify the payment before approving any wallet credit.</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:10px 0;color:#64748b">Reference</td><td style="padding:10px 0;text-align:right;font-weight:700">${safe.reference}</td></tr><tr><td style="padding:10px 0;color:#64748b">Amount</td><td style="padding:10px 0;text-align:right;font-weight:700">${safe.amount}</td></tr><tr><td style="padding:10px 0;color:#64748b">Depositor</td><td style="padding:10px 0;text-align:right;font-weight:700">${safe.depositorName}</td></tr><tr><td style="padding:10px 0;color:#64748b">Customer</td><td style="padding:10px 0;text-align:right;font-weight:700">${safe.customerEmail}</td></tr><tr><td style="padding:10px 0;color:#64748b">Bank reference</td><td style="padding:10px 0;text-align:right;font-weight:700">${safe.transferReference}</td></tr></table><a href="${safe.reviewUrl}" style="display:block;margin-top:24px;border-radius:10px;background:#078df2;padding:13px 18px;color:#fff;text-align:center;text-decoration:none;font-weight:700">Review payment proof</a></div></div>`,
      }),
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
