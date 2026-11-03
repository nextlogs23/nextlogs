"use client";

import { auth } from "@/lib/firebase/client";

const extensionByType: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "text/csv": ".csv",
  "text/plain": ".txt",
};

function safeFileName(value: string) {
  return value.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim().slice(0, 120) || "download";
}

function responseFileName(header: string | null) {
  if (!header) return null;
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return safeFileName(decodeURIComponent(encoded)); } catch { /* use the regular filename */ }
  }
  const regular = header.match(/filename="([^"]+)"/i)?.[1] || header.match(/filename=([^;]+)/i)?.[1];
  return regular ? safeFileName(regular) : null;
}

export async function downloadAuthenticatedFile(path: string, fallbackName = "download") {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in again before downloading this file");

  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const contentType = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() || "application/octet-stream";
  if (!response.ok || contentType === "application/json") {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "The purchased file could not be downloaded");
  }

  const blob = await response.blob();
  let fileName = responseFileName(response.headers.get("Content-Disposition")) || safeFileName(fallbackName);
  if (!/\.[a-z0-9]{1,8}$/i.test(fileName) && extensionByType[contentType]) fileName += extensionByType[contentType];

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
