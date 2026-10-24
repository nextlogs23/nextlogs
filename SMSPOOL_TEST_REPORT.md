# SMSPool integration test report

Original implementation review: 23 October 2026<br>
Production-readiness re-test: 24 October 2026

## Safety state

- `SMSPOOL_PURCHASES_ENABLED` defaults to `false`.
- No real SMSPool order or rental was placed during implementation.
- Telnyx routes, records and customer provider option remain present.
- SMSPool credentials are read only in `src/lib/server/smspool.ts` and protected health routes return booleans, never secret values.

## Official API capability review

Source: SMSPool OpenAPI specification served by `https://api.smspool.net/openapi.json` and documented at `https://api.smspool.net/docs`.

| Capability | Official endpoint | Implementation | Result |
| --- | --- | --- | --- |
| Countries | `GET /country/retrieve_all` | `/api/smspool/catalog` | Implemented |
| Services | `GET /service/retrieve_all` | `/api/smspool/catalog?country=` | Implemented |
| Pools, stock and price | `POST /pool/retrieve_valid` | `/api/smspool/offers` | Implemented |
| One-time order | `POST /purchase/sms` | `/api/smspool/orders` | Implemented, safety-locked |
| SMS and status | `POST /sms/check` | `/api/smspool/orders/[reference]` | Implemented |
| Cancellation | `POST /sms/cancel` | `DELETE /api/smspool/orders/[reference]` | Implemented |
| Rental catalogue | `POST /rental/retrieve_all` | `/api/smspool/rentals/catalog` | Implemented |
| Rental order | `POST /purchase/rental` | `/api/smspool/rentals` | Implemented, safety-locked |
| Rental status/messages | `POST /rental/retrieve_status`, `/rental/retrieve_messages` | `/api/smspool/rentals/[reference]` | Implemented |
| Rental refund | `POST /rental/refund` | `DELETE /api/smspool/rentals/[reference]` | Implemented |

### Exact-number selection finding

SMSPool does not document an endpoint that lists exact available phone numbers before purchase. `/purchase/sms` contains an optional `phonenumber` input for a number already known to the caller, but the documented country, service, pool, stock and pricing endpoints do not expose exact numbers. The customer interface therefore states that SMSPool assigns the number after purchase. Telnyx remains the exact-number provider.

## Automated validation

| Check | Result |
| --- | --- |
| TypeScript (`npm run typecheck`) | Passed |
| Client secret search | Passed: API key referenced only in server code/config documentation |
| Browser-provided price trust | Passed: server reloads user-bound, expiring offer documents |
| Duplicate wallet debit protection | Passed by design: stable reference plus atomic wallet ledger |
| Duplicate provider order protection | Passed by design: order document is created before provider call; retries return existing state |
| Known provider failure refunds | Implemented with idempotent `-REFUND` ledger reference |
| Ambiguous timeout handling | Implemented: remains `processing`, no automatic refund |
| Owner isolation | Implemented on every customer order/rental status and mutation route |
| Admin monitoring | Implemented for one-time orders and rentals |
| Firestore direct client access | Denied by rules |
| Production compilation | Passed on 24 October 2026; all 52 static pages and API routes compiled |

## Configuration status

The local environment does not currently contain `SMSPOOL_API_KEY` or `SMSPOOL_USD_NGN_RATE`, so authenticated live catalogue and controlled purchase tests could not be executed. Firebase Admin email/private key are also absent locally. These may be configured separately in Vercel, but their values were not accessed or displayed.

Required Vercel values:

```text
SMSPOOL_API_KEY
SMSPOOL_USD_NGN_RATE
SMSPOOL_MARKUP_PERCENT=20
SMSPOOL_PURCHASES_ENABLED=false
```

## Tests required before enabling payments

Status: **NOT COMPLETE — payments must remain disabled.**

