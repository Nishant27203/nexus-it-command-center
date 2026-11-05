# Operator Runbook

## Endpoint does not appear online

1. Confirm that the device completed enrollment and has `agent/config.json`.
2. Confirm `NEXUS_SERVER` resolves and is reachable from the endpoint.
3. Confirm the server's `PUBLIC_AGENT_URL` uses a hostname and protocol reachable by that endpoint.
4. For a remote endpoint, confirm the reverse proxy forwards WebSocket upgrades to `/agent` and uses WSS.
5. Check local firewall policy and server logs. Do not open an inbound port on the endpoint.

## Diagnostic remains in SENT state

1. Confirm the agent process is running and connected.
2. Confirm that the device credential in `agent/config.json` has not been rotated.
3. Restart the agent and check the device heartbeat.
4. Inspect the diagnostic record and server logs. A future production build should add stale-task expiry and an explicit cancellation endpoint.

## Application check is degraded

1. Verify the configured URL and expected status code.
2. Check endpoint DNS and TLS from the NEXUS server.
3. Review response time, HTTP status and stored error text.
4. Ensure the monitor host is trusted and allow-listed; never add metadata endpoints or untrusted URLs.
5. Correlate the check with recent application changes and open incidents.

## Database maintenance

Stop the server before copying the SQLite database. The database uses WAL mode; use SQLite's backup API or a consistent backup procedure rather than copying only the main database file while it is active.


## Run a host reachability test

1. Select a genuinely enrolled endpoint that is online.
2. Open Troubleshooting and choose Host reachability.
3. Enter one hostname or IPv4 hostname and run the task.
4. Review packet loss and the returned ping output. ICMP can be blocked by endpoint or network policy, so no response alone does not prove the host is down.

## Check a single TCP service port

1. Select the enrolled endpoint.
2. Choose TCP service check.
3. Enter one host and one port from the UI/API allow-list.
4. Interpret a timeout/refusal separately from a DNS failure. This task tests one host/port pair only; it does not scan port ranges.

## Problem, change and access workflows

- Create a problem record when incidents share a suspected cause. Link the related incident IDs and document the root cause only when supported by evidence.
- Submit a change with impact, implementation and rollback plans. A manager/admin approval is required before the change can progress to scheduled implementation.
- Submit access requests with the minimum necessary access level and an expiry where appropriate. The approval screen records governance decisions; it does not modify external identity systems.
