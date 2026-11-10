# AccsZone Stage 2 design boundary

This document is design-only. Stage 1 remains a server-only, read-only supplier review integration. It does not expose an AccsZone catalogue to customers, create marketplace products, accept supplier credentials in the browser, or provide a purchase function.

Any future Stage 2 work must remain fail-closed unless a separately approved design establishes: supplier contract and permitted inventory, customer-facing content policy, pricing and currency reconciliation, inventory freshness guarantees, fulfillment and refund semantics, provider authentication rotation, transaction idempotency, audit requirements, and a dedicated purchase safety flag. Missing configuration, stale detail, failed validation, provider errors, rate-limit state errors, and uncertain policy classification must all prevent publication and purchase.

The existing `accsZoneAllowlist` records must continue to carry `customerVisible: false`, `purchasesEnabled: false`, and false confirmation flags until that approval occurs. No implementation in this document enables or defines a purchase function.