1. Deploy Firestore rules and indexes.
2. Configure the three SMSPool variables above with purchases still disabled.
3. Verify authenticated live country, service, pool/stock, pricing and rental catalogue requests on Vercel.
4. Verify unauthenticated and cross-user requests are rejected.
5. Use a controlled test account to run one minimum-value one-time order, real SMS retrieval and a provider-confirmed cancellation/refund.
6. Run one eligible rental through activation, message retrieval, expiry and provider refund rules.
7. Repeat the same idempotency key and poll/cancel/refund requests to prove one debit, one provider order and at most one refund.
8. Simulate provider 4xx, 5xx and timeout outcomes and reconcile every Firestore/wallet/provider record.
9. Review the admin order table and wallet ledger against SMSPool provider history.
10. Only after every item passes may `SMSPOOL_PURCHASES_ENABLED=true` be considered.

## Production-readiness re-test — 24 October 2026

### Executive result

**Conditionally ready for controlled staging; not ready to enable real purchases.** No SMSPool purchase, cancellation, rental or refund request was made. Telnyx remains installed and unchanged. No production deployment was performed.

### Hardening completed

1. SMSPool provider-order creation now occurs in the same Firestore transaction as the wallet reservation and platform transaction.
2. Concurrent requests sharing the same stable reference return the existing order and cannot issue a second provider purchase.
3. Refunds now atomically update the wallet, immutable refund ledger, provider order and platform transaction.
4. A refund must match an existing debit for the same user and amount.
5. Rentals remain `processing` until SMSPool actually returns or reports an assigned phone number.
6. `npm run test:smspool` adds repeatable checks for the safety lock, endpoint contract, assignment-only UX, idempotency/refund wiring, Firestore isolation and required indexes.

### Windows EPERM investigation

The build initially failed with `EPERM: operation not permitted, mkdir` inside `.next`. The failure reproduced after clearing `.next`, pre-creating output directories and limiting Next.js to one worker. The unchanged build passed outside the managed filesystem restriction. This identifies the cause as local Windows sandbox/file-system interception, not a TypeScript, route or repository error. Vercel does not use this restricted local path.

| Final check | Result |
| --- | --- |
| `npm run test:smspool` | Passed: 6/6 |
| `npm run typecheck` | Passed |
| `git diff --check` | Passed |
| `npm run build` | Passed; 52 static pages generated and all API routes compiled |

### Live read-only SMSPool catalogue results

Verified directly against SMSPool on 24 October 2026. No order endpoint was called.

| Check | Observed result |
| --- | --- |
| Countries | 162 returned |
| Nigeria | Country ID `14` |
| United States services | 1,329 returned for country ID `1` |
| Sample service | ID `1`, `1688` |
| Suggested pool | Pool ID `7`, `Foxtrot` |
| Sample provider price | USD `0.14` |
| Sample stock | 7,969 |
| Sample success rate | 100 |

These values are volatile provider inventory and are evidence of the test only, not fixed application data.

### Exact-number behavior and customer display

The official `/purchase/sms` request accepts an optional `phonenumber` only when the caller already knows a number. SMSPool exposes no endpoint for browsing exact available numbers. The customer workspace correctly displays country, service, provider pool, live stock and server-calculated NGN retail price, and states that SMSPool assigns the number only after a successful purchase. Telnyx remains the exact-number provider.

An authenticated end-to-end browser test still requires a configured Firebase/SMSPool staging session. The UI data flow and copy are covered by the automated readiness test, but live authenticated rendering must pass before payments are enabled.

### Wallet, duplicate, cancellation and refund verification

Verified without a real provider purchase:

- the browser cannot submit its own price; the server loads a user-bound, expiring offer;
- wallet debit, purchase ledger, platform transaction and SMSPool order placeholder are atomic;
- duplicate reservations return the existing record without another provider call;
- invalid reservation amounts are rejected;
- refunds use deterministic `-REFUND` references and require the original matching debit;
- wallet credit, refund ledger and both order states are atomic and idempotent;
- ambiguous timeouts remain `processing` and are not automatically refunded.

