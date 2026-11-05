try { process.loadEnvFile(); } catch {}
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hashPassword } from './security-hash.js';

const dbPath = resolve(process.env.DATABASE_PATH || './server/data/nexus.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN','TECHNICIAN','EMPLOYEE','MANAGER')),
  department TEXT DEFAULT 'IT Operations',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  hostname TEXT,
  platform TEXT NOT NULL DEFAULT 'Windows',
  os_version TEXT,
  owner TEXT,
  department TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  cpu_usage REAL DEFAULT 0,
  memory_usage REAL DEFAULT 0,
  disk_usage REAL DEFAULT 0,
  ip_address TEXT,
  last_seen_at TEXT,
  agent_version TEXT,
  device_token_hash TEXT,
  enrollment_hash TEXT,
  enrollment_expires_at TEXT,
  health_score INTEGER DEFAULT 100,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE TABLE IF NOT EXISTS device_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  cpu REAL NOT NULL DEFAULT 0,
  memory REAL NOT NULL DEFAULT 0,
  disk REAL NOT NULL DEFAULT 0,
  network_rx REAL NOT NULL DEFAULT 0,
  network_tx REAL NOT NULL DEFAULT 0,
  detail_json TEXT DEFAULT '{}',
  sampled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_metrics_device_time ON device_metrics(device_id, sampled_at DESC);
CREATE TABLE IF NOT EXISTS diagnostics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_key TEXT NOT NULL UNIQUE,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  requested_by INTEGER REFERENCES users(id),
  arguments_json TEXT DEFAULT '{}',
  output_json TEXT,
  error TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_number TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'OPEN',
  source TEXT NOT NULL DEFAULT 'PORTAL',
  category TEXT DEFAULT 'General',
  device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  assignee TEXT,
  first_response_at TEXT,
  sla_response_due TEXT,
  sla_resolution_due TEXT,
  root_cause TEXT,
  resolution_notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'Production',
  endpoint TEXT,
  description TEXT,
  criticality TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  response_ms INTEGER,
  http_status INTEGER,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS application_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  response_ms INTEGER,
  http_status INTEGER,
  error TEXT,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_app_checks_time ON application_checks(application_id, checked_at DESC);
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_tag TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  serial_number TEXT,
  assigned_to TEXT,
  department TEXT,
  status TEXT NOT NULL DEFAULT 'IN_USE',
  purchase_date TEXT,
  warranty_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS knowledge_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_number TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'OPEN',
  category TEXT NOT NULL DEFAULT 'General',
  root_cause TEXT,
  workaround TEXT,
  permanent_fix TEXT,
  owner TEXT DEFAULT 'Unassigned',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_problems_status ON problems(status);
CREATE TABLE IF NOT EXISTS problem_incidents (
  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  PRIMARY KEY(problem_id,incident_id)
);
CREATE TABLE IF NOT EXISTS changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  change_number TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  change_type TEXT NOT NULL DEFAULT 'NORMAL',
  risk TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'REQUESTED',
  impact TEXT,
  implementation_plan TEXT NOT NULL,
  rollback_plan TEXT NOT NULL,
  planned_start TEXT,
  planned_end TEXT,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_changes_status ON changes(status);
CREATE TABLE IF NOT EXISTS access_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT UNIQUE,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  system_name TEXT NOT NULL,
  access_level TEXT NOT NULL,
  business_justification TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  review_notes TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
