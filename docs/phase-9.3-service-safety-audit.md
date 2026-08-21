# Phase 9.3 — Service safety, audit & final validation

> Status: **complete** (draft SQL; M26 has not been applied to any database).
> Scope: all five database-backed themes.

## Booking safety lock

`get_service_safety_lock` counts upcoming appointments, active bookings, and pending payments. Hard delete and silent deactivate are rejected with a readable warning. `archive_saved_service` is the safe path; booking snapshots stay untouched.

## Audit trail

`business_activity` records salon-level service/offer/combo events with actor, action, previous value, new value, and timestamp. `get_theme_service_audit` returns the current theme’s entries only.

## Offline / retry

Step 05 detects `navigator.onLine`, blocks Add Selected / Edit / Save while offline, keeps the add-service form in `sessionStorage`, and relies on existing idempotent RPCs so a retry cannot insert a duplicate predefined service.

## Integrity

`check_theme_service_integrity` confirms theme → category → saved service → offer/combo/media stay same-tenant and same-theme.

## Validation

```bash
npm run test:phase-9.3
```
