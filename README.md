# DMB Logs Portal

Production-oriented SMS verification and Nigerian VTU platform built with Next.js App Router, TypeScript, Tailwind CSS, Firebase and Paystack. The interface includes the marketing site, Firebase authentication, customer workspace and administrator control centre.

## What is implemented

- Premium responsive landing page and mobile navigation
- Firebase email/password registration, verification, sign-in and password reset
- Customer dashboard for SMS rentals, airtime, data, electricity, wallet funding, transactions, notifications, profile and support
- Admin dashboard for users, orders, wallet activity, providers, pricing, analytics and settings
- Firebase Admin bearer-token verification and role checks
- Atomic, idempotent wallet ledger with negative-balance protection
- Signed Paystack webhook plus server-to-server payment verification
- Server-only provider interfaces for SMS and VTU services
- Rate limits, input validation, immutable audit logs and strict Firestore rules
- Vercel-compatible build and environment configuration

Mock provider successes are intentionally not included. Until a real provider adapter and credentials are configured, purchase routes return a clear `503` and the UI never reports delivery.

## Local setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and fill the Firebase web and Admin values. The local preview in this workspace uses `http://127.0.0.1:3027`.
3. In Firebase Authentication, enable Email/Password and configure your authorized domains.
4. Run `npm run dev`, then open `http://localhost:3000`.
5. Run `npm run typecheck` and `npm run build` before deployment.

## Firebase

Create a Firebase web app and a service account. Put public web config in the `NEXT_PUBLIC_FIREBASE_*` variables. Keep the Admin service-account values server-only. The browser configuration alone enables Firebase Authentication in the UI, but protected API routes also require `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, and `FIREBASE_ADMIN_PRIVATE_KEY`. Deploy the included rules and indexes:

```bash
firebase deploy --project YOUR_PROJECT_ID --only firestore:rules,firestore:indexes
```

The first administrator should be promoted out-of-band using the Firebase Admin SDK or console by setting `users/{uid}.role` to `admin`. Never allow clients to assign roles.

## Paystack

Use a test secret first. Set the Paystack webhook to:

```text
https://YOUR_DOMAIN/api/paystack/webhook
```

The webhook validates the `x-paystack-signature`, verifies the transaction again with Paystack, checks reference, currency and amount, then creates one idempotent wallet credit.

## SMS provider integration

Implement `SmsProvider` in `src/lib/server/providers.ts` using a legitimate number provider. Map only provider-approved countries and destination services. The adapter must return actual numbers and actual inbound messages. Add webhook handling if supported; otherwise poll `/api/sms/orders/{reference}` conservatively. Do not add synthetic messages or successful responses.

Enforce your provider's acceptable-use policy, identity requirements, purchase limits, expiry and refund rules. The included daily server-side limiter is a baseline, not a replacement for fraud monitoring.

## VTU integration

Implement `VtuProvider` in `src/lib/server/providers.ts` for VTpass or another compatible provider. Use the provider's sandbox first. Data plans must be retrieved live. Meter ownership must be validated before electricity payment. Persist the provider reference and raw provider status, and show prepaid tokens only when returned by a confirmed successful provider response.

If a provider request times out after the wallet debit, leave the transaction in a review/processing state and reconcile with the provider before refunding. Never assume a timeout is a failure.

## Pricing

Pricing documents live in `servicePricing` and are read only on the server. For each offer store `providerCostMinor`, `retailPriceMinor`, `enabled`, `provider`, and `updatedAt`. SMS purchase re-fetches provider availability and compares the submitted price with the server price. Apply the same pattern when completing a live VTU adapter.

## Deploy to Vercel

1. Import this `nevora-connect` directory as the Vercel project root.
2. Add every required environment variable for Preview and Production.
3. Set `NEXT_PUBLIC_APP_URL` to the deployed HTTPS origin.
4. Deploy Firestore rules/indexes.
5. Register the production Paystack webhook.
6. Run sandbox transactions end-to-end, including duplicate-webhook, timeout and refund reconciliation tests.
7. Only then switch to live provider credentials.

All secret variables must remain unprefixed; only Firebase web configuration and the public application URL use `NEXT_PUBLIC_*`.