`);

const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (count === 0) seed();

function seed() {
  const insertUser = db.prepare('INSERT INTO users (email,password_hash,name,role,department) VALUES (?,?,?,?,?)');
  const admin = insertUser.run('admin@nexus.local', hashPassword('NexusDemo!2026'), 'Nexus Administrator', 'ADMIN', 'IT Operations').lastInsertRowid;
  insertUser.run('technician@nexus.local', hashPassword('SupportDemo!2026'), 'Avery Morgan', 'TECHNICIAN', 'IT Operations');
  insertUser.run('employee@nexus.local', hashPassword('EmployeeDemo!2026'), 'Jordan Lee', 'EMPLOYEE', 'Finance');
  insertUser.run('manager@nexus.local', hashPassword('ManagerDemo!2026'), 'Taylor Brooks', 'MANAGER', 'IT Operations');

  const deviceInsert = db.prepare(`INSERT INTO devices
    (device_key,name,hostname,platform,os_version,owner,department,status,cpu_usage,memory_usage,disk_usage,ip_address,last_seen_at,agent_version,health_score,is_demo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`);
  const now = Date.now();
  const demoDevices = [
    ['demo-mbp-014','Design Studio 14','DESIGN-MBP-14','macOS','macOS 15.1','Morgan Ellis','Design','ONLINE',24,58,71,'10.20.4.14',new Date(now-18000).toISOString(),'demo-1.0',96],
    ['demo-fin-022','Finance Workstation 22','FIN-WS-022','Windows','Windows 11 Pro 24H2','Jordan Lee','Finance','WARNING',83,88,91,'10.20.8.22',new Date(now-26000).toISOString(),'demo-1.0',58],
    ['demo-ops-006','Operations Laptop 06','OPS-LT-006','Windows','Windows 11 Enterprise','Avery Morgan','IT Operations','ONLINE',19,47,42,'10.20.2.6',new Date(now-12000).toISOString(),'demo-1.0',99],
    ['demo-ubuntu-003','Build Runner 03','BUILD-UBU-03','Linux','Ubuntu 24.04 LTS','Platform Team','Engineering','OFFLINE',0,0,0,'10.20.6.3',new Date(now-1000*60*19).toISOString(),'demo-1.0',78]
  ];
  for (const row of demoDevices) deviceInsert.run(...row);

  const appInsert = db.prepare(`INSERT INTO applications (name,environment,endpoint,description,criticality,status,response_ms,http_status,last_checked_at)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const appRows = [
    ['NEXUS Service API','Development','http://localhost:4100/api/health','Core service and authentication API','CRITICAL','OPERATIONAL',38,200,new Date().toISOString()],
    ['Employee Workspace','Production','','Internal employee self-service portal','HIGH','UNKNOWN',null,null,null],
    ['Finance Ledger','Production','','Finance transaction and reporting service','CRITICAL','DEGRADED',null,null,null],
    ['Knowledge Hub','Production','','Internal support knowledge service','MEDIUM','OPERATIONAL',126,200,new Date().toISOString()]
  ];
  for (const row of appRows) appInsert.run(...row);

  const incidentInsert = db.prepare(`INSERT INTO incidents (incident_number,title,description,priority,status,source,category,device_id,application_id,assignee,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  incidentInsert.run('INC-2026-00124','Finance workstation running slowly','User reports intermittent lag during month-end reconciliation. Device telemetry indicates elevated CPU and memory utilization.','HIGH','IN_PROGRESS','MONITORING','Endpoint',2,null,'Avery Morgan',admin,new Date(now-1000*60*42).toISOString(),new Date(now-1000*60*8).toISOString());
  incidentInsert.run('INC-2026-00123','Finance ledger health check degraded','Finance Ledger has not reported a successful health check. Endpoint is not configured in this demo workspace.','CRITICAL','OPEN','MONITORING','Application',null,3,'Unassigned',admin,new Date(now-1000*60*76).toISOString(),new Date(now-1000*60*76).toISOString());
  incidentInsert.run('INC-2026-00121','Build runner heartbeat missed','Build Runner 03 has not sent a heartbeat for more than fifteen minutes. Verify host availability and network path.','MEDIUM','PENDING','MONITORING','Endpoint',4,null,'Unassigned',admin,new Date(now-1000*60*19).toISOString(),new Date(now-1000*60*19).toISOString());
  const slaTargets = { CRITICAL:[15,120], HIGH:[30,240], MEDIUM:[120,480], LOW:[240,1440] };
  for (const incident of db.prepare('SELECT id,priority,created_at,status,updated_at FROM incidents').all()) {
    const target = slaTargets[incident.priority] || slaTargets.MEDIUM;
    const created = new Date(incident.created_at).getTime();
    const firstResponseAt = ['IN_PROGRESS','RESOLVED','CLOSED'].includes(incident.status) ? incident.updated_at : null;
    db.prepare('UPDATE incidents SET first_response_at=?,sla_response_due=?,sla_resolution_due=? WHERE id=?')
      .run(firstResponseAt,new Date(created+target[0]*60000).toISOString(),new Date(created+target[1]*60000).toISOString(),incident.id);
  }

  const assetInsert = db.prepare(`INSERT INTO assets (asset_tag,name,category,serial_number,assigned_to,department,status,purchase_date,warranty_until) VALUES (?,?,?,?,?,?,?,?,?)`);
  [
    ['NXS-LT-014','MacBook Pro 14-inch','Laptop','C02NX14A014','Morgan Ellis','Design','IN_USE','2025-02-14','2028-02-14'],
    ['NXS-WS-022','Dell Precision 3581','Workstation','DL3581FIN022','Jordan Lee','Finance','IN_USE','2024-08-06','2027-08-06'],
    ['NXS-NW-003','Cisco Catalyst 9200','Network','FCW9200OPS003','IT Operations','IT Operations','IN_USE','2023-11-18','2026-11-18'],
    ['NXS-MN-008','Dell UltraSharp 27','Monitor','DELLU2724D008','Avery Morgan','IT Operations','IN_USE','2024-04-02','2027-04-02']
  ].forEach(row => assetInsert.run(...row));

  const kbInsert = db.prepare('INSERT INTO knowledge_articles (title,category,summary,content,tags) VALUES (?,?,?,?,?)');
  [
    ['Workstation performance triage','Endpoint','A repeatable first-response checklist for a slow workstation.','1. Confirm whether the issue affects one user or several.\n2. Review CPU, memory and disk utilization over a short observation window.\n3. Identify the top resource-consuming process; do not terminate business-critical processes without approval.\n4. Check available disk space and recent application changes.\n5. Capture evidence, agree a remediation window and verify performance after the change.','windows,performance,cpu,memory'],
    ['VPN connection failure','Network','A safe sequence for isolating common VPN connection problems.','1. Confirm the user can reach the public internet.\n2. Check the device date and time.\n3. Verify DNS resolution for the approved VPN gateway.\n4. Confirm the VPN client service is running.\n5. Review the client error code and authentication status.\n6. Escalate certificate or gateway-side failures to the network team.','vpn,network,dns'],
    ['DNS resolution investigation','Network','Use this checklist when a hostname cannot be resolved.','1. Record the hostname and affected network.\n2. Compare resolution for the internal DNS server and an approved known-good host.\n3. Confirm the configured DNS servers and suffix search list.\n4. Check whether the issue is isolated to one endpoint or shared.\n5. Preserve command output before requesting any cache flush or configuration change.','dns,network,connectivity'],
    ['Application endpoint unavailable','Application Support','A structured first response for an application health-check failure.','1. Confirm the configured health endpoint and expected status code.\n2. Run a request from the monitoring host and compare from an independent network.\n3. Review response time, status code and the last known successful check.\n4. Check service and dependency health.\n5. Correlate the incident with recent releases or infrastructure changes.\n6. Escalate with timestamps and sanitized evidence.','api,application,monitoring']
  ].forEach(row => kbInsert.run(...row));

  const problemOne=db.prepare(`INSERT INTO problems (problem_number,title,description,priority,status,category,root_cause,workaround,owner,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run('PRB-2026-00001','Recurring Finance workstation performance degradation','Several slow-computer incidents have occurred during month-end reconciliation. Review high memory pressure and available disk capacity across the Finance device group.','HIGH','INVESTIGATING','Endpoint','Potential resource contention during month-end data processing. Root cause not yet confirmed.','Ask the user to close non-essential applications and capture resource utilization before making changes.','Avery Morgan',1).lastInsertRowid;
  db.prepare('INSERT OR IGNORE INTO problem_incidents (problem_id,incident_id) VALUES (?,?)').run(problemOne,1);
  db.prepare(`INSERT INTO problems (problem_number,title,description,priority,status,category,root_cause,workaround,owner,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run('PRB-2026-00002','Finance Ledger health-check instability','The application health check has repeatedly failed in the sample workspace. Correlate API health, deployment events and database reachability.','CRITICAL','KNOWN_ERROR','Application','The demo endpoint has not been configured; no production root cause is asserted.','Use the approved application owner runbook and validate endpoint configuration.','Taylor Brooks',1);

  db.prepare(`INSERT INTO changes (change_number,title,description,change_type,risk,status,impact,implementation_plan,rollback_plan,planned_start,planned_end,requested_by,approved_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('CHG-2026-00001','Apply scheduled endpoint agent update','Roll out a minor signed endpoint-agent update to the IT pilot group before wider deployment.','STANDARD','LOW','APPROVED','IT pilot endpoints only; no expected user interruption.','1. Verify package signature. 2. Deploy to two pilot devices. 3. Confirm heartbeat and diagnostics. 4. Review logs before expanding.','Restore the previously approved package and verify that the endpoint reconnects with its existing device identity.','2026-11-10T18:00:00.000Z','2026-11-10T19:00:00.000Z',1,1);
  db.prepare(`INSERT INTO changes (change_number,title,description,change_type,risk,status,impact,implementation_plan,rollback_plan,requested_by) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run('CHG-2026-00002','Rotate internal application health-check credentials','Update monitoring credentials for an internal service following the approved credential rotation procedure.','NORMAL','MEDIUM','REQUESTED','Application monitoring may briefly show an unknown check state.','Coordinate with the service owner, update the secret in the approved secret store and run a validation check.','Restore the previous secret version from the approved secret store and rerun the application health check.',1);

  const financeUser=db.prepare("SELECT id FROM users WHERE email='employee@nexus.local'").get()?.id;
  if(financeUser) db.prepare(`INSERT INTO access_requests (request_number,requester_id,system_name,access_level,business_justification,status,expires_at) VALUES (?,?,?,?,?,?,?)`)
    .run('ACC-2026-00001',financeUser,'Finance Ledger','Read-only','I need read access to review reconciliation status as part of the month-end close process.','PENDING','2026-12-31');

  const metricsInsert = db.prepare('INSERT INTO device_metrics (device_id,cpu,memory,disk,network_rx,network_tx,detail_json,sampled_at) VALUES (?,?,?,?,?,?,?,?)');
  for (let h = 17; h >= 0; h--) {
    const t = new Date(now - h * 5 * 60 * 1000).toISOString();
    const base = 22 + Math.sin(h * 0.72) * 9;
    metricsInsert.run(1, Math.max(8, base), 55 + Math.cos(h * 0.52) * 5, 71, 3.2 + (h % 3), 1.8 + (h % 2), '{}', t);
    metricsInsert.run(2, Math.min(98, 78 + Math.sin(h * 0.7) * 12), 82 + Math.cos(h * 0.4) * 6, 91, 1.2 + (h % 2), 0.8, '{}', t);
    metricsInsert.run(3, Math.max(7, 18 + Math.sin(h * 0.8) * 8), 45 + Math.cos(h * 0.4) * 4, 42, 2.3, 1.1, '{}', t);
  }
  db.prepare(`INSERT INTO audit_logs (actor_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?)`)
    .run(admin,'WORKSPACE_INITIALIZED','SYSTEM','NEXUS',JSON.stringify({ message:'Demo workspace initialized with sample records.' }));
}
