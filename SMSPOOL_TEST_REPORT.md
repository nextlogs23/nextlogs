# SMSPool integration test report

Date: 23 October 2026

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
| Production compilation | Not completed locally: Next.js was blocked by Windows `EPERM` while creating output directories; the independent strict TypeScript check passed |

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
