# Demo: Offline Sync (Backend-only)

This is a short, repeatable demo of the Offline Sync loop using the current backend endpoints.

## Prereqs

- Backend running locally (Rails API)
- Postgres running and migrated

## 1) Create org + owner

```bash
curl -s -X POST http://localhost:3000/api/v1/orgs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Shop",
    "owner": { "name": "Owner", "email": "owner@example.com", "password": "secret123" }
  }'
```

Copy `access_token` and `organization.id` from the response.

## 2) Push commands (client outbox → server outbox)

```bash
curl -s -X POST http://localhost:3000/api/v1/sync/push \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{
    "device_id": "device-1",
    "commands": [
      { "idempotency_key": "cmd-1", "entity": "sale", "operation": "create", "payload": { "foo": "bar" } },
      { "idempotency_key": "cmd-2", "entity": "sale", "operation": "weird",  "payload": { "foo": "bar" } }
    ]
  }'
```

Expected:

- `cmd-1` outcome is `enqueued`
- `cmd-2` outcome is `enqueued` (it will fail during processing because operation is unsupported)

## 3) Process pending outbox rows

In this repo, processing is intentionally kept as a service so we can run it from Rails console:

```bash
bundle exec rails console
```

```ruby
org_id = Organization.first.id
OfflineSync::ProcessPending.call(org_id: org_id)
```

## 4) Pull acknowledgements (server → client inbox)

```bash
curl -s "http://localhost:3000/api/v1/sync/pull" \
  -H "Authorization: Bearer <access_token>"
```

Expected:

- `acks[]` includes `cmd-1` with status `applied`
- `acks[]` includes `cmd-2` with status `failed`
- `next_cursor` is set to an ISO8601 timestamp to persist client-side

## 5) Cursor demo (only new acks)

Use the `next_cursor` from the previous response:

```bash
curl -s "http://localhost:3000/api/v1/sync/pull?cursor=<next_cursor>" \
  -H "Authorization: Bearer <access_token>"
```

Expected:

- `acks[]` is empty if nothing new was processed

