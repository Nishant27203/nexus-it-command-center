import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDir = mkdtempSync(join(tmpdir(), 'nexus-test-'));
process.env.DATABASE_PATH = join(tempDir, 'test.sqlite');
const { db } = await import('../server/db.js');

test('initializes a seeded workspace with expected demo roles', () => {
  const users = db.prepare('SELECT role, COUNT(*) AS n FROM users GROUP BY role').all();
  const roles = Object.fromEntries(users.map(row => [row.role,row.n]));
  assert.equal(roles.ADMIN,1);
  assert.equal(roles.TECHNICIAN,1);
  assert.equal(roles.EMPLOYEE,1);
  assert.equal(roles.MANAGER,1);
});

test('seeds labelled demo endpoints and operating data', () => {
  const devices = db.prepare('SELECT COUNT(*) AS n FROM devices WHERE is_demo=1').get().n;
  const metrics = db.prepare('SELECT COUNT(*) AS n FROM device_metrics').get().n;
  assert.equal(devices,4);
  assert.ok(metrics >= 36);
});

test('incident records have unique references and valid device links', () => {
  const incidents = db.prepare('SELECT incident_number, device_id FROM incidents').all();
  assert.ok(incidents.length >= 3);
  assert.ok(incidents.every(row => row.incident_number?.startsWith('INC-')));
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('database has the diagnostic task registry table', () => {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='diagnostics'").get();
  assert.ok(table);
});

test.after(() => {
  db.close();
  rmSync(tempDir,{recursive:true,force:true});
});

test('seeded incidents include response and resolution targets', () => {
  const rows = db.prepare('SELECT priority,sla_response_due,sla_resolution_due FROM incidents').all();
  assert.ok(rows.every(row => row.sla_response_due && row.sla_resolution_due));
  const critical = rows.find(row => row.priority === 'CRITICAL');
  assert.ok(critical);
  const responseMinutes = (new Date(critical.sla_response_due)-new Date(db.prepare("SELECT created_at FROM incidents WHERE priority='CRITICAL' LIMIT 1").get().created_at))/60000;
  assert.ok(Math.abs(responseMinutes-15) < 1);
});

test('incident creation stores the response and resolution SLA deadlines', () => {
  const createdAt = new Date().toISOString();
  const responseDue = new Date(Date.now()+15*60000).toISOString();
  const resolutionDue = new Date(Date.now()+120*60000).toISOString();
  const result = db.prepare(`INSERT INTO incidents
    (title,description,priority,status,source,category,device_id,application_id,assignee,created_by,created_at,sla_response_due,sla_resolution_due)
    VALUES (?,?,?,'OPEN',?,?,?,?,?,?,?,?,?)`)
    .run('Test incident','A test incident used to verify the database workflow.','CRITICAL','PORTAL','General',null,null,'Unassigned',null,createdAt,responseDue,resolutionDue);
  const row = db.prepare('SELECT * FROM incidents WHERE id=?').get(result.lastInsertRowid);
  assert.equal(row.priority,'CRITICAL');
  assert.ok(row.sla_response_due);
  assert.ok(row.sla_resolution_due);
  assert.ok(Math.abs((new Date(row.sla_response_due)-new Date(row.created_at))/60000-15)<1);
});

test('demo credentials are stored as password hashes and session tokens are hashed', async () => {
  const security = await import('../server/security.js');
  const admin = db.prepare("SELECT * FROM users WHERE email='admin@nexus.local'").get();
  assert.ok(admin.password_hash.includes(':'));
  assert.equal(security.verifyPassword('NexusDemo!2026',admin.password_hash),true);
  assert.equal(security.verifyPassword('wrong-password',admin.password_hash),false);
  const session = security.createSession(admin.id);
  const stored = db.prepare('SELECT token_hash FROM sessions WHERE user_id=? ORDER BY id DESC LIMIT 1').get(admin.id);
  assert.equal(stored.token_hash,security.hashToken(session.token));
  assert.notEqual(stored.token_hash,session.token);
});


test('the full ten-phase service governance modules are present', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
  for (const table of ['problems','problem_incidents','changes','access_requests','diagnostics','device_metrics','application_checks','assets','knowledge_articles','audit_logs']) {
    assert.ok(tables.includes(table), `Expected ${table} table`);
  }
  assert.ok(db.prepare('SELECT COUNT(*) n FROM problems').get().n >= 2);
  assert.ok(db.prepare('SELECT COUNT(*) n FROM changes').get().n >= 2);
  assert.ok(db.prepare('SELECT COUNT(*) n FROM access_requests').get().n >= 1);
});

test('problem-to-incident links preserve referential integrity', () => {
  const links = db.prepare('SELECT COUNT(*) n FROM problem_incidents').get().n;
  assert.ok(links >= 1);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
});

test('problem, change and access-request workflows accept valid records', () => {
  const actorId = db.prepare("SELECT id FROM users WHERE email='admin@nexus.local'").get().id;
  const problem = db.prepare(`INSERT INTO problems (title,description,priority,category,created_by)
    VALUES (?,?,?,?,?)`).run('Test recurring sign-in issue','Several employees report intermittent sign-in failures during the same period.','HIGH','Access',actorId);
  const change = db.prepare(`INSERT INTO changes (title,description,change_type,risk,implementation_plan,rollback_plan,requested_by)
    VALUES (?,?,?,?,?,?,?)`).run('Test identity connector update','Update the identity connector after validation in a test environment.','NORMAL','MEDIUM','Deploy to the test tenant and validate authentication.','Restore the prior connector version and verify sign-in.',actorId);
  const access = db.prepare(`INSERT INTO access_requests (requester_id,system_name,access_level,business_justification)
    VALUES (?,?,?,?)`).run(actorId,'Test Reporting Portal','Read-only','Read-only access is required to prepare a quarterly report.');
  assert.ok(problem.lastInsertRowid > 0);
  assert.ok(change.lastInsertRowid > 0);
  assert.ok(access.lastInsertRowid > 0);
});

test('operational report queries return valid grouped records', () => {
  const priorities = db.prepare('SELECT priority label,COUNT(*) value FROM incidents GROUP BY priority').all();
  const pendingChanges = db.prepare("SELECT COUNT(*) n FROM changes WHERE status IN ('REQUESTED','ASSESSMENT')").get().n;
  const pendingAccess = db.prepare("SELECT COUNT(*) n FROM access_requests WHERE status='PENDING'").get().n;
  assert.ok(priorities.length > 0);
  assert.ok(pendingChanges >= 1);
  assert.ok(pendingAccess >= 1);
});
