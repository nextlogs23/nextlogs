# VTpass integration report

## Safety state

- Environment defaults to `sandbox`.
- `VTPASS_PURCHASES_ENABLED=false` is the required default and remains the deployment safety lock.
- VTpass API, public and secret keys are server-only. No `NEXT_PUBLIC_VTPASS_*` variable exists.
- Telnyx, SMSPool, Paystack and Firebase integrations were preserved.

## Implemented

- Official VTpass GET authentication (`api-key` + `public-key`) and POST authentication (`api-key` + `secret-key`).
- Dynamic data-plan retrieval for MTN, Airtel, Glo and 9mobile.
- Dynamic electricity-provider retrieval and prepaid/postpaid meter verification.
- Airtime, data and electricity purchase payloads through `/api/pay`.
- Lagos-time VTpass request IDs, client idempotency keys and atomic wallet reservation.
- Server-side provider cost and configurable percentage/flat-fee retail pricing.
- Pending/timeout handling without premature refunds, plus `/api/requery` reconciliation.
- Confirmed-failure refund ledger entries, duplicate-refund protection and audit records.
- Electricity tokens are displayed only when returned by VTpass; printable/downloadable receipts are available.
- Customer transaction history and protected admin order monitoring, cost, margin, availability and pricing controls.

## Automated checks

Run:

```bash
npm run test:vtpass
npm run typecheck
npm run build
```

Verified on 27 October 2026:

- `npm run lint`: passed with no errors (10 pre-existing unused-code/style warnings remain).
- `npm run typecheck`: passed.
- `npm run test:smspool`: 6/6 passed.
- `npm run test:telnyx`: 6/6 passed.
- `npm run test:marketplace`: 8/8 passed.
- `npm run test:vtpass`: passed (authentication, dynamic catalogues, service identifiers, safety lock, requery/refund rules, admin protection and Firestore denials).
- `npm run build`: passed; all 61 pages were generated and every new VTpass route was included.
- Client/static bundle scan: no VTpass credential variable or authentication-header references were found.
- Firestore rules cover both new VTpass operational collections. The implemented admin/order queries use document lookups or single-field ordering/filtering, so no new composite index is required.

The Windows `EPERM` error was isolated to the restricted build runner creating nested `.next` directories. A clean build outside that filesystem restriction completed successfully; the stale generated folder was safely removed.

`npm audit fix` removed the high-severity `node-forge` advisory. Eight moderate transitive `uuid` advisories remain in the pinned Firebase Admin dependency tree. The automatic fix requires a breaking Firebase Admin 14 upgrade, so that upgrade was not forced during this integration.

## Credential-dependent sandbox tests

These require valid VTpass sandbox API/public/secret keys and must be run with a funded test user wallet. Purchase tests additionally require a deliberate temporary opt-in using `VTPASS_PURCHASES_ENABLED=true` in a non-production sandbox deployment:

- successful and failed airtime;
- successful data and invalid variation code;
- valid/invalid meter verification and successful electricity vending;
- VTpass pending, timeout and no-response test numbers;
- provider-confirmed failure refund;
- concurrent wallet requests against the Firebase project.

The current local workspace has no `.env.local`, so authenticated read-only VTpass catalogue and meter checks could not be executed from this machine. No real or sandbox purchase was made by this implementation session.

Read-only country/service/variation retrieval and meter verification do not require a funded VTpass production wallet, but they do require valid sandbox credentials. Sandbox purchase scenarios require sandbox POST credentials, the safety lock to be temporarily enabled with owner approval, and a funded customer test wallet in Firestore. Only production purchases require an approved and funded live VTpass account.

## Production go-live checklist

- Complete every sandbox matrix case above and retain the provider responses/references.
- Confirm VTpass production account approval, wallet funding, commission schedule and applicable minimum/maximum amounts.
- Set production credentials in Vercel, set `VTPASS_ENV=production`, and remove any sandbox URL override.
- Configure and review a retail markup/fee for every enabled service ID.
- Add operational monitoring for transactions remaining `processing`, then reconcile them before refunding.
- Deploy `firestore.rules` and review Firestore indexes in the target Firebase project.
- Perform authenticated mobile/desktop acceptance tests and verify receipts/tokens.
- Obtain explicit owner approval before setting `VTPASS_PURCHASES_ENABLED=true` in production.
