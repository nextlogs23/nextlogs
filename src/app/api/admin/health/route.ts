export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function diagnosticCode(error: unknown) {
  const value = error as { code?: string | number; message?: string };
  const code = String(value?.code ?? "").toLowerCase();
  const message = String(value?.message ?? "").toLowerCase();
  const detail = `${code} ${message}`;

  if (detail.includes("permission-denied") || detail.includes("permission_denied") || code === "7") {
    return "permission_denied";
  }
  if (detail.includes("not-found") || detail.includes("not_found") || code === "5") {
    return "resource_not_found";
  }
  if (
    detail.includes("invalid_grant") ||
    detail.includes("invalid-credential") ||
    detail.includes("unauthenticated") ||
    code === "16"
  ) {
    return "invalid_service_account";
  }
  return "connection_failed";
}

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
    const { adminAuth, adminDb } = await import("@/lib/server/firebase-admin");

    try {
      await adminAuth().listUsers(1);
    } catch (error) {
      console.error("Firebase Admin Authentication health check failed", error);
      return Response.json(
        {
          ready: false,
          code: "firebase_auth_unavailable",
          reason: diagnosticCode(error),
          checks,
          error: "The Firebase service account could not access Firebase Authentication.",
        },
        { status: 503 }
      );
    }

    try {
      await adminDb().collection("users").limit(1).get();
    } catch (error) {
      console.error("Firebase Admin Firestore health check failed", error);
      return Response.json(
        {
          ready: false,
          code: "firestore_unavailable",
          reason: diagnosticCode(error),
          checks,
          error: "The Firebase service account could not access Cloud Firestore.",
        },
        { status: 503 }
      );
    }

    return Response.json({ ready: true, checks, services: { authentication: true, firestore: true } });
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
