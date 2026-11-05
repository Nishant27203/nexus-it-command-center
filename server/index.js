try { process.loadEnvFile(); } catch {}
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { resolve } from 'node:path';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { db } from './db.js';
import { createSession, hashToken, requireAuth, requireRole, verifyPassword, audit } from './security.js';

const app = express();
const server = createServer(app);
const PORT = Number(process.env.PORT || 4100);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const agentSockets = new Map();
const allowedTasks = new Set(['system_overview','network_summary','dns_lookup','disk_report','process_summary','service_summary','ping_test','tcp_port_check']);

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false }));
app.use('/api/agent/enroll', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));

const asyncRoute = (handler) => (req,res,next) => Promise.resolve(handler(req,res,next)).catch(next);
const json = (value) => { try { return JSON.parse(value || '{}'); } catch { return {}; } };
const isoNow = () => new Date().toISOString();
const asNumber = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const cleanUser = ({id,email,name,role,department}) => ({id,email,name,role,department});

function incidentNumber(id) {
  const year = new Date().getFullYear();
  return `INC-${year}-${String(id).padStart(5,'0')}`;
}

function createIncident({title,description,priority='MEDIUM',source='PORTAL',category='General',deviceId=null,applicationId=null,assignee='Unassigned',createdBy=null}) {
  const minutes = { CRITICAL:[15,120], HIGH:[30,240], MEDIUM:[120,480], LOW:[240,1440] }[priority] || [120,480];
  const createdAt = isoNow();
  const responseDue = new Date(Date.now()+minutes[0]*60000).toISOString();
  const resolutionDue = new Date(Date.now()+minutes[1]*60000).toISOString();
  const result = db.prepare(`INSERT INTO incidents (title,description,priority,status,source,category,device_id,application_id,assignee,created_by,created_at,sla_response_due,sla_resolution_due)
    VALUES (?,?,?,'OPEN',?,?,?,?,?,?,?,?,?)`).run(title,description,priority,source,category,deviceId,applicationId,assignee,createdBy,createdAt,responseDue,resolutionDue);
  const id = Number(result.lastInsertRowid);
  const number = incidentNumber(id);
  db.prepare('UPDATE incidents SET incident_number=? WHERE id=?').run(number,id);
  return db.prepare('SELECT * FROM incidents WHERE id=?').get(id);
}