Still requiring controlled provider testing: successful assignment, real message retrieval, provider-confirmed cancellation, provider status `6`, rental activation/delayed assignment, rental expiry/refund, and injected 4xx/5xx/timeout reconciliation.

### Admin and transaction history

- `/api/admin/smspool/orders` requires an authenticated administrator and combines one-time orders and rentals.
- The admin table exposes reference, user, number/product, type, retail price, provider cost, status, provider reference and expiry.
- Customer transaction and SMSPool history queries are scoped to the verified Firebase user ID.
- Unauthenticated deployed requests to catalogue, offers, orders, rentals, admin orders and admin health returned HTTP `401`.

Runtime verification with real records still requires a Firebase admin test user and controlled test orders.

### Firestore rules and indexes

Rules deny direct client access to all wallet, transaction, SMSPool offer/order/rental, provider, pricing, rate-limit and audit collections. The committed indexes cover `userId ASC + createdAt DESC` for `transactions`, `smsPoolOrders` and `smsPoolRentals`, plus the equivalent Telnyx, SMS, inbound-message and wallet-history queries.

The repository configuration passed static validation. The Firebase CLI did not return an authenticated deployed-index listing, so deployment state must be confirmed in Firebase Console before production enablement.

### Credential exposure

- No `NEXT_PUBLIC_SMSPOOL_*` variable exists.
- `SMSPOOL_API_KEY` is used only in server code and configuration documentation.
- The local production client bundle contained zero SMSPool, Telnyx, Paystack or Firebase Admin secret identifiers and no SMSPool provider URL.
- Sixteen deployed public JavaScript chunks were scanned with zero SMSPool secret/configuration identifiers or provider API URLs.
- Protected deployed routes returned `401` without a Firebase bearer token.

Firebase's web configuration is intentionally public; Firestore rules and server authorization protect application data.

### Tests requiring a funded SMSPool account

1. Buy a minimum-cost one-time number and confirm the assigned number and provider order ID.
2. Receive one permitted real SMS and verify status/message synchronization.
3. Cancel an eligible unfulfilled order and reconcile SMSPool balance plus wallet refund.
4. Observe an automatic provider refund and prove exactly one wallet credit.
5. Buy a rental, including the delayed-assignment state when applicable.
6. Retrieve rental messages, validate expiry and test an eligible rental refund.
7. Compare provider history, Firestore, customer history and admin monitoring.

An unfunded SMSPool account can test `BALANCE_ERROR`, but the platform test wallet must contain enough funds to reach the provider. The resulting platform debit must be refunded exactly once.

### Final outstanding production checklist

- [x] Keep `SMSPOOL_PURCHASES_ENABLED=false` as the fail-closed default.
- [x] Production build, TypeScript check and SMSPool readiness tests pass.
- [x] Live read-only country, service, pool, stock and provider-price endpoints verified.
- [x] SMSPool exact-number browsing is not advertised.
- [x] Atomic reservation, duplicate prevention and atomic idempotent refunds implemented.
- [x] Customer history, admin monitoring and credential boundaries reviewed.
- [ ] Configure and verify `SMSPOOL_API_KEY`, `SMSPOOL_USD_NGN_RATE` and `SMSPOOL_MARKUP_PERCENT` in staging.
- [ ] Confirm `SMSPOOL_PURCHASES_ENABLED=false` in every Vercel environment before deployment.
- [ ] Deploy `firestore.rules` and `firestore.indexes.json`; confirm every index is enabled.
- [ ] Run authenticated customer and admin browser tests against staging.
- [ ] Run Firestore emulator or isolated staging concurrency tests.
- [ ] Obtain explicit approval before any real purchase.
- [ ] Fund SMSPool with only the minimum controlled amount and complete the seven funded tests above.
- [ ] Define operator handling and alerts for aged `processing` orders, provider failures and refund failures.
- [ ] Review current SMSPool permitted-use and destination-service restrictions.
- [ ] Enable purchases only after written sign-off, with staged rollout and rollback procedures.

### Deployment state

No commit was pushed and no Vercel deployment was triggered during this review. Real purchases remain disabled.
