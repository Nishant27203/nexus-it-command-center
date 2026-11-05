# Troubleshooting catalog

The browser page and endpoint agent share a named diagnostic-task registry. Tasks run only on an endpoint that has been enrolled with a one-time code and is currently connected to the NEXUS server.

| Task / console command | What it collects | Typical support use | Safety boundary |
|---|---|---|---|
| `nexus system` | CPU, memory, disk utilization, IP, uptime and process count | Initial workstation triage | Read-only system information |
| `nexus network` | Non-loopback interfaces, address and link state | Network adapter and IP investigation | No interface changes |
| `nexus dns <hostname>` | Resolver output and lookup time | DNS resolution failures | Validated hostname only |
| `nexus ping <hostname>` | Four ICMP packets, packet-loss estimate and output | Basic reachability isolation | Fixed packet count and timeout; ICMP may be blocked |
| `nexus tcp <hostname> <port>` | One connection attempt to one host/port | Confirm a known service is listening | Approved port list only; no ranges or scanning |
| `nexus disk` | Volume mount, used capacity and percentage | Low disk-space reports | No file deletion or cleanup |
| `nexus processes` | Top processes by CPU and memory | Resource contention triage | Does not stop or modify processes |
| `nexus services` | Selected service states when supported by the OS | Service availability triage | Read-only service inventory; no restart |

## Interpreting results

- A failed ping is not conclusive proof that a host is offline; firewalls often block ICMP. Compare DNS, route, TCP and application evidence.
- A TCP connection refusal normally means the host was reached but the service did not accept the connection. A timeout may mean filtering, routing failure or a slow service.
- High CPU or memory in a single sample is not enough to identify root cause. Observe trends and correlate with the user's symptoms before making changes.
- Service inventory support differs by operating system and permissions. A missing result should be recorded as unavailable, not treated as proof that the service is stopped.
- Demo endpoints return clearly labelled simulated output. Only an enrolled non-demo endpoint executes the diagnostic function locally.

## Extending the registry

Add a new task only when it has a clear use case, bounded arguments, timeouts, maximum output size, a role check, an audit event, an explicit task result state and automated tests. Keep mutating operations separate from diagnostics and require a documented approval and local-user consent process before introducing them.


## Guided issue intake and verification (v1.2.0)

1. Select the endpoint related to the reported problem.
2. Submit the issue title, category, priority, optional error code and problem description in the Troubleshooting Center.
3. NEXUS creates an incident through the normal incident API; note the incident reference shown in the confirmation card.
4. Run the recommended diagnostic or choose a task from the diagnostic cards.
5. Review the timestamped console result and the demo/live source label.
6. For demo endpoints only, apply a labelled simulated action and refresh the device to see updated sample metrics.
7. For live endpoints, follow the approved runbook and use Refresh device metrics to request a fresh agent heartbeat before rerunning the diagnostic.

**Important:** Demo remediation changes only sample values in the local SQLite database. It does not repair a real computer. Live endpoints currently support actual metrics collection and read-only diagnostics; configuration changes require a separately designed, approved remediation model.
