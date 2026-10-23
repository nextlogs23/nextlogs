export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ?.replace(/\\n/g, "\n")
    .trim();

  const checks = {
    projectId: Boolean(projectId),
    clientEmail: Boolean(clientEmail && clientEmail.endsWith(".gserviceaccount.com")),
    privateKey: Boolean(
      privateKey &&
        privateKey.startsWith("-----BEGIN PRIVATE KEY-----") &&
        privateKey.endsWith("-----END PRIVATE KEY-----")
    ),
  };

  if (!Object.values(checks).every(Boolean)) {
    return Response.json(
      {
        ready: false,
        code: "invalid_environment",
        checks,
        error: "Firebase Admin environment variables are missing or incorrectly formatted.",
      },
      { status: 503 }
    );
  }

  try {
    // Keep the SDK import inside the guarded block so deployment/runtime loading
    // failures are returned as a safe diagnostic instead of an empty 500.
    const { adminDb } = await import("@/lib/server/firebase-admin");
    await adminDb().collection("users").limit(1).get();
    return Response.json({ ready: true, checks });
  } catch (error) {
    console.error("Firebase Admin health check failed", error);
    return Response.json(
      {
        ready: false,
        code: "firebase_admin_unavailable",
        checks,
        error: "Firebase Admin could not connect with the configured service account.",
      },
      { status: 503 }
    );
  }
}
