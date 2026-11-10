import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { accsZoneError, getAccsZoneSubcategories, projectSubcategories } from "@/lib/server/accszone";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const categorySchema = z.string().trim().min(1).max(240).regex(/^[A-Za-z0-9][A-Za-z0-9 ._:/+()\-]*$/);

export async function GET(request: NextRequest, { params }: { params: Promise<{ category: string }> }) {
  try {
    await requireAdmin(request);
    const { category } = await params;
    const parsed = categorySchema.safeParse(category);
    if (!parsed.success) return Response.json({ error: "Invalid category", code: "ACCSZONE_INVALID_INPUT" }, { status: 400, headers });
    return Response.json({ subcategories: projectSubcategories(await getAccsZoneSubcategories(parsed.data)) }, { headers });
  } catch (error) {
    const value = accsZoneError(error);
    return Response.json({ error: value.message, code: value.code }, { status: value.status || 502, headers });
  }
}
