# NEXUS IT Command Center

**A unified workspace for IT service operations, endpoint visibility and guided troubleshooting.**

**Current package:** 1.2.0

NEXUS brings the day-to-day work of an internal IT team into one application: incident coordination, device inventory, endpoint health, approved diagnostics, application checks, asset records and support knowledge.

> **Project status:** Portfolio-ready working MVP. The web application, local database, authentication, incident workflow, demo workspace, application health checks, enrollment flow and endpoint agent are implemented. Demo endpoints are explicitly labelled and return simulated diagnostic output. Real endpoints report live metrics after an agent is enrolled. The diagnostic console runs a fixed allow-list of read-only tasks; it is not an unrestricted remote shell or remote desktop product.

## Product tour

- **Overview:** operational briefing, endpoint status, incident queue, application health, telemetry chart and recent activity.
- **Incidents:** create, assign, prioritize and move incidents through the response workflow with response and resolution SLA targets.
- **Problems:** group related incidents, investigate recurring faults, record root cause, workaround and permanent corrective action.
- **Changes:** request standard, normal or emergency changes; capture risk, impact, implementation and rollback plans; move through assessment, approval, scheduling and completion.
- **Access requests:** let employees request least-privilege access with a business justification and expiry; managers/admins record review decisions. This module records governance and does not provision access in external systems.
- **Devices:** review endpoint details, ownership, OS, CPU, memory, disk, heartbeat and health score.
- **Troubleshooting:** submit a user-reported error, create an SLA-backed incident, choose a target device, run approved system, network-interface, DNS, disk, process, service, ICMP reachability and single-port TCP connectivity diagnostics, and review timestamped evidence.
- **Guided response:** follow a four-step issue → diagnosis → action → verification workflow. Demo endpoints support clearly labelled sample-metric refresh and demo-only remediation so the before/after view changes. Live endpoints support requested metric refresh through the enrolled agent; real configuration changes remain disabled by default.
- **Applications:** register HTTP(S) health endpoints and run response-time/status checks. Degraded checks create an incident when no active one already exists.
- **IT assets:** review hardware records, assignment and warranty dates.
- **Knowledge base:** use practical support runbooks for common issues.
- **Reports:** review incident priority, device health, problem, change, application and access-request summaries from the local database.
- **Activity log:** review who signed in, enrolled devices, created incidents, requested diagnostics or changed governance records.

## Visual design

The interface uses a warm beige canvas, larger readable near-black typography, forest-green actions, and restrained terracotta details. The NEXUS mark, metric visualizations and status treatments are built in CSS/SVG. A generated, locally packaged workspace image is used in the overview and troubleshooting pages (`client/public/images/nexus-workspace.jpg`).

## Guided troubleshooting workflow (v1.2.0)

The Troubleshooting Center now includes a user-facing issue intake form. A technician can record the problem title, category, priority, exact error code/message, problem description and selected endpoint. Submitting the form creates an incident through the existing `/api/incidents` workflow, so the record appears in Incident Management with its normal SLA and audit events.

After the incident is created, the operator can run a recommended diagnostic for the selected category or choose any supported diagnostic task. Results show as a timestamped task result in the console. The workflow tracks four visible steps: report, diagnose, take action, and verify.

### Refresh behavior

- For a **demo endpoint**, the Refresh device action generates a new clearly labelled sample telemetry point. Metrics may change slightly so the refreshed state is visible during a portfolio demonstration.
- For a **live enrolled endpoint**, NEXUS sends a `refresh_metrics` message over the authenticated agent WebSocket. The agent immediately collects a new heartbeat and sends actual metrics back. The user interface waits briefly for the new heartbeat and reports whether the refresh was requested or completed.

### Demo-only remediation

When the selected endpoint is a demo device and a diagnostic has completed, the interface offers a demo-only action such as resource-pressure reduction, disk cleanup simulation or network reconnect simulation. The server rejects this route for non-demo endpoints. It updates only demo telemetry and writes an audit event; it does not execute commands on a physical computer.

For a live endpoint, NEXUS displays the diagnostic evidence and asks the technician to follow the approved organization runbook. This version intentionally does not silently restart services, change network settings, delete files or execute arbitrary shell commands.

## Requirements

