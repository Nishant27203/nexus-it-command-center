# NEXUS ten-phase product map

This roadmap is included in the same project repository. The phases describe one integrated product; they are not separate archives.

| Phase | Module | Working capability in this package | Boundary / next extension |
|---|---|---|---|
| 1 | IT service desk | Role-based sign-in, incident intake, assignment, priority, status, SLA dates and audit events | Business-hours SLA calendars, file attachments and mail delivery |
| 2 | Endpoint enrollment | Single-use expiring codes, hashed device credentials and endpoint registration | Credential revocation UI, signed agent updates and device groups |
| 3 | Fleet health | Agent heartbeat, OS identity, CPU, memory, disk, IP and network-rate telemetry | Long-term telemetry retention and configurable fleet thresholds |
| 4 | Troubleshooting workbench | System, network-interface, DNS, disk, process, service, ICMP and single-port TCP diagnostics | Additional OS-specific read-only collectors and result comparison |
| 5 | Remote diagnostic console | Browser command palette dispatches a fixed task registry over authenticated WebSocket | No arbitrary PowerShell/Bash shell, file transfer or remote desktop in this version |
| 6 | Application monitoring | HTTP(S) health checks, response-time history and deduplicated degraded-service incidents | External monitoring exporters and deployment webhooks |
| 7 | IT asset management | Asset tags, category, owner, status, purchase date and warranty | Procurement, license reconciliation and CMDB discovery connectors |
| 8 | Knowledge and problem management | Searchable runbooks, problem records, related-incident links, root-cause, workaround and permanent fix | Similarity search and knowledge approval workflow |
| 9 | Change and access governance | Risk/impact capture, implementation/rollback plans, change progression, access requests and review outcomes | Integrations with identity providers and CI/CD deployment gates |
| 10 | Operations reporting and readiness | Cross-module reporting, audit log, architecture/security/runbook docs and automated database tests | Production SLO reporting, backup drills and browser E2E suite |

## Recommended build order

1. Start with the seeded workspace and review the existing service-desk workflows.
2. Enroll an endpoint you own or are authorized to administer.
3. Confirm live heartbeats and device metrics before attempting diagnostics.
4. Run read-only DNS, host reachability, TCP service, disk and process checks.
5. Create incidents from findings and document the evidence.
6. Use problem records to connect repeated incidents; use change records to plan corrective changes.
7. Use access requests to demonstrate least-privilege governance.
8. Review reports and audit history, then package the project for an interview demonstration.

## Definition of done for a portfolio demonstration

- A clean local install starts the browser client and API.
- Each seeded demo record is clearly identified as sample data.
- At least one real endpoint enrolled with the owner's authorization reports live metrics.
- At least three diagnostic tasks run on that endpoint and save their outcomes.
- A technician can create/update an incident and document the fix.
- A recurring issue can be represented as a problem with related incidents.
- A change request contains implementation and rollback plans and is approved by a manager/admin account.
- An employee access request can be reviewed and recorded.
- All tests pass, the README is accurate and no agent credential or `.env` file is committed.
