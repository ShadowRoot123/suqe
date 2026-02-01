# MyShop Backend (Rails API)

Rails API backend for the offline-first Inventory, Sales & POS system.

## Requirements

- Ruby 3.3.x
- PostgreSQL 14+

## Conventions

- Versioned JSON API routes under `/api/v1` (controllers in `app/controllers/api/v1`).
- Controllers stay thin; business logic goes in domain command/service objects.
- Domain code is organized by bounded context under `app/domains/<context>` (e.g. `auth_org`, `catalog`, `inventory`, `offline_sync`).

## Setup (local)

- Configure database settings in `config/database.yml` (supports `DATABASE_URL` or `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`).
- Install gems and run the app:
  - `bundle install --local`
  - `bundle exec rails server`

## Local Postgres

- Install PostgreSQL 14+ and make sure it is running.
- On Windows, the app defaults to `127.0.0.1:5432` and `postgres` unless you override `PGHOST`/`PGPORT`/`PGUSER`.
- If your `postgres` user has a password, set it (PowerShell):
  - `$env:PGPASSWORD = "<password>"`
- Prepare DB (creates db + runs migrations + seeds):
  - `bundle exec rails db:prepare`

## Schema source of truth

- Product-level canonical schema: `docs/db/schema.sql` at the repo root.
- Backend executable schema: Rails migrations + `backend/db/structure.sql` (generated from Postgres) will be the runtime source of truth for the Rails app.

## Tests

- Run request/service specs:
  - `$env:RAILS_ENV = "test"`
  - `$env:PGPASSWORD = "<password>"`
  - `bundle exec rails db:prepare`
  - `bundle exec rspec`
