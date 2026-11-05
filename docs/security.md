# Security Model and Deployment Checklist

NEXUS is a local portfolio MVP. The included controls are useful foundations but do not constitute a production security certification.

## Included controls

- Passwords are stored as salted `scrypt` hashes; plaintext passwords are not stored.
- Session tokens are random, only their SHA-256 hashes are stored, and sessions expire server-side.
- API routes require authentication; sensitive operations require role checks.
- Login attempts are rate-limited; Helmet supplies baseline response headers.
- Agent enrollment uses one-time expiring codes; the stored enrollment code is hashed.
- Endpoint agents authenticate using per-device credentials over WebSocket. Production deployments must use WSS.
- Remote diagnostics use a fixed allow-list and validated hostnames. ICMP tests are bounded to four packets; TCP checks permit one approved host/port pair and do not scan ranges. No arbitrary shell string is accepted.
- Operational actions, problem/change/access updates and diagnostic requests are written to the audit log.
- Health checks refuse redirects and validate destinations; trusted private hosts require an explicit allow-list.

## Required before a real company deployment

1. Replace seeded demo accounts and demo passwords with an enterprise identity provider or controlled account provisioning.
2. Put the service behind HTTPS/WSS. Disable direct public access to the Node listener.
3. Use a managed secret store for credentials and rotate session/device credentials.
4. Add device credential revocation and agent update/signing procedures.
5. Run the agent with a dedicated least-privilege OS account; avoid local admin/root access for read-only collection.
6. Add explicit employee/device consent and a documented approval policy before enabling any mutating action or interactive shell.
7. Add rate limits, request-size limits, per-device command quotas, task timeouts and concurrency controls.
8. Restrict monitor endpoint egress at the network layer. `MONITOR_ALLOWED_HOSTS` is not a substitute for firewall controls.
9. Add database backups, restore drills, retention policies and log access controls.
10. Add security testing, dependency scanning, vulnerability response and privacy review.
11. Keep personally identifiable information and diagnostic output to the minimum needed for support.
12. Document who can enroll devices, view telemetry, request diagnostics and resolve incidents.

## Remote access boundary

The MVP does not expose arbitrary PowerShell/Bash, file transfer, hidden control, or remote screen viewing. Do not add those features without a formal authorization and consent flow, operator identity, device identity, scoped permissions, auditable session recording, local user visibility, expiry and emergency termination.
