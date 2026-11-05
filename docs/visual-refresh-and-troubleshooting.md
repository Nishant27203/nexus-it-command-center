# NEXUS visual refresh and guided troubleshooting — v1.2.0

## Visual changes

- Increased typography across navigation, section headings, KPI cards, tables, diagnostic cards and console output.
- Added a locally packaged workspace image to the Overview hero and Troubleshooting feature panels.
- Kept the warm beige canvas, near-black text, forest-green primary controls and restrained terracotta states.
- Added responsive layouts for issue intake, diagnostic cards and the four-step workflow.

## Troubleshooting workflow

The Troubleshooting Center has a report form with issue title, category, priority, error code and description. It can optionally associate the selected endpoint. Submit creates an ordinary NEXUS incident, preserving the existing incident queue and SLA behavior.

After submission, run a category-recommended diagnostic or choose one of the read-only diagnostic tasks. The console displays task status, source, timestamp and output.

## Device refresh

`POST /api/devices/:id/refresh` refreshes sample telemetry for demo endpoints. For an enrolled device, it sends an authenticated `refresh_metrics` WebSocket message; the endpoint agent responds immediately with a new heartbeat.

## Demo remediation

`POST /api/devices/:id/demo-remediation` is restricted to seeded demo devices and the explicit action allow-list. It changes sample telemetry and records an audit entry. The endpoint rejects live devices. No operating-system settings are changed.

## Local validation

Run:

```bash
npm run check
npm test
npm run build
```

For live-device testing, enroll a computer you own or are authorized to administer and run the agent under a least-privilege user account. Do not expose the local agent channel publicly without HTTPS/WSS, network controls and an explicit device authorization policy.
