# MyShop Mobile (React Native)

React Native (Expo) frontend aligned with the project SRS. Talks to the Rails API under `/api/v1` and implements an offline-first outbox + sync scaffolding.

## Prereqs
- Node.js + npm
- Expo Go on your phone, or Android Studio / Xcode

## Configure API base URL
This app reads:
- `EXPO_PUBLIC_API_BASE_URL`

Defaults to `http://localhost:3000/api/v1`.
Common dev values:
- Android emulator: `http://10.0.2.2:3000/api/v1`
- iOS simulator: `http://localhost:3000/api/v1`
- Physical device: use your computer LAN IP, e.g. `http://192.168.1.50:3000/api/v1`

## Run
```sh
npm install
npm run start
```

## What’s implemented
- Auth: create org, login, logout (Bearer token)
- Sync: outbox queue + `sync/push` + `sync/pull` (acks)
- Modules: Catalog / Inventory / POS / Settings scaffolds
- Barcode scanning: camera-based scanner screen wired into Catalog search

## Tests
```sh
npm test
```
