# BloomSMS integration readiness

## Current state

- BloomSMS is wired as the customer-facing provider for temporary activations and long-term rentals.
- Telnyx and SMSPool code and historical records are preserved for rollback and reconciliation, but their customer experiences are hidden.
- New legacy-provider purchases are additionally locked by `LEGACY_SMS_PROVIDERS_ENABLED=false`; status and message retrieval for historical orders remain available.
- Exact-number selection is not shown because BloomSMS assigns a number only after accepting an activation.
- Purchases are disabled by default with `BLOOMSMS_PURCHASES_ENABLED=false`.
- Catalogue, pricing and stock come from the live BloomSMS API and are not fabricated.
- Wallet reservation, idempotency and confirmed-failure refunds run server-side.
- Provider timeouts and incomplete responses remain `processing`; they are not automatically refunded.
- Incoming messages are retrieved by authenticated polling. The public BloomSMS documentation does not document webhook-signature verification, so webhook payloads are not trusted as a settlement source.

## Required environment variables

```env
BLOOMSMS_API_URL=https://bloomsms.com/api/v1
BLOOMSMS_API_KEY=
BLOOMSMS_USD_NGN_RATE=
BLOOMSMS_MARKUP_PERCENT=20
BLOOMSMS_FIXED_MARKUP_NGN=2000
BLOOMSMS_PURCHASES_ENABLED=false
```

`BLOOMSMS_USD_NGN_RATE` must be a deliberate operational exchange rate. Prices are calculated on the server from the provider USD price and configured rate. When `BLOOMSMS_FIXED_MARKUP_NGN` is set, that fixed naira amount is added to every temporary-number and rental product; otherwise `BLOOMSMS_MARKUP_PERCENT` is used as the fallback.

## Before enabling purchases

1. Add the API key and pricing variables to the intended Vercel environments.
2. Deploy the updated Firestore indexes and rules.
3. Use the admin provider health check to confirm balance, countries and service catalogue access.
4. Confirm country/service stock and NGN retail prices in the customer UI.
5. Obtain written clarification from BloomSMS about webhook signing, provider idempotency, reseller authorization and long-rental country coverage.
6. Fund the provider account with only the minimum test amount.
7. Obtain explicit approval before one real temporary activation and one real long-rental test.
8. Verify assignment, polling, SMS receipt, cancellation behavior, wallet ledger and admin monitoring.
9. Keep the older providers and records until every legacy order/rental is final.
10. Set `BLOOMSMS_PURCHASES_ENABLED=true` only after all funded tests pass.

## Tests that require a funded BloomSMS account

- Actual number assignment.
- Receiving a real inbound SMS.
- Provider-confirmed cancellation and provider-balance refund.
- Long-rental creation, message receipt and expiry.
- Provider insufficient-balance and live-stock race behavior under real ordering conditions.
