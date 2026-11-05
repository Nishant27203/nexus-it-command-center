try { process.loadEnvFile(); } catch {}
import si from 'systeminformation';
import WebSocket from 'ws';
import { lookup } from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Socket } from 'node:net';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const configPath = resolve(process.env.NEXUS_AGENT_CONFIG || './agent/config.json');
const serverBase = (process.env.NEXUS_SERVER || 'http://localhost:4100').replace(/\/$/, '');
const enrollmentCode = process.env.NEXUS_ENROLLMENT_CODE || '';
const version = '1.1.0';
const allowedTasks = new Set(['system_overview','network_summary','dns_lookup','disk_report','process_summary','service_summary','ping_test','tcp_port_check']);
const execFileAsync = promisify(execFile);
const allowedPorts = new Set([22,53,80,443,3000,3306,3389,4100,5432,5433,5173,8080,8443]);
let config;
let socket;
let heartbeatTimer;
let reconnectDelay = 1500;
let closing = false;

const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const pct = (value) => Math.max(0, Math.min(100, safeNumber(value)));
const line = (label,value) => `${label.padEnd(22)} ${value}`;

async function readConfig() {
  try { config = JSON.parse(await readFile(configPath,'utf8')); return true; }
  catch { return false; }
}

async function enroll() {
  if (!enrollmentCode) {
    console.error('No device credential found. Set NEXUS_ENROLLMENT_CODE to a one-time code from the NEXUS console.');
    process.exit(1);
  }
  const osInfo = await si.osInfo();
  const response = await fetch(`${serverBase}/api/agent/enroll`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({enrollmentCode,hostname:os.hostname(),osVersion:`${osInfo.distro || osInfo.platform} ${osInfo.release}`,platform:osInfo.platform,agentVersion:version})
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(result.error || 'Device enrollment failed.');
  config = { deviceToken:result.deviceToken, deviceKey:result.deviceKey, deviceId:result.deviceId, agentUrl:result.agentUrl, enrolledAt:new Date().toISOString() };
  await mkdir(dirname(configPath),{recursive:true});
  await writeFile(configPath,JSON.stringify(config,null,2),{mode:0o600});
  console.log(`Enrolled device ${result.deviceId}. Credential saved to ${configPath}.`);
}

async function collectMetrics() {
  const [cpu,mem,disks,networks,osInfo,processes] = await Promise.all([
    si.currentLoad(),si.mem(),si.fsSize(),si.networkInterfaces(),si.osInfo(),si.processes()
  ]);
  const primaryDisk = disks.filter(d=>d.size>0).sort((a,b)=>(b.size-b.used)-(a.size-a.used))[0];
  const primaryNet = Array.isArray(networks) ? networks.find(n=>n.ip4 && !n.internal) : networks;
  let netStats=[];
  try { netStats=await si.networkStats(primaryNet?.iface); } catch {}
  const n=Array.isArray(netStats)?netStats[0]:netStats;
  return {
    cpuUsage:pct(cpu.currentLoad),
    memoryUsage:mem.total?pct((mem.used/mem.total)*100):0,
    diskUsage:primaryDisk?.size?pct((primaryDisk.used/primaryDisk.size)*100):0,
    networkRx:safeNumber(n?.rx_sec),networkTx:safeNumber(n?.tx_sec),
    ipAddress:primaryNet?.ip4 || '',osVersion:`${osInfo.distro || osInfo.platform} ${osInfo.release}`,
    platform:osInfo.platform,uptime:os.uptime(),processCount:processes.all
  };
}

async function taskOutput(type,args={}) {
  const stamp=new Date().toLocaleString();
  const metrics=await collectMetrics();
  const header=['NEXUS Diagnostic Runner 1.1',`Target: ${os.hostname()}`,`Platform: ${metrics.osVersion}`,`Started: ${stamp}`,''];
  if(type==='system_overview'){
    return {lines:[...header,'SYSTEM SUMMARY','────────────────────────────────────────',line('CPU utilization',`${metrics.cpuUsage.toFixed(1)}%`),line('Memory utilization',`${metrics.memoryUsage.toFixed(1)}%`),line('Disk utilization',`${metrics.diskUsage.toFixed(1)}%`),line('IP address',metrics.ipAddress||'Not assigned'),line('Running processes',metrics.processCount),line('Uptime',`${Math.floor(metrics.uptime/3600)} hours`),'','Result: System information collected.']};
  }
  if(type==='network_summary'){
    const interfaces=await si.networkInterfaces();
    const rows=(Array.isArray(interfaces)?interfaces:[interfaces]).filter(n=>!n.internal).slice(0,5);
    const output=[...header,'NETWORK INTERFACES','────────────────────────────────────────'];
    for(const n of rows) output.push(line(n.iface,`${n.ip4||'No IPv4'} · ${n.operstate||'unknown'} · ${n.type||'interface'}`));
    output.push('',`Primary address       ${metrics.ipAddress||'Not assigned'}`,'Result: Network interface inventory collected.');
    return {lines:output};
  }
  if(type==='dns_lookup'){
    const hostname=String(args.hostname||'').trim();
    if(!/^[a-zA-Z0-9.-]{1,253}$/.test(hostname))throw new Error('Invalid hostname. Only a hostname or domain name is accepted.');
    const started=Date.now();const records=await lookup(hostname,{all:true,verbatim:true});
    return {lines:[...header,'DNS LOOKUP','────────────────────────────────────────',line('Query',hostname),line('Lookup time',`${Date.now()-started} ms`),...records.map((r,i)=>line(`Address ${i+1}`,`${r.address} · IPv${r.family}`)),'','Result: Name resolution completed.']};
  }
  if(type==='ping_test'){
    const hostname=String(args.hostname||'').trim();
    if(!/^[a-zA-Z0-9.-]{1,253}$/.test(hostname))throw new Error('Invalid host. Enter a DNS name or IPv4 hostname.');
    const windows=process.platform==='win32';
    const argsList=windows?['-n','4','-w','1000',hostname]:['-c','4','-W','2',hostname];
    const started=Date.now();let stdout='';let stderr='';
    try{const result=await execFileAsync('ping',argsList,{timeout:12000,maxBuffer:32*1024,windowsHide:true});stdout=result.stdout||'';stderr=result.stderr||'';}
    catch(error){stdout=error.stdout||'';stderr=error.stderr||'';}
    const combined=`${stdout}\n${stderr}`.trim();
    const receivedMatch=combined.match(/(\d+)\s+(?:packets? )?(?:received|received,)/i)||combined.match(/Received = (\d+)/i);
    const received=receivedMatch?Number(receivedMatch[1]):(/time[=<]/i.test(combined)?1:0);
    const latencyMatch=combined.match(/Average = (\d+)ms/i)||combined.match(/min\/avg\/max[^=]*=\s*([0-9.]+)\//i)||combined.match(/time[=<]([0-9.]+)\s*ms/i);
    return {lines:[...header,'HOST REACHABILITY TEST','────────────────────────────────────────',line('Target',hostname),line('Packets sent','4'),line('Packets received',String(received)),line('Packet loss',`${Math.round((4-received)/4*100)}%`),line('Elapsed',`${Date.now()-started} ms`),line('Average latency',latencyMatch?`${latencyMatch[1]} ms`:'Not reported'),'','OUTPUT',combined.slice(0,2200)||'No response received.','',received>0?'Result: Host responded to ICMP echo.':'Result: No ICMP response. This may indicate a network path issue or that ICMP is blocked.']};
  }
  if(type==='tcp_port_check'){
    const hostname=String(args.hostname||'').trim();const port=Number(args.port);
    if(!/^[a-zA-Z0-9.-]{1,253}$/.test(hostname))throw new Error('Invalid host name.');
    if(!allowedPorts.has(port))throw new Error('This port is not on the approved service-check list.');
    const started=Date.now();
    const result=await new Promise(resolve=>{
      const client=new Socket();let settled=false;
      const finish=(reachable,error)=>{if(settled)return;settled=true;client.destroy();resolve({reachable,error});};
      client.setTimeout(3500,()=>finish(false,'Connection timed out.'));
      client.once('connect',()=>finish(true,null));
      client.once('error',err=>finish(false,err.code||err.message));
      client.connect(port,hostname);
    });
    return {lines:[...header,'TCP SERVICE CONNECTIVITY','────────────────────────────────────────',line('Target',hostname),line('Port',String(port)),line('Result',result.reachable?'REACHABLE':'NOT REACHABLE'),line('Elapsed',`${Date.now()-started} ms`),result.error?line('Detail',result.error):'','Result: A single approved TCP service port was tested. No port range was scanned.']};
  }
  if(type==='disk_report'){
    const disks=await si.fsSize();const output=[...header,'STORAGE REPORT','────────────────────────────────────────'];
    for(const d of disks.filter(x=>x.size>0).slice(0,8)) output.push(line(d.mount,`${(d.used/1024**3).toFixed(1)} GB / ${(d.size/1024**3).toFixed(1)} GB · ${pct(d.use).toFixed(0)}% used`));
    output.push('','Result: Volume inventory collected.');return {lines:output};
  }
  if(type==='process_summary'){
    const procs=await si.processes();const top=[...procs.list].sort((a,b)=>safeNumber(b.pcpu)-safeNumber(a.pcpu)).slice(0,7);
    const output=[...header,'TOP PROCESSES BY CPU','────────────────────────────────────────'];
    for(const p of top) output.push(line(String(p.name||p.command||'process').slice(0,21),`${safeNumber(p.pcpu).toFixed(1)}% CPU · ${safeNumber(p.pmem).toFixed(1)}% memory`));
    output.push('','Result: Process summary collected. No process was stopped or modified.');return {lines:output};
  }
  if(type==='service_summary'){
    let services=[];let warning='';
    try{services=await si.services(['ssh','sshd','cron','systemd-networkd','wuauserv','WinDefend','Spooler']);}catch(e){warning=e.message;}
    const output=[...header,'APPROVED SERVICE CHECK','────────────────────────────────────────'];
    if(Array.isArray(services)&&services.length){for(const s of services.slice(0,12))output.push(line(s.name||s.displayName||'service',s.running?'Running':String(s.state||'State unavailable')));}
    else output.push('Service inventory is not available on this platform.');
    if(warning)output.push(`Note: ${warning.slice(0,120)}`);
    output.push('','Result: Read-only service inventory attempted.');return {lines:output};
  }
  throw new Error('Diagnostic task is not in the approved task registry.');
}

async function handleTask(task) {
  const {taskKey,type,arguments:args={}}=task||{};
  if(!allowedTasks.has(type)||typeof taskKey!=='string')return;
  try{
    const output=await taskOutput(type,args);
    if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'task_result',taskKey,status:'COMPLETED',output}));
  }catch(error){
    if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'task_result',taskKey,status:'FAILED',error:String(error.message||error).slice(0,300),output:{lines:['NEXUS Diagnostic Runner','Task failed',String(error.message||error).slice(0,300)]}}));
  }
}

