import "server-only";

import { adminDb } from "./firebase-admin";

export type ManualFundingSettings = {
  enabled: boolean;
  bankName: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
  minimumAmountMinor: number;
};

export const defaultManualFundingSettings: ManualFundingSettings = {
  enabled: false,
  bankName: "",
  accountName: "",
  accountNumber: "",
  instructions: "Transfer the exact amount and upload a clear payment receipt for review.",
  minimumAmountMinor: 10000,
};

export async function getManualFundingSettings(): Promise<ManualFundingSettings> {
  const snapshot = await adminDb().collection("platformSettings").doc("manualFunding").get();
  const data = snapshot.data();
  return {
    enabled: data?.enabled === true,
    bankName: typeof data?.bankName === "string" ? data.bankName : "",
    accountName: typeof data?.accountName === "string" ? data.accountName : "",
    accountNumber: typeof data?.accountNumber === "string" ? data.accountNumber : "",
    instructions: typeof data?.instructions === "string" ? data.instructions : defaultManualFundingSettings.instructions,
    minimumAmountMinor: Number.isSafeInteger(data?.minimumAmountMinor) && Number(data?.minimumAmountMinor) >= 10000 ? Number(data?.minimumAmountMinor) : defaultManualFundingSettings.minimumAmountMinor,
  };
}

export function manualFundingReady(settings: ManualFundingSettings) {
  return settings.enabled && Boolean(settings.bankName && settings.accountName && settings.accountNumber);
}
