# Nextlogs

Production-oriented SMS verification and Nigerian VTU platform built with Next.js App Router, TypeScript, Tailwind CSS, Firebase and Paystack. The interface includes the marketing site, Firebase authentication, customer workspace and administrator control centre.

## What is implemented

- Premium responsive landing page and mobile navigation
- Firebase email/password registration, verification, sign-in and password reset
- Customer dashboard for SMS rentals, airtime, data, electricity, wallet funding, transactions, notifications, profile and support
- Admin dashboard for users, orders, wallet activity, providers, pricing, analytics and settings
- Firebase Admin bearer-token verification and role checks
- Atomic, idempotent wallet ledger with negative-balance protection
- Signed Paystack webhook plus server-to-server payment verification
- Server-only Telnyx number search, purchase, provisioning and inbound SMS integration
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

## Telnyx number and SMS integration

Set `TELNYX_API_KEY`, `TELNYX_PUBLIC_KEY`, `TELNYX_MESSAGING_PROFILE_ID`, and `TELNYX_USD_NGN_RATE` in Vercel. `TELNYX_NUMBER_MARKUP_PERCENT` controls the server-side retail markup. Search results are saved as short-lived, user-bound offers, so the browser never determines the number or price charged.

Register this signed webhook in the Telnyx Mission Control Portal:

```text
https://YOUR_DOMAIN/api/webhooks/telnyx
```

Keep `TELNYX_PURCHASES_ENABLED=false` while testing search, authentication, webhook signatures, Firebase rules, and the user/admin displays. Set it to `true` only when the messaging profile, webhook and NGN conversion rate have been verified in production. Number orders use a stable idempotency key, and provider availability failures are refunded through the wallet ledger. Ambiguous provider timeouts stay in processing for reconciliation rather than being incorrectly refunded.

Incoming messages are accepted only after Telnyx Ed25519 signature verification. They are matched to a server-owned purchased-number record and returned only through an authenticated owner-checked API. Do not use the service for automated account creation, verification bypass, or any destination prohibited by Telnyx or applicable law.

## SMSPool alternative provider

Set `SMSPOOL_API_KEY`, `SMSPOOL_USD_NGN_RATE`, and `SMSPOOL_MARKUP_PERCENT` in Vercel. Keep `SMSPOOL_PURCHASES_ENABLED=false` until the test checklist below is complete. Authentication and purchases are performed only in server routes; the key is never returned to the browser.

The integration follows the official OpenAPI specification at `https://api.smspool.net/docs`: country and service catalogues, suggested pools, stock and pricing, one-time SMS ordering/status/cancellation, and rental ordering/status/messages/refunds. SMSPool does **not** expose a browsable list of exact numbers before purchase. Although its purchase endpoint accepts a `phonenumber` field when a number is already known, the public inventory endpoints do not return exact numbers. The UI therefore shows that SMSPool assigns the number after accepting the purchase; Telnyx remains available for exact-number selection.

Prices are converted from provider USD to wallet NGN using `SMSPOOL_USD_NGN_RATE`, then marked up using `SMSPOOL_MARKUP_PERCENT`. Offers are short-lived and bound to the authenticated user. The server ignores client prices, uses a stable wallet reference for duplicate protection, caps the provider request at the quoted USD price, and refunds only after a definite provider failure or confirmed cancellation/refund. Ambiguous timeouts remain `processing` for administrator reconciliation.

### SMSPool test checklist

1. Keep `SMSPOOL_PURCHASES_ENABLED=false` and confirm protected catalogue, service, pool/stock, price and rental endpoints load for an authenticated test user.
2. Confirm unauthenticated catalogue/order/admin requests return `401`, and one user cannot read another user's order reference.
3. Confirm expired offer IDs and manipulated prices cannot be purchased.
4. Confirm repeated requests with the same idempotency key create one wallet debit and at most one provider order.
5. In a controlled SMSPool test account, enable purchases temporarily and place the smallest permitted one-time order; verify actual provider cost, assigned number, expiry, status transitions and real SMS retrieval.
6. Test a provider-confirmed cancellation before SMS receipt and verify exactly one wallet refund. Test duplicate cancellation/status polling and confirm no duplicate credit.
7. Place the smallest eligible rental; verify activation, expiry, real message retrieval, provider refund rules and exactly one refund when confirmed.
8. Simulate timeout/5xx responses and verify the order stays `processing` without an automatic refund until reconciled.
9. Verify admin monitoring shows provider reference, retail amount, provider cost, status and expiry without exposing the API key.
10. Reconcile wallet ledger, generic transaction, SMSPool order and provider history records before leaving purchases enabled.

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
5. Register the production Paystack and Telnyx webhooks.
6. Deploy the updated Firestore rules and indexes.
7. Test Telnyx search and signed webhook delivery with `TELNYX_PURCHASES_ENABLED=false`.
8. Run payment tests end-to-end, including duplicate-webhook, timeout and refund reconciliation tests.
9. Only then enable live purchases.

All secret variables must remain unprefixed; only Firebase web configuration and the public application URL use `NEXT_PUBLIC_*`.