function connect() {
  if(closing)return;
  const url=String(config.agentUrl||`${serverBase.replace(/^http/,'ws')}/agent`).replace(/^http:/,'ws:').replace(/^https:/,'wss:');
  console.log(`Connecting to NEXUS at ${url} …`);
  socket=new WebSocket(url,{headers:{Authorization:`Bearer ${config.deviceToken}`},handshakeTimeout:10000,maxPayload:64*1024});
  socket.on('open',async()=>{
    reconnectDelay=1500;
    console.log(`Connected. Device key: ${config.deviceKey}`);
    const sendHeartbeat=async()=>{
      try{const metrics=await collectMetrics();if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'heartbeat',metrics}));}
      catch(e){console.error('Heartbeat collection failed:',e.message);}
    };
    await sendHeartbeat();
    clearInterval(heartbeatTimer);heartbeatTimer=setInterval(sendHeartbeat,15000);
  });
  socket.on('message',buffer=>{
    let message;try{message=JSON.parse(buffer.toString());}catch{return;}
    if(message.type==='connected')console.log('NEXUS session established.');
    if(message.type==='refresh_metrics'){
      collectMetrics().then(metrics=>{
        if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'heartbeat',metrics}));
      }).catch(error=>console.error('Requested refresh failed:',error.message));
    }
    if(message.type==='run_task')handleTask(message.task);
  });
  socket.on('close',(code)=>{
    clearInterval(heartbeatTimer);
    if(closing)return;
    console.warn(`Connection closed (${code}). Reconnecting in ${Math.round(reconnectDelay/1000)}s.`);
    setTimeout(connect,reconnectDelay);reconnectDelay=Math.min(30000,reconnectDelay*1.7);
  });
  socket.on('error',error=>console.error('Connection error:',error.message));
}

async function main(){
  console.log('NEXUS Endpoint Agent 1.2.0');
  if(!(await readConfig()))await enroll();
  connect();
}
process.on('SIGINT',()=>{closing=true;clearInterval(heartbeatTimer);socket?.close(1000,'Agent stopped by local operator');process.exit(0);});
process.on('SIGTERM',()=>{closing=true;clearInterval(heartbeatTimer);socket?.close(1000,'Agent stopped');process.exit(0);});
main().catch(error=>{console.error(error.message);process.exit(1);});
