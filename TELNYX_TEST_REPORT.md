# Telnyx production-readiness report

Date: 2026-10-24

## Safety state

- `TELNYX_PURCHASES_ENABLED=false` remains the documented default.
- No real number purchase was made during this review.
- SMSPool remains available as the alternative provider.
- Telnyx secrets are server-only and no `NEXT_PUBLIC_TELNYX_*` variable is used.

## Local verification results

- Strict TypeScript check: passed.
- Telnyx readiness tests: 6 passed, 0 failed.
- SMSPool regression tests: 6 passed, 0 failed.
- Next.js production build: passed for all 52 routes.
- Client bundle secret-name scan: no Telnyx API-key or public-key variable reference found.
- The initial Windows build failed when the restricted process attempted concurrent output-directory creation. Clearing only generated build output and running the build outside that restricted filesystem context resolved the `EPERM`; no source workaround is required for Vercel.
- The local workspace contains only `.env.example`, not actual Telnyx credential values. Therefore the live read-only API test must run in the configured Vercel environment after deployment.

## Verified in code and automated checks

- The application expects `TELNYX_API_KEY` for API authentication and `TELNYX_PUBLIC_KEY` for webhook verification.
- The number search requests live Telnyx inventory filtered for SMS capability and returns exact phone numbers with server-calculated NGN retail pricing.
- Search offers are short-lived and bound to the authenticated customer before purchase.
- The customer chooses and previews the exact number returned by Telnyx before ordering.
- Purchases use an atomic wallet reservation, a stable application reference, Telnyx's `Idempotency-Key`, and an atomic provider-order record to prevent duplicate submission.
- Confirmed synchronous failures, failed status polling, and failed order webhooks use the idempotent atomic refund path.
- Incoming webhook payloads are read as raw text and verified by the Telnyx SDK with `TELNYX_PUBLIC_KEY` before processing.
- Webhook event IDs are persisted for deduplication.
- Incoming messages are mapped through the purchased number, stored with its owner UID, and returned only after the order route verifies that the caller owns the order.
- Firestore client rules deny direct access to wallet, Telnyx order, offer, purchased-number, inbound-message, and webhook-event collections.
- Required composite indexes exist for customer order history and inbox queries.
- The admin Telnyx health route is admin-protected and can perform read-only credential, inventory-search, and messaging-profile checks without returning secrets or balances.

## Deployment probes completed

- Unauthenticated customer number search: rejected with HTTP 401.
- Unauthenticated customer order history: rejected with HTTP 401.
- Unauthenticated admin Telnyx health check: rejected with HTTP 401.
- Unsigned Telnyx webhook request: rejected with HTTP 401.

## Checks requiring the configured Vercel environment

After this revision is deployed, an authenticated administrator must open **Admin → API providers → Telnyx → Test connection**. The protected test performs only read operations:

1. Retrieve account balance metadata to verify `TELNYX_API_KEY` authentication (the balance is not returned to the browser).
2. Search one US SMS-capable number to verify inventory access.
3. Retrieve `TELNYX_MESSAGING_PROFILE_ID`, when configured.

The public key cannot be positively validated by a read-only Telnyx API request. Configure the production messaging profile webhook URL as:

`https://nextlogs-alpha.vercel.app/api/webhooks/telnyx`

Then send a Telnyx test inbound-message webhook and confirm it is accepted and displayed only for the owning test account.

## Account-level purchasing restrictions

Telnyx applies account-verification, geography, product, regulatory, and inventory restrictions. The public API key test and inventory search establish API access but do not prove that every displayed number can be purchased. Confirm the account tier/verification status in the Telnyx Mission Control Portal and complete any required identity or regulatory verification. A controlled low-cost purchase is the final purchase-permission test and requires explicit owner approval.

## Go-live requirements

- Add `TELNYX_PUBLIC_KEY` to Vercel Production, Preview, and Development scopes as appropriate, using the Base64 public key from Telnyx.
- Confirm `TELNYX_API_KEY`, `TELNYX_MESSAGING_PROFILE_ID`, and a current `TELNYX_USD_NGN_RATE` are configured in the same Vercel environment.
- Keep `TELNYX_PURCHASES_ENABLED=false` until every item below passes.
- Run the protected admin connection test after deployment and require: `connection=connected`, inventory search not failed, and messaging profile available.
- Configure the production webhook URL on the same Telnyx Messaging Profile used for number orders.
- Perform a Telnyx-signed test webhook and verify an unsigned request remains rejected.
- Confirm the Telnyx account verification/tier allows the countries and number types offered to customers.
- With explicit approval, fund a dedicated test wallet and perform one low-cost number purchase, one inbound SMS, one duplicate retry, and one provider-permitted failure/refund test.
- Verify the resulting wallet ledger, customer history, purchased-number inbox, Telnyx order, platform transaction, and admin order monitor against provider records.
- Deploy `firestore.rules` and `firestore.indexes.json` to the production Firebase project if they are not already deployed.
- Reconcile pricing and renewals: the current retail price includes the Telnyx upfront and first monthly cost. Define recurring renewal, release, and insufficient-balance policies before selling renewable numbers.
- Only after acceptance testing, set `TELNYX_PURCHASES_ENABLED=true` and redeploy. Roll back to `false` if monitoring detects provisioning or webhook failures.
