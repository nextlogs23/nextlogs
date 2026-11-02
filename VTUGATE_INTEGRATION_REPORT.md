# VTUGATE Integration Report

## Outcome

The website VTU provider has been changed from VTpass to VTUGATE without rebuilding the wallet, authentication, transaction ledger, customer dashboard, or administrator dashboard.

The integration uses VTUGATE's server-side Bearer Token API at `https://api.vtugate.com`. Secrets are never returned to the browser. The former VTpass-specific successful-integration request ID requirement is no longer used.

## Implemented services

- Airtime purchases
- Live data-plan retrieval and data purchases
- Electricity provider retrieval, meter verification, purchases, and returned prepaid-token display
- Cable provider retrieval, smartcard verification, plan retrieval, and purchases
- Provider transaction requery and administrator reconciliation
- Administrator order monitoring, provider health, service availability, and pricing configuration

## Transaction safety

- Every order has a unique internal reference and a stable VTUGATE `client_reference`.
- Wallet reservation is atomic and idempotent.
- Repeated purchase requests reuse the existing reservation instead of creating another debit.
- Confirmed provider failures receive one idempotent refund.
- Timeouts and uncertain responses remain `processing` until provider requery establishes a final result.
- A top-level successful API request cannot override a failed transaction status.
- Airtime is capped at NGN 5,000 because VTUGATE can split larger airtime requests; partial settlement is intentionally not enabled.

## Verification completed

- TypeScript check: passed.
- VTUGATE readiness tests: passed.
- ESLint: passed with pre-existing warnings and no errors.
- Next.js production build: passed using an isolated Windows build directory to avoid a local `.next` EPERM lock.
- No real provider purchase was made.
- `VTUGATE_PURCHASES_ENABLED` remains `false`.

## Configuration required

Configure these server-only variables in Vercel for Preview and Production:

```text
VTU_PROVIDER=vtugate
VTUGATE_ENV=test
VTUGATE_API_URL=https://api.vtugate.com
VTUGATE_API_KEY=YOUR_VTUGATE_TEST_KEY
VTUGATE_MARKUP_PERCENT=0
VTUGATE_REQUEST_TIMEOUT_MS=15000
VTUGATE_PURCHASES_ENABLED=false
```

Do not prefix the API key with `NEXT_PUBLIC_`.

## Outstanding production checks

1. Deploy to a Vercel Preview environment with the VTUGATE Test API Key.
2. Use the administrator provider-health action to verify authentication and service discovery.
3. Verify live data and cable catalogues and electricity-provider discovery.
4. Verify valid and invalid meter and smartcard lookups using VTUGATE test values.
5. Test successful, failed, pending, duplicate, timeout, requery, and confirmed-refund scenarios.
6. Reconcile each test against the wallet ledger, generic transaction record, service order, and VTUGATE transaction history.
7. Review administrator pricing and service availability before accepting customer orders.
8. Replace the test key with the approved live key and set `VTUGATE_ENV=live` only after VTUGATE production access is approved.
9. Keep `VTUGATE_PURCHASES_ENABLED=false` until explicit approval is given to activate live purchases.

Tests that create actual airtime, data, electricity, or cable orders require a funded or otherwise transaction-enabled VTUGATE account. Catalogue retrieval and provider account/health checks do not require a customer wallet debit, though VTUGATE may still restrict them based on the API key's permissions.
