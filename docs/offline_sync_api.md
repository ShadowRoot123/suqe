# Offline Sync API (v1)

This document describes the current contract for the Offline Sync endpoints used by the client outbox/inbox loop.

## Auth

All endpoints require:

- `Authorization: Bearer <access_token>`

Common error responses:

- `401` → `{ "code": "unauthorized", "message": "Unauthorized" }`
- `403` → `{ "code": "forbidden", "message": "Forbidden" }`

## POST /api/v1/sync/push

Enqueue a batch of offline commands into the server-side outbox (`sync_outbox`). This endpoint is safe to retry.

### Request

JSON body:

- `device_id` (string, required)
- `commands` (array, required)
  - Each command:
    - `idempotency_key` (string, required)
    - `entity` (string, required)
    - `operation` (string, required)
    - `payload` (object, required)

### Supported entities (current)

- `category`
  - `create` payload: `{ "id": "<uuid>", "name": "<string>", "parent_id": "<uuid|null>" }`
  - `update` payload: `{ "id": "<uuid>", "name"?: "<string>", "parent_id"?: "<uuid|null>" }`
  - `delete` payload: `{ "id": "<uuid>" }`

- `product`
  - `create` payload: `{ "id": "<uuid>", "name": "<string>", "category_id"?: "<uuid|null>", "status"?: "<active|archived>" }`
  - `update` payload: `{ "id": "<uuid>", "name"?: "<string>", "category_id"?: "<uuid|null>", "status"?: "<active|archived>" }`
  - `delete` payload: `{ "id": "<uuid>" }`

- `variant`
  - `create` payload: `{ "id": "<uuid>", "product_id": "<uuid>", "sku": "<string>", "barcode"?: "<string|null>", "attrs"?: "<object>", "price"?: "<string|number>", "cost_price"?: "<string|number>" }`
  - `update` payload: `{ "id": "<uuid>", "product_id"?: "<uuid>", "sku"?: "<string>", "barcode"?: "<string|null>", "attrs"?: "<object>", "price"?: "<string|number>", "cost_price"?: "<string|number>" }`
  - `delete` payload: `{ "id": "<uuid>" }`

For offline-first stability, clients should provide `id` as a UUID for `create`.

### Response (200)

```json
{
  "received_at": "2026-02-03T12:34:56.123456Z",
  "outcomes": [
    { "idempotency_key": "cmd-1", "status": "enqueued", "outbox_id": "..." },
    { "idempotency_key": "cmd-2", "status": "duplicate", "outbox_id": "..." },
    { "idempotency_key": "cmd-3", "status": "invalid", "error": "Missing fields: entity" }
  ]
}
```

Outcome meanings:

- `enqueued`: server created a new `sync_outbox` row.
- `duplicate`: `(org_id, idempotency_key)` already existed, no new row was created.
- `invalid`: command is missing required fields; it is not enqueued.

### Errors

- Missing params:
  - `400` → `{ "code": "parameter_missing", "message": "param is missing or the value is empty: device_id" }`
- Commands not an array:
  - `422` → `{ "code": "validation_error", "message": "Validation failed", "details": { "commands": ["must be an array"] } }`

## GET /api/v1/sync/pull

Fetch acknowledgements and a simple change feed. Clients should persist `next_cursor` and pass it back as `cursor` on the next request.

### Request

Query params:

- `cursor` (optional ISO8601 timestamp)
- `limit` (optional integer, defaults to 100; clamped to `1..500`)

### Response (200)

```json
{
  "cursor": "2026-02-03T12:00:00.000000Z",
  "next_cursor": "2026-02-03T12:34:56.123456Z",
  "acks": [
    {
      "idempotency_key": "cmd-1",
      "status": "applied",
      "outbox_id": "...",
      "processed_at": "2026-02-03T12:34:56.123456Z"
    }
  ],
  "changes": [
    {
      "id": "...",
      "action": "sync.applied",
      "entity": "sale",
      "entity_id": null,
      "created_at": "2026-02-03T12:34:56.123456Z",
      "metadata": {
        "outbox_id": "...",
        "idempotency_key": "cmd-1",
        "client_id": "device-1",
        "operation": "create",
        "status": "applied"
      }
    }
  ]
}
```

Notes:

- `acks[]` come from `sync_outbox` rows in status `applied` or `failed`.
- `changes[]` come from `audit_logs` (one per processed outbox row).
- `pull` processes pending outbox rows for the organization before returning results.
- `cursor` filters by:
  - `sync_outbox.updated_at > cursor` for `acks[]`
  - `audit_logs.created_at > cursor` for `changes[]`
- `next_cursor` is the max timestamp returned across both lists (or current time if no results).

### Category changes

For `entity: "category"`, `metadata.record` includes:

- `id` (uuid)
- `name` (string)
- `parent_id` (uuid|null)

### Product changes

For `entity: "product"`, `metadata.record` includes:

- `id` (uuid)
- `name` (string)
- `category_id` (uuid|null)
- `status` (active|archived)

### Variant changes

For `entity: "variant"`, `metadata.record` includes:

- `id` (uuid)
- `product_id` (uuid)
- `sku` (string)
- `barcode` (string|null)
- `attrs` (object)
- `price` (string|number)
- `cost_price` (string|number)

### Cursor errors

- Invalid cursor format:
  - `422` → `{ "code": "validation_error", "message": "Validation failed", "details": { "cursor": ["must be ISO8601"] } }`
