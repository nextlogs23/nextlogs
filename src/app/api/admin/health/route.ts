import { adminDb } from "@/lib/server/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await adminDb().collection("users").limit(1).get();
    return Response.json({ ready: true });
  } catch (error) {
    console.error("Firebase Admin health check failed", error);
    return Response.json({ ready: false, error: "Firebase Admin credentials are invalid or incomplete in the server environment." }, { status: 503 });
  }
}
