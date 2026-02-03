# Mobile/Web Local Dev: CORS

The backend is configured to allow cross-origin requests from local development origins by default.

## Default behavior

[cors.rb](file:///c:/Users/HP/Documents/trae_projects/myshop/backend/config/initializers/cors.rb) allows origins matching:

- `http://localhost:<port>`
- `http://127.0.0.1:<port>`
- `http://[::1]:<port>`
- and the same over `https://`

This covers Expo web / React Native web dev servers that run on localhost with varying ports.

## Custom origins

If your frontend runs on a non-localhost hostname (LAN IP, tunnel, etc.), set:

- `CORS_ORIGINS` as a comma-separated list of exact origins

Example:

```bash
export CORS_ORIGINS="http://192.168.1.10:19006,https://my-tunnel.example"
```

Then restart the Rails server.

