import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { requireAdmin, routeError } from "@/lib/server/auth";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const allowedExtensions = new Set(["pdf", "zip", "docx", "xlsx", "pptx", "txt", "csv", "png", "jpg", "jpeg", "webp"]);
const allowedTypes = new Set([
  "application/pdf", "application/zip", "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "image/png", "image/jpeg", "image/webp",
]);

function safeName(value: string) {
  return value.normalize("NFKC").replace(/[^a-zA-Z0-9._ -]/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "download";
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const form = await request.formData();
    const upload = form.get("file");
    if (!(upload instanceof File)) throw Object.assign(new Error("Choose a product file to upload"), { status: 400 });
    if (upload.size < 1 || upload.size > MAX_FILE_BYTES) throw Object.assign(new Error("Product files must be 10 MB or smaller"), { status: 400 });
    const fileName = safeName(upload.name);
    const extension = fileName.split(".").pop()?.toLowerCase() || "";
    if (!allowedExtensions.has(extension) || !allowedTypes.has(upload.type)) throw Object.assign(new Error("Use a PDF, ZIP, Office document, text, CSV, PNG, JPEG, or WebP file"), { status: 400 });

    const bytes = Buffer.from(await upload.arrayBuffer());
    const pathname = `marketplace/product-files/${Date.now()}-${randomUUID()}.${extension}`;
    const blob = await put(pathname, bytes, { access: "private", contentType: upload.type, addRandomSuffix: false, cacheControlMaxAge: 60 * 60 });
    return Response.json({ file: { pathname: blob.pathname, fileName, contentType: upload.type, size: upload.size, uploadedBy: admin.uid } });
  } catch (error) {
    return routeError(error);
  }
}