function deviceView(row) {
  return {
    id: row.id, deviceKey: row.device_key, name: row.name, hostname: row.hostname, platform: row.platform,
    osVersion: row.os_version, owner: row.owner, department: row.department, status: row.status,
    cpuUsage: row.cpu_usage, memoryUsage: row.memory_usage, diskUsage: row.disk_usage,
    ipAddress: row.ip_address, lastSeenAt: row.last_seen_at, agentVersion: row.agent_version,
    healthScore: row.health_score, isDemo: Boolean(row.is_demo), createdAt: row.created_at
  };
}
function getSlaState(row) {
  if (['RESOLVED','CLOSED'].includes(row.status)) return row.resolved_at && row.sla_resolution_due && row.resolved_at <= row.sla_resolution_due ? 'MET' : row.sla_resolution_due ? 'BREACHED' : 'UNSET';
  const now = Date.now();
  if (row.sla_response_due && !row.first_response_at && now > new Date(row.sla_response_due).getTime()) return 'RESPONSE BREACHED';
  if (row.sla_resolution_due && now > new Date(row.sla_resolution_due).getTime()) return 'BREACHED';
  if (row.sla_resolution_due && (new Date(row.sla_resolution_due).getTime()-now) < 60*60*1000) return 'AT RISK';
  return 'ON TRACK';
}
function incidentView(row) {
  return {
    id: row.id, incidentNumber: row.incident_number, title: row.title, description: row.description,
    priority: row.priority, status: row.status, source: row.source, category: row.category,
    deviceId: row.device_id, applicationId: row.application_id, assignee: row.assignee,
    rootCause: row.root_cause, resolutionNotes: row.resolution_notes,
    firstResponseAt: row.first_response_at, slaResponseDue: row.sla_response_due, slaResolutionDue: row.sla_resolution_due, slaState: getSlaState(row),
    createdAt: row.created_at, updatedAt: row.updated_at, resolvedAt: row.resolved_at
  };
}
function applicationView(row) {
  return { id:row.id,name:row.name,environment:row.environment,endpoint:row.endpoint,description:row.description,
    criticality:row.criticality,status:row.status,responseMs:row.response_ms,httpStatus:row.http_status,lastCheckedAt:row.last_checked_at };
}
function recordMetric(deviceId, metrics, details = {}) {
  const cpu = Math.min(100, Math.max(0, asNumber(metrics.cpuUsage)));
  const memory = Math.min(100, Math.max(0, asNumber(metrics.memoryUsage)));
  const disk = Math.min(100, Math.max(0, asNumber(metrics.diskUsage)));
  const health = Math.round(Math.max(0, 100 - Math.max(0,cpu-70)*0.65 - Math.max(0,memory-80)*0.75 - Math.max(0,disk-85)*0.9));
  const status = cpu >= 90 || memory >= 92 || disk >= 95 || health < 70 ? 'WARNING' : 'ONLINE';
  db.prepare(`UPDATE devices SET cpu_usage=?,memory_usage=?,disk_usage=?,ip_address=COALESCE(?,ip_address),
      os_version=COALESCE(?,os_version),status=?,last_seen_at=?,health_score=? WHERE id=?`)
    .run(cpu,memory,disk,metrics.ipAddress || null,metrics.osVersion || null,status,isoNow(),health,deviceId);
  db.prepare(`INSERT INTO device_metrics (device_id,cpu,memory,disk,network_rx,network_tx,detail_json,sampled_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(deviceId,cpu,memory,disk,asNumber(metrics.networkRx),asNumber(metrics.networkTx),JSON.stringify(details),isoNow());
}

function demoDiagnostic(device, type, args={}) {
  const stamp = new Date().toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'medium' });
  const common = [`NEXUS Diagnostic Runner 1.1`, `Target: ${device.hostname || device.name}`, `Platform: ${device.platform} · ${device.os_version || 'Demo environment'}`, `Started: ${stamp}`, ''];
  const outputs = {
    system_overview: [...common,'SYSTEM SUMMARY','────────────────────────────────────────',`CPU utilization       ${device.cpu_usage}%`,`Memory utilization    ${device.memory_usage}%`,`Disk utilization      ${device.disk_usage}%`,`Assigned user         ${device.owner || 'Not assigned'}`,`Network address       ${device.ip_address || 'Unavailable'}`,'','Result: System information collected.'],
    network_summary: [...common,'NETWORK SUMMARY','────────────────────────────────────────','Ethernet interface    Up · 10.20.4.14','Wireless interface    Up · 10.20.4.28','Default route         Present','Interface inventory  2 interfaces','','Result: Interface and address inventory collected in the demo environment.'],
    dns_lookup: [...common,'DNS LOOKUP','────────────────────────────────────────',`Query                 ${args.hostname || 'intranet.company.test'}`,'Resolver              configured endpoint','Address               10.20.1.18','Lookup time           8 ms','','Result: Name resolution completed in the demo environment.'],
    disk_report: [...common,'STORAGE REPORT','────────────────────────────────────────',`Primary volume        ${device.disk_usage}% used`,'File system           NTFS / APFS / ext4','Available space       42.6 GB','Volume health         Healthy','','Result: Storage inventory collected.'],
    process_summary: [...common,'PROCESS SUMMARY','────────────────────────────────────────','Top process           Browser · 18.4% CPU','Second process        Collaboration · 11.2% CPU','Third process         Endpoint protection · 6.8% CPU','','Result: Process inventory collected.'],
    service_summary: [...common,'SERVICE CHECK','────────────────────────────────────────','Network service       Running','Update service        Running','Endpoint agent        Running','','Result: Approved service checks completed.'],
    ping_test: [...common,'CONNECTIVITY TEST','────────────────────────────────────────',`Target                ${args.hostname || 'intranet.company.test'}`,'Packets sent          4','Packets received      4','Packet loss           0%','Average latency       12 ms','','Result: Connectivity test completed in the demo environment.'],
    tcp_port_check: [...common,'TCP CONNECTIVITY CHECK','────────────────────────────────────────',`Target                ${args.hostname || 'service.company.test'}`,`Port                  ${args.port || 443}`,'Connection            Reachable','Elapsed               18 ms','','Result: Single-port connectivity check completed in the demo environment.']
  };
  return { lines: outputs[type] || [...common,'No output available.'], simulated:true, note:'Sample output for the demonstration device; no command was executed on a physical endpoint.' };
}

// Authentication
app.post('/api/auth/login', asyncRoute(async (req,res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(email);
  if (!user || !verifyPassword(password,user.password_hash)) return res.status(401).json({ error:'Email or password is incorrect.' });
  const session = createSession(user.id);
  audit(user.id,'SIGNED_IN','USER',user.id,{});
  res.json({ token:session.token, expiresAt:session.expiresAt, user:cleanUser(user) });
}));
app.get('/api/auth/me',requireAuth,(req,res)=>res.json({user:req.user}));
app.post('/api/auth/logout',requireAuth,(req,res)=>{
  db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.tokenHash);
  audit(req.user.id,'SIGNED_OUT','USER',req.user.id,{});
  res.json({ok:true});
});

// Overview and activity
app.get('/api/overview',requireAuth,(req,res)=>{
  if(req.user.role==='EMPLOYEE'){
    const own=db.prepare('SELECT * FROM incidents WHERE created_by=? ORDER BY created_at DESC LIMIT 5').all(req.user.id).map(incidentView);
    const counts=db.prepare("SELECT COUNT(*) open, SUM(CASE WHEN priority='CRITICAL' THEN 1 ELSE 0 END) critical, SUM(CASE WHEN status='IN_PROGRESS' THEN 1 ELSE 0 END) inProgress FROM incidents WHERE created_by=? AND status NOT IN ('RESOLVED','CLOSED')").get(req.user.id);
    return res.json({devices:{total:0,online:0,warning:0,offline:0},incidents:{open:counts.open||0,critical:counts.critical||0,inProgress:counts.inProgress||0},applications:{total:0,operational:0,degraded:0},latestIncidents:own,latestDevices:[],activity:[],trend:[]});
  }
  const devices = db.prepare(`SELECT COUNT(*) total,
    SUM(CASE WHEN status='ONLINE' THEN 1 ELSE 0 END) online,
    SUM(CASE WHEN status='WARNING' THEN 1 ELSE 0 END) warning,
    SUM(CASE WHEN status='OFFLINE' THEN 1 ELSE 0 END) offline FROM devices`).get();
  const incidents = db.prepare(`SELECT COUNT(*) open,
    SUM(CASE WHEN priority='CRITICAL' AND status NOT IN ('RESOLVED','CLOSED') THEN 1 ELSE 0 END) critical,
    SUM(CASE WHEN status='IN_PROGRESS' THEN 1 ELSE 0 END) inProgress FROM incidents WHERE status NOT IN ('RESOLVED','CLOSED')`).get();
  const apps = db.prepare(`SELECT COUNT(*) total,
    SUM(CASE WHEN status='OPERATIONAL' THEN 1 ELSE 0 END) operational,
    SUM(CASE WHEN status='DEGRADED' THEN 1 ELSE 0 END) degraded FROM applications`).get();
  const latestIncidents = db.prepare('SELECT * FROM incidents ORDER BY created_at DESC LIMIT 5').all().map(incidentView);
  const latestDevices = db.prepare('SELECT * FROM devices ORDER BY CASE status WHEN \'WARNING\' THEN 0 WHEN \'OFFLINE\' THEN 1 ELSE 2 END, last_seen_at DESC LIMIT 6').all().map(deviceView);
  const activity = db.prepare(`SELECT a.*,u.name actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 8`).all().map(r=>({id:r.id,action:r.action,targetType:r.target_type,targetId:r.target_id,actor:r.actor_name||'NEXUS system',details:json(r.details_json),createdAt:r.created_at}));
  const trend = db.prepare(`SELECT MIN(sampled_at) sampledAt, ROUND(AVG(cpu),1) cpu, ROUND(AVG(memory),1) memory
    FROM device_metrics WHERE datetime(sampled_at) >= datetime('now','-24 hours')
    GROUP BY strftime('%Y-%m-%d %H:%M',sampled_at) ORDER BY sampledAt DESC LIMIT 18`).all().reverse();
  res.json({devices:{total:devices.total||0,online:devices.online||0,warning:devices.warning||0,offline:devices.offline||0},
    incidents:{open:incidents.open||0,critical:incidents.critical||0,inProgress:incidents.inProgress||0},
    applications:{total:apps.total||0,operational:apps.operational||0,degraded:apps.degraded||0},
    latestIncidents,latestDevices,activity,trend});
});
app.get('/api/audit',requireAuth,requireRole('ADMIN','MANAGER'),(req,res)=>{
  const rows=db.prepare(`SELECT a.*,u.name actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 80`).all();
  res.json(rows.map(r=>({id:r.id,action:r.action,targetType:r.target_type,targetId:r.target_id,actor:r.actor_name||'NEXUS system',details:json(r.details_json),createdAt:r.created_at})));
});

function agentUrlForRequest(req) {
  if (process.env.PUBLIC_AGENT_URL) return process.env.PUBLIC_AGENT_URL;
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' ? 'wss' : 'ws';
  return `${proto}://${host.replace(/^https?:\/\//,'')}/agent`;
}

// Devices
app.get('/api/devices',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>{
  const rows=db.prepare(`SELECT * FROM devices ORDER BY CASE status WHEN 'WARNING' THEN 0 WHEN 'OFFLINE' THEN 1 WHEN 'PENDING' THEN 2 ELSE 3 END, name`).all();
  res.json(rows.map(deviceView));
});
app.get('/api/devices/:id',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>{
  const id=Number(req.params.id); const device=db.prepare('SELECT * FROM devices WHERE id=?').get(id);
  if(!device)return res.status(404).json({error:'Device not found.'});
  const metrics=db.prepare('SELECT * FROM device_metrics WHERE device_id=? ORDER BY sampled_at DESC LIMIT 24').all(id).reverse();
  const diagnostics=db.prepare('SELECT * FROM diagnostics WHERE device_id=? ORDER BY requested_at DESC LIMIT 10').all(id).map(r=>({id:r.id,taskKey:r.task_key,type:r.task_type,status:r.status,output:json(r.output_json),error:r.error,requestedAt:r.requested_at,completedAt:r.completed_at}));
  res.json({device:deviceView(device),metrics:metrics.map(m=>({cpu:m.cpu,memory:m.memory,disk:m.disk,sampledAt:m.sampled_at})),diagnostics});
});

// Request a fresh endpoint heartbeat. Demo endpoints update their labelled sample metrics;
// enrolled endpoints receive a refresh request and report actual metrics through the agent.
app.post('/api/devices/:id/refresh',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>{
  const id=Number(req.params.id);
  const device=db.prepare('SELECT * FROM devices WHERE id=?').get(id);
  if(!device)return res.status(404).json({error:'Device not found.'});
  if(device.is_demo){
    const bounded=(value,min=2,max=98)=>Math.min(max,Math.max(min,value));
    const cpu=bounded(device.cpu_usage+(Math.random()*12-6));
    const memory=bounded(device.memory_usage+(Math.random()*8-4));
    const disk=bounded(device.disk_usage+(Math.random()*1.4-.7),5,99);
    recordMetric(id,{cpuUsage:cpu,memoryUsage:memory,diskUsage:disk,ipAddress:device.ip_address,osVersion:device.os_version},{source:'DEMO_REFRESH',note:'Values refreshed for local demonstration only.'});
    audit(req.user.id,'DEMO_DEVICE_REFRESHED','DEVICE',id,{simulated:true});
    return res.json({status:'COMPLETED',source:'DEMO_SIMULATION',device:deviceView(db.prepare('SELECT * FROM devices WHERE id=?').get(id)),refreshedAt:isoNow(),message:'Demo metrics refreshed. Values are simulated and labelled.'});
  }
  const socket=agentSockets.get(device.device_key);
  if(!socket||socket.readyState!==WebSocket.OPEN)return res.status(409).json({error:'The endpoint agent is not connected. Confirm the agent is running, then try again.'});
  socket.send(JSON.stringify({type:'refresh_metrics'}));
  audit(req.user.id,'DEVICE_REFRESH_REQUESTED','DEVICE',id,{source:'TECHNICIAN_CONSOLE'});
  res.status(202).json({status:'REQUESTED',requestedAt:isoNow(),message:'Refresh requested from the endpoint agent. Waiting for its next heartbeat.'});
});

// Explicitly labelled demo remediation. This changes only seeded demo telemetry,
// never the operating system or configuration of a real endpoint.
app.post('/api/devices/:id/demo-remediation',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>{
  const id=Number(req.params.id);
  const device=db.prepare('SELECT * FROM devices WHERE id=?').get(id);
  if(!device)return res.status(404).json({error:'Device not found.'});
  if(!device.is_demo)return res.status(403).json({error:'Demo remediation is available only for explicitly labelled demo endpoints.'});
  const action=String(req.body?.action||'');
  const allowed={
    network_reconnect:{cpu:-3,memory:-2,disk:0,description:'Network reconnect workflow simulated'},
    reduce_resource_load:{cpu:-24,memory:-13,disk:0,description:'Resource pressure reduction simulated'},
    disk_cleanup:{cpu:-2,memory:-1,disk:-16,description:'Temporary-file cleanup simulated'},
    refresh_application_check:{cpu:-4,memory:-3,disk:0,description:'Application health refresh simulated'},
    refresh_device_health:{cpu:-5,memory:-4,disk:0,description:'Device health refresh simulated'}
  };
  const selected=allowed[action];
  if(!selected)return res.status(400).json({error:'Choose one of the approved demo actions.'});
  const bounded=(value,min=2,max=98)=>Math.min(max,Math.max(min,value));
  recordMetric(id,{cpuUsage:bounded(device.cpu_usage+selected.cpu),memoryUsage:bounded(device.memory_usage+selected.memory),diskUsage:bounded(device.disk_usage+selected.disk,5,99),ipAddress:device.ip_address,osVersion:device.os_version},{source:'DEMO_REMEDIATION',action,simulated:true,description:selected.description});
  audit(req.user.id,'DEMO_REMEDIATION_APPLIED','DEVICE',id,{action,simulated:true,description:selected.description});
  const updated=db.prepare('SELECT * FROM devices WHERE id=?').get(id);
  res.json({status:'COMPLETED',simulated:true,action,description:selected.description,device:deviceView(updated),message:'Demo-only metric changes applied. No real endpoint configuration was changed.'});
});
app.post('/api/agent/enrollment-codes',requireAuth,requireRole('ADMIN'),(req,res)=>{
  const name=String(req.body?.name||'New endpoint').trim().slice(0,80);
  const platform=String(req.body?.platform||'Windows').trim().slice(0,30);
  const code=randomBytes(18).toString('base64url'); const deviceKey=randomUUID();
  const expires=new Date(Date.now()+30*60*1000).toISOString();
  const result=db.prepare(`INSERT INTO devices (device_key,name,platform,status,enrollment_hash,enrollment_expires_at,health_score)
    VALUES (?,?,?,'PENDING',?,?,100)`).run(deviceKey,name,platform,hashToken(code),expires);
  audit(req.user.id,'DEVICE_ENROLLMENT_CODE_CREATED','DEVICE',result.lastInsertRowid,{name,platform,expiresAt:expires});
  res.status(201).json({deviceId:Number(result.lastInsertRowid),deviceKey,enrollmentCode:code,expiresAt:expires,agentUrl:agentUrlForRequest(req)});
});
app.post('/api/agent/enroll',(req,res)=>{
  const code=String(req.body?.enrollmentCode||'');
  const device=db.prepare('SELECT * FROM devices WHERE enrollment_hash=? AND enrollment_expires_at>?').get(hashToken(code),isoNow());
  if(!device)return res.status(400).json({error:'Enrollment code is invalid or has expired.'});
  const token=randomBytes(32).toString('base64url');
  const hostname=String(req.body?.hostname||'').slice(0,100);
  const osVersion=String(req.body?.osVersion||'').slice(0,100);
  const owner=String(req.body?.owner||'').slice(0,100);
  db.prepare(`UPDATE devices SET hostname=?,os_version=?,owner=?,status='PENDING',device_token_hash=?,enrollment_hash=NULL,enrollment_expires_at=NULL,agent_version=? WHERE id=?`)
    .run(hostname,osVersion,owner,hashToken(token),String(req.body?.agentVersion||'1.1.0').slice(0,20),device.id);
  audit(null,'DEVICE_ENROLLED','DEVICE',device.id,{hostname,platform:device.platform});
  res.json({deviceToken:token,deviceKey:device.device_key,deviceId:device.id,agentUrl:agentUrlForRequest(req)});
});
app.post('/api/devices/:id/diagnostics',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>{
  const id=Number(req.params.id); const device=db.prepare('SELECT * FROM devices WHERE id=?').get(id);
  if(!device)return res.status(404).json({error:'Device not found.'});
  const type=String(req.body?.type||'');
  if(!allowedTasks.has(type))return res.status(400).json({error:'This diagnostic task is not allowed.'});
  const args=req.body?.arguments||{};
  if(['dns_lookup','ping_test','tcp_port_check'].includes(type) && !/^[a-zA-Z0-9.-]{1,253}$/.test(String(args.hostname||''))) return res.status(400).json({error:'Enter a valid hostname.'});
  if(type==='tcp_port_check' && (![22,53,80,443,3000,3306,3389,4100,5432,5433,5173,8080,8443].includes(Number(args.port)))) return res.status(400).json({error:'Choose one supported service port from the approved diagnostic list.'});
  const taskKey=randomUUID();
  const row=db.prepare(`INSERT INTO diagnostics (task_key,device_id,task_type,status,requested_by,arguments_json)
    VALUES (?,?,?,'QUEUED',?,?)`).run(taskKey,id,type,req.user.id,JSON.stringify(args));
  audit(req.user.id,'DIAGNOSTIC_REQUESTED','DEVICE',id,{taskType:type,taskKey});
  if(device.is_demo){
    const output=demoDiagnostic(device,type,args);
    db.prepare(`UPDATE diagnostics SET status='COMPLETED',output_json=?,completed_at=? WHERE id=?`).run(JSON.stringify(output),isoNow(),row.lastInsertRowid);
  } else {
    const socket=agentSockets.get(device.device_key);
    if(!socket || socket.readyState!==WebSocket.OPEN){
      db.prepare(`UPDATE diagnostics SET status='FAILED',error='Endpoint agent is not connected.',completed_at=? WHERE id=?`).run(isoNow(),row.lastInsertRowid);
    } else {
      socket.send(JSON.stringify({type:'run_task',task:{taskKey,type,arguments:args}}));
      db.prepare(`UPDATE diagnostics SET status='SENT' WHERE id=?`).run(row.lastInsertRowid);
    }
  }
  const created=db.prepare('SELECT * FROM diagnostics WHERE id=?').get(row.lastInsertRowid);
  res.status(202).json({id:created.id,taskKey:created.task_key,type:created.task_type,status:created.status,output:json(created.output_json),error:created.error,requestedAt:created.requested_at,completedAt:created.completed_at});
});
app.get('/api/diagnostics/:taskKey',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>{
  const r=db.prepare('SELECT * FROM diagnostics WHERE task_key=?').get(req.params.taskKey);
  if(!r)return res.status(404).json({error:'Diagnostic run not found.'});
  res.json({id:r.id,taskKey:r.task_key,type:r.task_type,status:r.status,output:json(r.output_json),error:r.error,requestedAt:r.requested_at,completedAt:r.completed_at});
});

// Incidents
app.get('/api/incidents',requireAuth,(req,res)=>{
  const status=String(req.query.status||''); const priority=String(req.query.priority||'');
  let sql='SELECT i.*,d.name device_name,a.name application_name FROM incidents i LEFT JOIN devices d ON d.id=i.device_id LEFT JOIN applications a ON a.id=i.application_id WHERE 1=1'; const params=[];
  if(req.user.role==='EMPLOYEE'){sql+=' AND i.created_by=?';params.push(req.user.id);}
  if(status){sql+=' AND i.status=?';params.push(status);} if(priority){sql+=' AND i.priority=?';params.push(priority);}
  sql+=' ORDER BY CASE i.priority WHEN \'CRITICAL\' THEN 0 WHEN \'HIGH\' THEN 1 WHEN \'MEDIUM\' THEN 2 ELSE 3 END, i.created_at DESC LIMIT 150';
  res.json(db.prepare(sql).all(...params).map(r=>({...incidentView(r),deviceName:r.device_name,applicationName:r.application_name})));
});
app.post('/api/incidents',requireAuth,(req,res)=>{
  const title=String(req.body?.title||'').trim().slice(0,200); const description=String(req.body?.description||'').trim().slice(0,4000);
  if(title.length<5||description.length<10)return res.status(400).json({error:'Enter a descriptive title and at least ten characters of detail.'});
  const priority=['LOW','MEDIUM','HIGH','CRITICAL'].includes(req.body?.priority)?req.body.priority:'MEDIUM';
  const deviceId=req.body?.deviceId?Number(req.body.deviceId):null;
  if(deviceId && !db.prepare('SELECT id FROM devices WHERE id=?').get(deviceId)) return res.status(400).json({error:'The selected device does not exist.'});
  const employee=req.user.role==='EMPLOYEE';
  const incident=createIncident({title,description,priority,source:'PORTAL',category:req.body?.category||'General',deviceId:employee?null:deviceId,createdBy:req.user.id,assignee:employee?'Unassigned':(req.body?.assignee||'Unassigned')});
  audit(req.user.id,'INCIDENT_CREATED','INCIDENT',incident.id,{incidentNumber:incident.incident_number,priority});
  res.status(201).json(incidentView(incident));
});
app.patch('/api/incidents/:id',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>{
  const id=Number(req.params.id); const old=db.prepare('SELECT * FROM incidents WHERE id=?').get(id);
  if(!old)return res.status(404).json({error:'Incident not found.'});
  const allowedStatus=['OPEN','IN_PROGRESS','PENDING','RESOLVED','CLOSED'];
  const status=allowedStatus.includes(req.body?.status)?req.body.status:old.status;
  const priority=['LOW','MEDIUM','HIGH','CRITICAL'].includes(req.body?.priority)?req.body.priority:old.priority;
  const assignee=typeof req.body?.assignee==='string'?req.body.assignee.slice(0,100):old.assignee;
  const rootCause=typeof req.body?.rootCause==='string'?req.body.rootCause.slice(0,2000):old.root_cause;
  const resolution=typeof req.body?.resolutionNotes==='string'?req.body.resolutionNotes.slice(0,3000):old.resolution_notes;
  const resolvedAt=status==='RESOLVED'||status==='CLOSED'?(old.resolved_at||isoNow()):null;
  const firstResponseAt=['IN_PROGRESS','RESOLVED','CLOSED'].includes(status)?(old.first_response_at||isoNow()):old.first_response_at;
  const slaMinutes = { CRITICAL:[15,120], HIGH:[30,240], MEDIUM:[120,480], LOW:[240,1440] }[priority] || [120,480];
  const priorityChanged = priority !== old.priority;
  const responseDue = priorityChanged ? new Date(new Date(old.created_at).getTime()+slaMinutes[0]*60000).toISOString() : old.sla_response_due;
  const resolutionDue = priorityChanged ? new Date(new Date(old.created_at).getTime()+slaMinutes[1]*60000).toISOString() : old.sla_resolution_due;
  db.prepare(`UPDATE incidents SET status=?,priority=?,assignee=?,root_cause=?,resolution_notes=?,resolved_at=?,first_response_at=?,sla_response_due=?,sla_resolution_due=?,updated_at=? WHERE id=?`)
    .run(status,priority,assignee,rootCause,resolution, resolvedAt,firstResponseAt,responseDue,resolutionDue,isoNow(),id);
  audit(req.user.id,'INCIDENT_UPDATED','INCIDENT',id,{status,priority,assignee});
  res.json(incidentView(db.prepare('SELECT * FROM incidents WHERE id=?').get(id)));
});

// Problem management: identify recurring incidents and document root cause/workarounds.
const problemView = (r) => ({id:r.id,problemNumber:r.problem_number,title:r.title,description:r.description,priority:r.priority,status:r.status,category:r.category,rootCause:r.root_cause,workaround:r.workaround,permanentFix:r.permanent_fix,owner:r.owner,createdAt:r.created_at,updatedAt:r.updated_at,resolvedAt:r.resolved_at,incidentCount:r.incident_count||0});
app.get('/api/problems',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>{
  const rows=db.prepare(`SELECT p.*,COUNT(pi.incident_id) AS incident_count FROM problems p LEFT JOIN problem_incidents pi ON pi.problem_id=p.id GROUP BY p.id ORDER BY CASE p.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,p.updated_at DESC`).all();
  res.json(rows.map(problemView));
});
app.post('/api/problems',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>{
  const title=String(req.body?.title||'').trim().slice(0,200),description=String(req.body?.description||'').trim().slice(0,4000);
  if(title.length<5||description.length<10)return res.status(400).json({error:'Enter a problem title and at least ten characters of description.'});
  const priority=['LOW','MEDIUM','HIGH','CRITICAL'].includes(req.body?.priority)?req.body.priority:'MEDIUM';
  const result=db.prepare(`INSERT INTO problems (title,description,priority,category,owner,created_by) VALUES (?,?,?,?,?,?)`).run(title,description,priority,String(req.body?.category||'General').slice(0,60),String(req.body?.owner||req.user.name).slice(0,100),req.user.id);
  const id=Number(result.lastInsertRowid); const number=`PRB-${new Date().getFullYear()}-${String(id).padStart(5,'0')}`;
  db.prepare('UPDATE problems SET problem_number=? WHERE id=?').run(number,id);
  const related=Array.isArray(req.body?.relatedIncidentIds)?[...new Set(req.body.relatedIncidentIds.map(Number).filter(Number.isInteger))]:[];
  for(const incidentId of related){if(db.prepare('SELECT id FROM incidents WHERE id=?').get(incidentId))db.prepare('INSERT OR IGNORE INTO problem_incidents (problem_id,incident_id) VALUES (?,?)').run(id,incidentId);}
  audit(req.user.id,'PROBLEM_CREATED','PROBLEM',id,{problemNumber:number,relatedIncidents:related.length});
  res.status(201).json(problemView(db.prepare('SELECT p.*, (SELECT COUNT(*) FROM problem_incidents pi WHERE pi.problem_id=p.id) incident_count FROM problems p WHERE p.id=?').get(id)));
});
app.patch('/api/problems/:id',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>{
  const id=Number(req.params.id),old=db.prepare('SELECT * FROM problems WHERE id=?').get(id);if(!old)return res.status(404).json({error:'Problem record not found.'});
  const statuses=['OPEN','INVESTIGATING','KNOWN_ERROR','RESOLVED','CLOSED'];
  const status=statuses.includes(req.body?.status)?req.body.status:old.status;
  const rootCause=typeof req.body?.rootCause==='string'?req.body.rootCause.slice(0,4000):old.root_cause;
  const workaround=typeof req.body?.workaround==='string'?req.body.workaround.slice(0,4000):old.workaround;
  const permanentFix=typeof req.body?.permanentFix==='string'?req.body.permanentFix.slice(0,4000):old.permanent_fix;
  const owner=typeof req.body?.owner==='string'?req.body.owner.slice(0,100):old.owner;
  db.prepare('UPDATE problems SET status=?,root_cause=?,workaround=?,permanent_fix=?,owner=?,updated_at=?,resolved_at=? WHERE id=?').run(status,rootCause,workaround,permanentFix,owner,isoNow(),['RESOLVED','CLOSED'].includes(status)?(old.resolved_at||isoNow()):null,id);
  audit(req.user.id,'PROBLEM_UPDATED','PROBLEM',id,{status});
  res.json(problemView(db.prepare('SELECT p.*, (SELECT COUNT(*) FROM problem_incidents pi WHERE pi.problem_id=p.id) incident_count FROM problems p WHERE p.id=?').get(id)));
});

// Change management: require implementation and rollback plans for every request.
const changeView=(r)=>({id:r.id,changeNumber:r.change_number,title:r.title,description:r.description,changeType:r.change_type,risk:r.risk,status:r.status,impact:r.impact,implementationPlan:r.implementation_plan,rollbackPlan:r.rollback_plan,plannedStart:r.planned_start,plannedEnd:r.planned_end,requestedBy:r.requested_by_name||'Unknown',approvedBy:r.approved_by_name||null,createdAt:r.created_at,updatedAt:r.updated_at});
const changeSelect=`SELECT c.*,u.name requested_by_name,au.name approved_by_name FROM changes c LEFT JOIN users u ON u.id=c.requested_by LEFT JOIN users au ON au.id=c.approved_by`;
app.get('/api/changes',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>res.json(db.prepare(`${changeSelect} ORDER BY c.created_at DESC LIMIT 200`).all().map(changeView)));
app.post('/api/changes',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>{
  const title=String(req.body?.title||'').trim().slice(0,200),description=String(req.body?.description||'').trim().slice(0,3000),implementation=String(req.body?.implementationPlan||'').trim().slice(0,4000),rollback=String(req.body?.rollbackPlan||'').trim().slice(0,4000);
  if(title.length<5||description.length<10||implementation.length<10||rollback.length<10)return res.status(400).json({error:'Provide a clear description, implementation plan and rollback plan (at least ten characters each).'});
  const type=['STANDARD','NORMAL','EMERGENCY'].includes(req.body?.changeType)?req.body.changeType:'NORMAL';const risk=['LOW','MEDIUM','HIGH','CRITICAL'].includes(req.body?.risk)?req.body.risk:'MEDIUM';
  const result=db.prepare(`INSERT INTO changes (title,description,change_type,risk,impact,implementation_plan,rollback_plan,planned_start,planned_end,requested_by) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(title,description,type,risk,String(req.body?.impact||'').slice(0,2000),implementation,rollback,req.body?.plannedStart||null,req.body?.plannedEnd||null,req.user.id);
  const id=Number(result.lastInsertRowid),number=`CHG-${new Date().getFullYear()}-${String(id).padStart(5,'0')}`;db.prepare('UPDATE changes SET change_number=? WHERE id=?').run(number,id);
  audit(req.user.id,'CHANGE_REQUESTED','CHANGE',id,{changeNumber:number,risk,type});
  res.status(201).json(changeView(db.prepare(`${changeSelect} WHERE c.id=?`).get(id)));
});
app.patch('/api/changes/:id',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>{
  const id=Number(req.params.id),old=db.prepare('SELECT * FROM changes WHERE id=?').get(id);if(!old)return res.status(404).json({error:'Change request not found.'});
  const states=['REQUESTED','ASSESSMENT','APPROVED','SCHEDULED','IMPLEMENTING','COMPLETED','FAILED','REJECTED','CANCELLED'];const status=states.includes(req.body?.status)?req.body.status:old.status;
  if(['APPROVED','REJECTED'].includes(status)&&!['ADMIN','MANAGER'].includes(req.user.role))return res.status(403).json({error:'Only an administrator or manager can approve or reject a change.'});
  const risk=['LOW','MEDIUM','HIGH','CRITICAL'].includes(req.body?.risk)?req.body.risk:old.risk;
  const approvedBy=['APPROVED','SCHEDULED','IMPLEMENTING','COMPLETED','REJECTED'].includes(status)?(old.approved_by||req.user.id):old.approved_by;
  db.prepare('UPDATE changes SET status=?,risk=?,approved_by=?,updated_at=? WHERE id=?').run(status,risk,approvedBy,isoNow(),id);
  audit(req.user.id,'CHANGE_UPDATED','CHANGE',id,{status,risk});res.json(changeView(db.prepare(`${changeSelect} WHERE c.id=?`).get(id)));
});

// Access governance: employee requests; manager/admin review and time-bound approval.
const accessView=(r)=>({id:r.id,requestNumber:r.request_number,requesterId:r.requester_id,requester:r.requester_name,systemName:r.system_name,accessLevel:r.access_level,businessJustification:r.business_justification,status:r.status,reviewer:r.reviewer_name,reviewNotes:r.review_notes,expiresAt:r.expires_at,createdAt:r.created_at});
const accessSelect=`SELECT ar.*,u.name requester_name,ru.name reviewer_name FROM access_requests ar JOIN users u ON u.id=ar.requester_id LEFT JOIN users ru ON ru.id=ar.reviewer_id`;
app.get('/api/access-requests',requireAuth,(req,res)=>{
  const rows=req.user.role==='EMPLOYEE'?db.prepare(`${accessSelect} WHERE ar.requester_id=? ORDER BY ar.created_at DESC`).all(req.user.id):db.prepare(`${accessSelect} ORDER BY ar.created_at DESC LIMIT 200`).all();res.json(rows.map(accessView));
});
app.post('/api/access-requests',requireAuth,(req,res)=>{
  const system=String(req.body?.systemName||'').trim().slice(0,120),level=String(req.body?.accessLevel||'').trim().slice(0,80),justification=String(req.body?.businessJustification||'').trim().slice(0,2000);
  if(system.length<2||level.length<2||justification.length<15)return res.status(400).json({error:'Provide a system, access level and a business justification of at least 15 characters.'});
  const result=db.prepare('INSERT INTO access_requests (requester_id,system_name,access_level,business_justification,expires_at) VALUES (?,?,?,?,?)').run(req.user.id,system,level,justification,req.body?.expiresAt||null);
  const id=Number(result.lastInsertRowid),number=`ACC-${new Date().getFullYear()}-${String(id).padStart(5,'0')}`;db.prepare('UPDATE access_requests SET request_number=? WHERE id=?').run(number,id);
  audit(req.user.id,'ACCESS_REQUESTED','ACCESS_REQUEST',id,{system,level});res.status(201).json(accessView(db.prepare(`${accessSelect} WHERE ar.id=?`).get(id)));
});
app.patch('/api/access-requests/:id',requireAuth,requireRole('ADMIN','MANAGER'),(req,res)=>{
  const id=Number(req.params.id),old=db.prepare('SELECT * FROM access_requests WHERE id=?').get(id);if(!old)return res.status(404).json({error:'Access request not found.'});
  if(!['APPROVED','REJECTED','NEEDS_INFORMATION'].includes(req.body?.status))return res.status(400).json({error:'Choose APPROVED, REJECTED or NEEDS_INFORMATION.'});
  const status=req.body.status,notes=String(req.body?.reviewNotes||'').slice(0,2000);db.prepare('UPDATE access_requests SET status=?,reviewer_id=?,review_notes=?,updated_at=? WHERE id=?').run(status,req.user.id,notes,isoNow(),id);
  audit(req.user.id,'ACCESS_REQUEST_REVIEWED','ACCESS_REQUEST',id,{status});res.json(accessView(db.prepare(`${accessSelect} WHERE ar.id=?`).get(id)));
});

// Operational reports for service owners and managers.
app.get('/api/reports/summary',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>{
  const scalar=(sql)=>db.prepare(sql).get().n||0;
  const group=(sql)=>db.prepare(sql).all();
  res.json({
    incidents:{total:scalar('SELECT COUNT(*) n FROM incidents'),active:scalar("SELECT COUNT(*) n FROM incidents WHERE status NOT IN ('RESOLVED','CLOSED')"),byPriority:group('SELECT priority label,COUNT(*) value FROM incidents GROUP BY priority ORDER BY value DESC'),byStatus:group('SELECT status label,COUNT(*) value FROM incidents GROUP BY status ORDER BY value DESC')},
    devices:{total:scalar('SELECT COUNT(*) n FROM devices'),enrolled:scalar('SELECT COUNT(*) n FROM devices WHERE is_demo=0'),warning:scalar("SELECT COUNT(*) n FROM devices WHERE status='WARNING'"),offline:scalar("SELECT COUNT(*) n FROM devices WHERE status='OFFLINE'")},
    problems:{total:scalar('SELECT COUNT(*) n FROM problems'),open:scalar("SELECT COUNT(*) n FROM problems WHERE status NOT IN ('RESOLVED','CLOSED')")},
    changes:{total:scalar('SELECT COUNT(*) n FROM changes'),pending:scalar("SELECT COUNT(*) n FROM changes WHERE status IN ('REQUESTED','ASSESSMENT')"),completed:scalar("SELECT COUNT(*) n FROM changes WHERE status='COMPLETED'")},
    accessRequests:{total:scalar('SELECT COUNT(*) n FROM access_requests'),pending:scalar("SELECT COUNT(*) n FROM access_requests WHERE status='PENDING'")},
    apps:{total:scalar('SELECT COUNT(*) n FROM applications'),degraded:scalar("SELECT COUNT(*) n FROM applications WHERE status='DEGRADED'")}
  });
});

// Application monitoring
app.get('/api/applications',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>res.json(db.prepare('SELECT * FROM applications ORDER BY CASE criticality WHEN \'CRITICAL\' THEN 0 WHEN \'HIGH\' THEN 1 ELSE 2 END,name').all().map(applicationView)));
app.post('/api/applications',requireAuth,requireRole('ADMIN'),asyncRoute(async(req,res)=>{
  const name=String(req.body?.name||'').trim(); const endpoint=String(req.body?.endpoint||'').trim();
  if(name.length<3)return res.status(400).json({error:'Application name must contain at least three characters.'});
  if(endpoint){try{await validateMonitorEndpoint(endpoint);}catch(e){return res.status(400).json({error:e.message||'Enter a valid HTTP or HTTPS health-check URL.'});}}
  const result=db.prepare(`INSERT INTO applications (name,environment,endpoint,description,criticality,status) VALUES (?,?,?,?,?,'UNKNOWN')`)
    .run(name,String(req.body?.environment||'Production'),endpoint||null,String(req.body?.description||''),['LOW','MEDIUM','HIGH','CRITICAL'].includes(req.body?.criticality)?req.body.criticality:'MEDIUM');
  audit(req.user.id,'APPLICATION_CREATED','APPLICATION',result.lastInsertRowid,{name,endpoint});
  res.status(201).json(applicationView(db.prepare('SELECT * FROM applications WHERE id=?').get(result.lastInsertRowid)));
}));
function isPrivateAddress(address) {
  const v4 = address.split('.').map(Number);
  if (v4.length === 4 && v4.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return v4[0] === 10 || v4[0] === 127 || v4[0] === 0 ||
      (v4[0] === 172 && v4[1] >= 16 && v4[1] <= 31) ||
      (v4[0] === 192 && v4[1] === 168) ||
      (v4[0] === 169 && v4[1] === 254) ||
      (v4[0] === 100 && v4[1] >= 64 && v4[1] <= 127) ||
      (v4[0] === 198 && (v4[1] === 18 || v4[1] === 19)) || v4[0] >= 224;
  }
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
  return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') ||
    lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') ||
    lower.startsWith('feb') || lower.startsWith('::ffff:127.') || lower.startsWith('::ffff:10.');
}

async function validateMonitorEndpoint(value) {
  const u = new URL(value);
  if (!['http:','https:'].includes(u.protocol) || u.username || u.password) throw new Error('Only credential-free HTTP or HTTPS endpoints are supported.');
  const allowlist = (process.env.MONITOR_ALLOWED_HOSTS || 'localhost,127.0.0.1,::1').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  const explicitlyAllowed = allowlist.includes(host);
  const ipVersion = isIP(host);
  if (ipVersion) {
    if (isPrivateAddress(host) && !explicitlyAllowed) throw new Error('Private or link-local IP endpoints must be added to MONITOR_ALLOWED_HOSTS.');
    return u;
  }
  if (explicitlyAllowed) return u;
  const records = await lookup(host,{all:true,verbatim:true}).catch(()=>[]);
  if (!records.length) throw new Error('The health-check hostname could not be resolved.');
  if (records.some(record=>isPrivateAddress(record.address))) throw new Error('Health-check hostname resolves to a private address. Add the trusted host to MONITOR_ALLOWED_HOSTS if this is an internal service.');
  return u;
}

async function runAppCheck(id,actorId=null) {
  const appRow=db.prepare('SELECT * FROM applications WHERE id=?').get(id); if(!appRow)throw new Error('Application not found.');
  if(!appRow.endpoint)throw new Error('No health-check endpoint has been configured for this application.');
  await validateMonitorEndpoint(appRow.endpoint);
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),6000); const start=Date.now();
  let status='OPERATIONAL',httpStatus=null,error=null;
  try { const response=await fetch(appRow.endpoint,{signal:controller.signal,redirect:'error',headers:{'User-Agent':'NEXUS-Monitor/1.0'}});httpStatus=response.status;if(!response.ok)status='DEGRADED'; }
  catch(e){status='DEGRADED';error=e.name==='AbortError'?'Health check timed out.':String(e.message).slice(0,240);} finally {clearTimeout(timer);}
  const responseMs=Date.now()-start; const checkedAt=isoNow();
  db.prepare('UPDATE applications SET status=?,response_ms=?,http_status=?,last_checked_at=? WHERE id=?').run(status,responseMs,httpStatus,checkedAt,id);
  db.prepare('INSERT INTO application_checks (application_id,status,response_ms,http_status,error,checked_at) VALUES (?,?,?,?,?,?)').run(id,status,responseMs,httpStatus,error,checkedAt);
  if(status==='DEGRADED'){
    const existing=db.prepare(`SELECT id FROM incidents WHERE application_id=? AND status NOT IN ('RESOLVED','CLOSED') LIMIT 1`).get(id);
    if(!existing){const incident=createIncident({title:`${appRow.name} health check degraded`,description:error||`Health check returned HTTP ${httpStatus}. Response time: ${responseMs} ms.`,priority:appRow.criticality==='CRITICAL'?'CRITICAL':'HIGH',source:'MONITORING',category:'Application',applicationId:id,createdBy:null});audit(null,'MONITORING_INCIDENT_CREATED','INCIDENT',incident.id,{application:appRow.name});}
  }
  if(actorId)audit(actorId,'APPLICATION_CHECKED','APPLICATION',id,{status,responseMs,httpStatus,error});
  return applicationView(db.prepare('SELECT * FROM applications WHERE id=?').get(id));
}
app.post('/api/applications/:id/check',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),asyncRoute(async(req,res)=>{
  try{res.json(await runAppCheck(Number(req.params.id),req.user.id));}catch(e){res.status(400).json({error:e.message});}
}));
app.get('/api/applications/:id/checks',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>{
  const rows=db.prepare('SELECT * FROM application_checks WHERE application_id=? ORDER BY checked_at DESC LIMIT 40').all(Number(req.params.id));
  res.json(rows.map(r=>({id:r.id,status:r.status,responseMs:r.response_ms,httpStatus:r.http_status,error:r.error,checkedAt:r.checked_at})));
});

// Assets and knowledge
app.get('/api/assets',requireAuth,requireRole('ADMIN','TECHNICIAN','MANAGER'),(req,res)=>res.json(db.prepare('SELECT * FROM assets ORDER BY asset_tag').all().map(r=>({id:r.id,assetTag:r.asset_tag,name:r.name,category:r.category,serialNumber:r.serial_number,assignedTo:r.assigned_to,department:r.department,status:r.status,purchaseDate:r.purchase_date,warrantyUntil:r.warranty_until}))));
app.get('/api/knowledge',requireAuth,(req,res)=>res.json(db.prepare('SELECT * FROM knowledge_articles ORDER BY updated_at DESC').all().map(r=>({id:r.id,title:r.title,category:r.category,summary:r.summary,content:r.content,tags:r.tags.split(',').filter(Boolean),updatedAt:r.updated_at}))));

// Agent WebSocket: agents authenticate with a one-time enrolled device credential.
const wss=new WebSocketServer({noServer:true,maxPayload:64*1024});
const agentKeepalive=setInterval(()=>{
  for(const ws of wss.clients){
    if(ws.readyState!==WebSocket.OPEN)continue;
    if(ws.isAlive===false){ws.terminate();continue;}
    ws.isAlive=false;ws.ping();
  }
  const staleBefore=new Date(Date.now()-45000).toISOString();
  db.prepare("UPDATE devices SET status='OFFLINE' WHERE is_demo=0 AND status IN ('ONLINE','WARNING') AND last_seen_at<?").run(staleBefore);
},30000).unref();
server.on('upgrade',(req,socket,head)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname!=='/agent' || req.headers.origin){socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
wss.on('connection',(ws,req)=>{
  const auth=req.headers.authorization||''; const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!token){ws.close(4401,'Missing device credential');return;}
  const device=db.prepare('SELECT * FROM devices WHERE device_token_hash=?').get(hashToken(token));
  if(!device){ws.close(4403,'Invalid device credential');return;}
  const previous=agentSockets.get(device.device_key); if(previous&&previous!==ws)previous.close(4001,'Replaced by a newer connection');
  ws.deviceKey=device.device_key;ws.deviceId=device.id;ws.isAlive=true;agentSockets.set(device.device_key,ws);
  ws.on('pong',()=>{ws.isAlive=true;});
  db.prepare("UPDATE devices SET status='ONLINE',last_seen_at=? WHERE id=?").run(isoNow(),device.id);
  ws.send(JSON.stringify({type:'connected',deviceId:device.id,serverTime:isoNow()}));
  ws.on('message',buffer=>{
    let message;try{message=JSON.parse(buffer.toString());}catch{return;}
    if(message.type==='heartbeat'){
      const m=message.metrics||{};
      recordMetric(device.id,{cpuUsage:m.cpuUsage,memoryUsage:m.memoryUsage,diskUsage:m.diskUsage,networkRx:m.networkRx,networkTx:m.networkTx,ipAddress:m.ipAddress,osVersion:m.osVersion},{platform:m.platform,uptime:m.uptime,processCount:m.processCount});
      return;
    }
    if(message.type==='task_result' && typeof message.taskKey==='string'){
      const task=db.prepare('SELECT * FROM diagnostics WHERE task_key=? AND device_id=?').get(message.taskKey,device.id);
      if(!task)return;
      const status=message.status==='COMPLETED'?'COMPLETED':'FAILED';
      db.prepare('UPDATE diagnostics SET status=?,output_json=?,error=?,completed_at=? WHERE task_key=?')
        .run(status,JSON.stringify(message.output||{}),message.error||null,isoNow(),message.taskKey);
      audit(null,'REMOTE_DIAGNOSTIC_COMPLETED','DEVICE',device.id,{taskType:task.task_type,status});
    }
  });
  ws.on('close',()=>{
    if(agentSockets.get(device.device_key)===ws){agentSockets.delete(device.device_key);db.prepare("UPDATE devices SET status='OFFLINE' WHERE id=? AND is_demo=0").run(device.id);}
  });
  ws.on('error',()=>{});
});

// Health and fallback client
app.get('/api/health',(req,res)=>res.json({ok:true,service:'NEXUS IT Command Center API',version:'1.1.0',time:isoNow()}));
const distPath=resolve('dist');
app.use(express.static(distPath));
app.get('*',(req,res,next)=>{if(req.path.startsWith('/api/'))return next();res.sendFile(resolve(distPath,'index.html'),err=>{if(err)next();});});
app.use((err,req,res,next)=>{
  console.error('[NEXUS API]',err.message);
  if(res.headersSent)return next(err);
  res.status(500).json({error:'An unexpected server error occurred.'});
});

server.listen(PORT,()=>console.log(`NEXUS API listening on http://localhost:${PORT}`));

// Check configured endpoints every two minutes. Unconfigured applications are intentionally skipped.
setInterval(async()=>{
  const configured=db.prepare("SELECT id FROM applications WHERE endpoint IS NOT NULL AND endpoint<>''").all();
  for(const row of configured){try{await runAppCheck(row.id);}catch(error){console.error('[NEXUS monitor]',error.message);}}
},120000).unref();
