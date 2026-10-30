import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { adminStorage } from "@/lib/server/firebase-admin";

export const runtime = "nodejs";

const MAX_ICON_BYTES = 1024 * 1024;

function detectedImageType(bytes: Buffer) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", extension: "png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", extension: "webp" };
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const form = await request.formData();
    const upload = form.get("icon");
    if (!(upload instanceof File)) throw Object.assign(new Error("Choose an icon image to upload"), { status: 400 });
    if (upload.size < 32 || upload.size > MAX_ICON_BYTES) throw Object.assign(new Error("Product icons must be smaller than 1 MB"), { status: 400 });

    const bytes = Buffer.from(await upload.arrayBuffer());
    const image = detectedImageType(bytes);
    if (!image) throw Object.assign(new Error("Only genuine PNG, JPEG, or WebP images are accepted"), { status: 400 });

    const bucket = adminStorage().bucket();
    if (!bucket.name) throw Object.assign(new Error("Firebase Storage is not configured"), { status: 503 });
    const token = randomUUID();
    const objectPath = `marketplace/product-icons/${Date.now()}-${randomUUID()}.${image.extension}`;
    await bucket.file(objectPath).save(bytes, {
      resumable: false,
      validation: "md5",
      contentType: image.mime,
      metadata: {
        cacheControl: "public,max-age=31536000,immutable",
        metadata: { firebaseStorageDownloadTokens: token, uploadedBy: admin.uid },
      },
    });

    const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
    return Response.json({ url });
  } catch (error) {
    return routeError(error);
  }
}
