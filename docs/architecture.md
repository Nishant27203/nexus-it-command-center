# NEXUS Architecture Notes

## Runtime boundaries

NEXUS is split into three runtime areas:

1. **Browser client:** presentation, navigation, operator actions and task output display. It never runs a diagnostic against the operator's own machine as a substitute for the enrolled endpoint.
2. **Control/API server:** authentication, authorization, incident and device records, health checks, task dispatch, result persistence and audit logging.
3. **Endpoint agent:** collects local metrics and runs only the named diagnostic functions in its task registry. The agent initiates an outbound authenticated WebSocket connection.

## Device lifecycle

`Enrollment code created → agent enrolls once → per-device credential issued → agent connects → heartbeat received → device marked online → diagnostic task dispatched → result persisted → device history visible`.

Enrollment codes expire after 30 minutes and are stored as hashes. The agent credential is returned once and stored locally in `agent/config.json`. If an endpoint is lost or compromised, revoke its device credential in a future administration workflow; for this MVP, remove or rotate the record directly in the database and re-enroll the endpoint.

## Diagnostic task lifecycle

`QUEUED → SENT → COMPLETED | FAILED`.

The task registry is intentionally fixed. A browser request selects a named diagnostic and validated arguments. The API checks the user's role and the device state before dispatch. The agent checks the task against its local allow-list and returns structured text output. The server associates the result with the initiating user and endpoint.

## Incident correlation

Application health checks can create an incident when a check degrades and there is no unresolved incident for that application. The incident record stores its source and the affected application/device relation. A later extension should introduce alert grouping, deduplication windows and correlation keys for endpoint thresholds.

## Data flow and storage

SQLite stores operational records. Telemetry uses a separate time-indexed table so current device state and sampled history are distinct. For a larger estate, move telemetry to a time-series store or roll up historical data; do not retain high-frequency raw metrics indefinitely in the transactional database.


## Ten capability phases

1. Service desk: role-aware incident intake, ownership, priority and SLA.
2. Endpoint enrollment: expiring single-use code and per-device credential.
3. Telemetry: heartbeats and resource samples, separated from device master data.
4. Troubleshooting: fixed diagnostic task catalogue with validated arguments.
5. Remote diagnostic console: WebSocket task dispatch; no arbitrary shell channel.
6. Application monitoring: trusted health endpoints and incident deduplication.
7. Asset lifecycle: inventory, ownership and warranty dates.
8. Knowledge and problem management: support procedures and incident correlation.
9. Change and access governance: plans, approvals, rollback and access review decisions.
10. Operational reporting and readiness: metrics, audit history, tests and deployment guidance.

Problem, change and access records are separate entities rather than overloading incidents. A problem can reference multiple incidents. Changes store implementation and rollback plans. Access requests store a business justification and reviewer decision; they do not themselves provision external permissions.