- Node.js **22.13 or newer** (uses Node's built-in `node:sqlite` module).
- npm 10 or newer recommended.
- A browser with modern JavaScript support.

## Run locally

From this project directory:

```bash
npm install
cp .env.example .env
npm run dev
```

Open:

- Web application: http://localhost:5173
- API health check: http://localhost:4100/api/health

The first run creates `server/data/nexus.sqlite` and loads a labelled demo workspace. The database file is local and is ignored by Git.

### Demo sign-in

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@nexus.local` | `NexusDemo!2026` |
| Technician | `technician@nexus.local` | `SupportDemo!2026` |
| Employee | `employee@nexus.local` | `EmployeeDemo!2026` |
| Manager | `manager@nexus.local` | `ManagerDemo!2026` |

These accounts and their sample data are for local demonstrations only. Replace the seeded-account approach, credentials and session policy before a real deployment. Do not expose the demo database to the public internet.

## Verify the project

```bash
npm run check
npm test
npm run build
```

The included database tests verify seed roles, demo endpoints, telemetry records, incident references, and foreign-key integrity.

## Enroll a real endpoint

NEXUS agents initiate an outbound WebSocket connection to the NEXUS server. No inbound port is opened on the managed endpoint. For a remote device on another network, the NEXUS server must be reachable from that device and should be published through HTTPS/WSS using a TLS reverse proxy.

1. Start NEXUS and sign in as the administrator.
2. Open **Devices → Enroll device** and create a one-time enrollment code. It expires after 30 minutes.
3. On a computer you own or are authorized to administer, install Node.js 22.13+ and copy/clone this project source.
4. Install the project dependencies on that computer with `npm install`.
5. Set the server URL and one-time code, then run the endpoint agent.

**macOS / Linux terminal:**

```bash
NEXUS_SERVER=http://192.168.1.20:4100 \
NEXUS_ENROLLMENT_CODE='PASTE_ONE_TIME_CODE' \
npm run agent
```

**Windows PowerShell:**

```powershell
$env:NEXUS_SERVER = "http://192.168.1.20:4100"
$env:NEXUS_ENROLLMENT_CODE = "PASTE_ONE_TIME_CODE"
npm run agent
```

Replace `192.168.1.20` with the address of the NEXUS server reachable from the endpoint. The agent exchanges the one-time code for a per-device credential and saves it to `agent/config.json` with restricted file permissions where supported. Do not commit or share that file. Subsequent runs reuse the saved credential and no longer need the enrollment code.

For devices outside your LAN, configure `.env` on the NEXUS server:

```env
PUBLIC_AGENT_URL=wss://nexus.example.com/agent
```

Use a TLS reverse proxy that forwards WebSocket upgrades to the Node server. Keep the API and agent channel behind authentication and an appropriate network policy. Do not expose a plain `ws://` agent endpoint on the public internet.

### What the agent reports

The agent sends CPU, memory, disk, network-rate, IP, OS and heartbeat details every 15 seconds. The initial task registry supports:

- System overview
- Network interface summary
- DNS lookup for a validated hostname
- Disk/volume report
- Top process summary
- Read-only service inventory

The terminal-style console accepts only the named NEXUS diagnostic commands: `nexus help`, `nexus system`, `nexus network`, `nexus disk`, `nexus processes`, `nexus services`, `nexus dns <hostname>`, `nexus ping <hostname>`, and `nexus tcp <hostname> <port>`. It does not accept arbitrary PowerShell, Bash or shell strings. It does not stop processes, alter configuration, restart services or perform hidden remote actions. Extend the registry only after adding a clear approval model, task-specific authorization, audit events, timeouts and tests.

## Architecture

```text
React + Vite dashboard
        │ HTTPS / JSON API
        ▼
Express API ─────────────── SQLite (node:sqlite)
        │                         │
        │                         ├─ Users and sessions
        │                         ├─ Devices and telemetry
        │                         ├─ Incidents and diagnostics
        │                         ├─ Applications and checks
        │                         ├─ Assets and knowledge
        │                         └─ Audit history
        │
        └── WebSocket server (/agent)
                   ▲
                   │ Outbound authenticated connection
                   │
            NEXUS endpoint agent
            ├─ systeminformation collectors
            ├─ heartbeat publisher
            └─ fixed diagnostic task registry
```

### Key implementation choices

- **Frontend:** React 18, Vite, Lucide icons and custom CSS/SVG graphics.
- **API:** Express, Helmet, CORS, rate limiting and input validation.
- **Authentication:** salted `scrypt` password hashes, random session tokens stored as SHA-256 hashes, role checks and server-side session expiry.
- **Database:** Node `node:sqlite`, foreign keys, WAL mode and indexed operational tables. SQLite is convenient for a local portfolio deployment; use PostgreSQL with migrations and backups when moving to a multi-user hosted environment.
- **Endpoint:** Node agent, `systeminformation` and `ws`.
- **Remote diagnostics:** fixed task registry; no arbitrary command execution.
- **Health checks:** HTTP(S) checks with timeout, redirect refusal and host/IP safeguards. Internal hosts can be explicitly allow-listed.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4100` | API and agent WebSocket port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed browser origin |
| `DATABASE_PATH` | `./server/data/nexus.sqlite` | Local SQLite path |
| `SESSION_HOURS` | `12` | Session lifetime |
| `PUBLIC_AGENT_URL` | Derived from the enrollment request host | Optional override for the agent WebSocket URL returned at enrollment |
| `MONITOR_ALLOWED_HOSTS` | `localhost,127.0.0.1,::1` | Explicitly trusted internal monitoring hosts |

For a company environment, restrict `MONITOR_ALLOWED_HOSTS` to known service domains, restrict outbound network access at the host/firewall layer, use HTTPS/WSS, rotate credentials, add database backups, and deploy behind a production reverse proxy. The application endpoint allow-list is an additional guard, not a substitute for network egress controls.

## Repository layout

```text
nexus-it-command-center/
├── agent/                 # Endpoint agent and local device credential
├── client/
│   ├── public/            # NEXUS mark
│   └── src/               # Dashboard, pages, components and styles
├── server/
│   ├── db.js              # SQLite schema and demo seed
│   ├── security.js        # Password/session helpers and access control
│   └── index.js           # API, application checks and agent WebSocket
├── tests/                 # Database integrity tests
├── docs/                  # Architecture, security and support guide
├── .env.example
├── index.html
├── package.json
└── vite.config.js
```

## Ten-phase product map

The complete project package contains the following ten implementation phases. They are development milestones and product capability groups, not separate ZIP downloads.

| Phase | Capability | Project area |
|---|---|---|
| 1 | IT service desk foundation | Authentication, roles, incidents, assignment and SLA tracking |
| 2 | Endpoint enrollment and inventory | Device registry, one-time enrollment codes and endpoint agent |
| 3 | Live health monitoring | Heartbeats, CPU, memory, disk, network and telemetry history |
| 4 | Troubleshooting workbench | System, network, DNS, disk, process, service, ping and TCP checks |
| 5 | Remote diagnostic command console | Browser console dispatching a fixed allow-list of tasks to enrolled agents |
| 6 | Application monitoring | HTTP health checks, response time, degraded status and incident generation |
| 7 | IT asset lifecycle | Asset tags, ownership, status, purchase and warranty records |
| 8 | Knowledge and problem management | Support runbooks, linked recurring incidents, root cause and permanent fixes |
| 9 | Change and access governance | Change requests, approvals, rollback plans and access reviews |
| 10 | Operations reporting and readiness | Cross-module reports, audit history, tests, docs and deployment guidance |

## Known limitations and next engineering steps

This is a substantial local portfolio MVP, not a production remote-management suite.

1. Demo endpoints and sample operational records are clearly labelled. Enroll an authorized real endpoint to see real telemetry and run the read-only diagnostic tasks.
2. The remote console is a fixed diagnostic task console, not an unrestricted interactive terminal, file-transfer system or remote desktop product.
3. The app uses local SQLite and seeded demo accounts. A hosted multi-user deployment needs enterprise identity, PostgreSQL migrations, backups, restore procedures, monitoring and operational controls.
4. SLA deadlines currently use elapsed clock time rather than business-hour calendars. Attachments, email notifications and multi-tenant isolation are not yet included.
5. Problem, change and access workflows are included locally but are not integrated with external ITSM, deployment or identity-provider systems.
6. Application health endpoints must be trusted and allow-listed. Add deployment-specific egress controls before monitoring internal networks.
7. Run the agent under a dedicated least-privilege OS account. Do not run it as root/Administrator for the included read-only tasks.
8. The authoring environment validation includes Node syntax checks, JSX transpilation, CSS parsing and database tests. Install dependencies locally and run `npm run build` for a full production bundle check; a full browser-based end-to-end test still needs to be run locally.

## Suggested portfolio demo

Use two computers or one computer plus a virtual machine. Enroll the second endpoint, show the heartbeat and resource metrics, run the network and disk diagnostics, create an incident from the finding, update its owner/status, and show the audit record. Clearly distinguish live agent telemetry from the labelled demo records.

## License

MIT. See `LICENSE`.
