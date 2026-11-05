import { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertCircle, ArrowUpRight, Bell, BookOpen, Boxes, CheckCircle2,
  Bug, GitBranch, KeyRound, BarChart3,
  ChevronDown, ChevronRight, CircleHelp, Clock3, Cpu, FileText, Globe,
  HardDrive, LayoutDashboard, LifeBuoy, LogOut, Menu, Monitor, MoreHorizontal,
  Network, Plus, RefreshCw, Search, Server, Settings, ShieldCheck, Terminal,
  Ticket, Wrench, X, Laptop, Package, User, CalendarDays, CircleDot, Copy,
  FileWarning, ClipboardCheck, Sparkles, Wifi, CircleCheck, CircleX,
} from 'lucide-react';

const api = async (path, options = {}) => {
  const token = localStorage.getItem('nexus_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api${path}`, { ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
};

const NAV_ITEMS = [
  { label: 'Overview', icon: LayoutDashboard, page: 'overview', section: 'WORKSPACE' },
  { label: 'Incidents', icon: Ticket, page: 'incidents', count: true },
  { label: 'Problems', icon: Bug, page: 'problems', section: 'SERVICE GOVERNANCE' },
  { label: 'Changes', icon: GitBranch, page: 'changes' },
  { label: 'Access requests', icon: KeyRound, page: 'access' },
  { label: 'Devices', icon: Monitor, page: 'devices' },
  { label: 'Troubleshooting', icon: Wrench, page: 'troubleshooting' },
  { label: 'Applications', icon: Server, page: 'applications' },
  { label: 'IT Assets', icon: Boxes, page: 'assets', section: 'MANAGEMENT' },
  { label: 'Knowledge base', icon: BookOpen, page: 'knowledge' },
  { label: 'Reports', icon: BarChart3, page: 'reports', section: 'INSIGHTS' },
  { label: 'Activity log', icon: Activity, page: 'activity' },
];

const TASKS = [
  { type: 'system_overview', title: 'System overview', detail: 'CPU, memory, OS and device profile', icon: Monitor },
  { type: 'network_summary', title: 'Network summary', detail: 'Interfaces, addresses and link state', icon: Network },
  { type: 'dns_lookup', title: 'DNS lookup', detail: 'Resolve a hostname from the endpoint', icon: Globe, input: 'hostname' },
  { type: 'disk_report', title: 'Disk report', detail: 'Volume capacity and free-space check', icon: HardDrive },
  { type: 'process_summary', title: 'Process summary', detail: 'Top resource-consuming processes', icon: Cpu },
  { type: 'service_summary', title: 'Service check', detail: 'Approved operating-system services', icon: Settings },
  { type: 'ping_test', title: 'Host reachability', detail: 'Send a bounded ICMP reachability test', icon: Network, input: 'hostname' },
  { type: 'tcp_port_check', title: 'TCP service check', detail: 'Test one approved service port', icon: Server, input: 'host_port' },
];

const fmtTime = (value) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not reported';
const timeAgo = (value) => {
  if (!value) return 'Never seen';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
};
const statusClass = (value = '') => value.toLowerCase().replaceAll('_', '-');
const priorityClass = (value = '') => value.toLowerCase();

function BrandMark({ compact = false }) {
  return <div className={`brand-lockup ${compact ? 'compact' : ''}`}>
    <div className="brand-mark"><span>N</span><i /></div>
    {!compact && <div className="brand-copy"><strong>NEXUS</strong><small>IT COMMAND CENTER</small></div>}
  </div>;
}

function StatusPill({ status }) {
  const map = { ONLINE: 'online', OPERATIONAL: 'online', COMPLETED: 'online', RESOLVED: 'online', APPROVED: 'online', WARNING: 'warning', DEGRADED: 'warning', IN_PROGRESS: 'warning', INVESTIGATING: 'warning', KNOWN_ERROR: 'warning', IMPLEMENTING: 'warning', NEEDS_INFORMATION: 'warning', PENDING: 'pending', REQUESTED: 'pending', ASSESSMENT: 'pending', SCHEDULED: 'pending', QUEUED: 'pending', SENT: 'pending', OFFLINE: 'offline', FAILED: 'offline', REJECTED: 'offline', OPEN: 'open', UNKNOWN: 'unknown', CLOSED: 'closed' };
  return <span className={`status-pill ${map[status] || 'unknown'}`}><i />{String(status || 'UNKNOWN').replaceAll('_', ' ')}</span>;
}

function MetricCard({ label, value, note, icon: Icon, tone = 'green', trend }) {
  return <div className="metric-card">
    <div className="metric-top"><span>{label}</span><div className={`metric-icon ${tone}`}><Icon size={17} strokeWidth={1.8} /></div></div>
    <div className="metric-value-row"><strong>{value}</strong>{trend && <span className="metric-trend"><ArrowUpRight size={13}/>{trend}</span>}</div>
    <div className="metric-note">{note}</div>
  </div>;
}

function MiniLine({ values = [], color = '#456a56', height = 40 }) {
  const clean = values.length ? values : [12,18,16,21,17,25,23,28];
  const max = Math.max(...clean, 1), min = Math.min(...clean, 0);
  const points = clean.map((v, i) => `${(i / Math.max(1, clean.length - 1)) * 180},${height - 4 - ((v - min) / Math.max(1, max - min)) * (height - 10)}`).join(' ');
  const area = `0,${height} ${points} 180,${height}`;
  return <svg className="mini-line" viewBox={`0 0 180 ${height}`} preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".2"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs>
    <polygon points={area} fill="url(#lineFill)"/><polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

function UsageBar({ value = 0, compact = false }) {
  const tone = value >= 85 ? 'bar-red' : value >= 70 ? 'bar-amber' : 'bar-green';
  return <div className={`usage-line ${compact ? 'compact' : ''}`}><div className="usage-track"><span className={tone} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div><b>{Math.round(value)}%</b></div>;
}

function Login({ onLogin, error, busy }) {
  const [email,setEmail] = useState('admin@nexus.local');
  const [password,setPassword] = useState('NexusDemo!2026');
  return <div className="login-page">
    <div className="login-left">
      <div className="login-brand"><BrandMark /></div>
      <div className="login-hero">
        <div className="eyebrow"><span className="eyebrow-dot"/> OPERATIONS, IN ONE PLACE</div>
        <h1>Clarity for every<br/><em>IT operation.</em></h1>
        <p>A considered workspace for endpoint health, incident response and the people who keep systems running.</p>
        <div className="login-graphic" aria-hidden="true">
          <div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="orbit orbit-c"/>
          <div className="orbit-core"><BrandMark compact/></div>
          <span className="orbit-node node-one"><Monitor size={17}/></span><span className="orbit-node node-two"><Network size={17}/></span><span className="orbit-node node-three"><ShieldCheck size={17}/></span>
          <span className="graphic-caption">ONE CONTROL PLANE <i/> CONNECTED SYSTEMS</span>
        </div>
      </div>
      <div className="login-foot"><span>BUILT FOR THE PEOPLE BEHIND THE SYSTEMS</span><span>01 / 04</span></div>
    </div>
    <div className="login-right">
      <div className="login-form-wrap">
        <div className="mobile-login-brand"><BrandMark/></div>
        <span className="form-kicker">SECURE WORKSPACE</span>
        <h2>Welcome back.</h2>
        <p className="form-intro">Sign in to your NEXUS operations workspace.</p>
        <form onSubmit={(e)=>{e.preventDefault();onLogin(email,password);}}>
          <label className="field-label">Work email</label>
          <div className="input-wrap"><User size={17}/><input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="username" required/></div>
          <label className="field-label">Password</label>
          <div className="input-wrap"><ShieldCheck size={17}/><input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" required/></div>
          {error && <div className="inline-error"><AlertCircle size={15}/>{error}</div>}
          <button className="button primary login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to workspace'} <ArrowUpRight size={16}/></button>
        </form>
        <div className="demo-access"><div className="demo-access-head"><span>DEMO ACCESS</span><span className="demo-dot"/>LOCAL WORKSPACE</div><div><b>admin@nexus.local</b><button type="button" onClick={()=>{setEmail('admin@nexus.local');setPassword('NexusDemo!2026');}}><Copy size={13}/> Use credentials</button></div><small>Password: NexusDemo!2026</small></div>
        <div className="login-security"><ShieldCheck size={15}/> Session-protected access <span/> Local development environment</div>
      </div>
    </div>
  </div>;
}

function SectionHeading({ eyebrow, title, description, action }) {
  return <div className="section-heading"><div><span className="section-kicker">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

function EmptyState({ icon: Icon = CircleHelp, title, description }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={22}/></div><b>{title}</b><p>{description}</p></div>;
}

function Overview({ data, onNavigate, onSelectDevice, canOperate = true, displayName = 'there' }) {
  if (!data) return <div className="loading-panel">Preparing your workspace…</div>;
  const trend = data.trend || [];
  const cpu = trend.map(x=>x.cpu);
  return <div className="page-content">
    <SectionHeading eyebrow={`${new Date().toLocaleDateString('en-US',{weekday:'long'}).toUpperCase()}, OPERATIONS BRIEFING`} title={`${new Date().getHours()<12?'Good morning':new Date().getHours()<17?'Good afternoon':'Good evening'}, ${displayName}.`} description="Here is the current picture across your IT environment." action={canOperate && data.devices.total>0 ? <button className="button secondary" onClick={()=>onNavigate('devices')}><Monitor size={15}/> View device fleet</button> : null}/>
    <div className="overview-banner">
      <div className="banner-copy"><span className="banner-label"><span/> COMMAND OVERVIEW</span><h2>Keep the whole<br/>estate in <em>view.</em></h2><p>Monitor endpoints, identify service issues and move from alert to resolution without changing tools.</p><button className="button banner-button" onClick={()=>onNavigate(canOperate?'troubleshooting':'incidents')}>{canOperate?'Open troubleshooting':'View my incidents'} <ArrowUpRight size={15}/></button></div>
      <div className="banner-art" aria-hidden="true">
        <img className="banner-photo" src="/images/nexus-workspace.jpg" alt="NEXUS workstation" />
        <div className="banner-photo-shade" />
        <div className="banner-card card-device"><Monitor size={15}/><span>ENDPOINTS</span><b>{data.devices.online} online</b></div>
        <div className="banner-card card-alert"><Activity size={15}/><span>LIVE INCIDENTS</span><b>{data.incidents.open} open</b></div>
        <div className="banner-card card-app"><Server size={15}/><span>SERVICES</span><b>{data.applications.operational}/{data.applications.total} healthy</b></div>
      </div>
      <div className="banner-index">N° 01 <span>IT OPERATIONS</span></div>
    </div>
    <div className="metrics-grid">
      <MetricCard label="Managed endpoints" value={data.devices.total} note={`${data.devices.online} reporting · ${data.devices.offline} offline`} icon={Monitor} tone="green" trend="Fleet"/>
      <MetricCard label="Open incidents" value={data.incidents.open} note={`${data.incidents.critical} critical priority`} icon={Ticket} tone="orange"/>
      <MetricCard label="Applications healthy" value={`${data.applications.operational}/${data.applications.total}`} note={`${data.applications.degraded} need attention`} icon={Server} tone="blue"/>
      <MetricCard label="In progress" value={data.incidents.inProgress} note="Tickets with an active owner" icon={Clock3} tone="sand"/>
    </div>
    <div className="overview-main-grid">
      <section className="panel resource-panel">
        <div className="panel-heading"><div><span className="panel-kicker">ENDPOINT TELEMETRY</span><h3>Resource activity</h3></div><span className="quiet-badge"><i/> SAMPLE WINDOW</span></div>
        <div className="resource-legend"><span><i className="legend-green"/> CPU utilization</span><span><i className="legend-orange"/> Memory utilization</span><span className="legend-sub">Last 18 samples</span></div>
        <div className="chart-area"><div className="chart-y-labels"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div className="chart-canvas"><div className="chart-gridlines"><i/><i/><i/><i/><i/></div><svg viewBox="0 0 600 190" preserveAspectRatio="none"><defs><linearGradient id="cpuArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4d715b" stopOpacity=".18"/><stop offset="1" stopColor="#4d715b" stopOpacity="0"/></linearGradient></defs>{(() => { const vals=cpu.length?cpu:[18,21,17,24,28,20,31,27,35,24,19,28,25,30,27,22,24,21]; const mem=trend.map(x=>x.memory); const make=(arr)=>arr.map((v,i)=>`${i/(Math.max(1,arr.length-1))*600},${185-Math.min(100,Math.max(0,v))*1.75}`).join(' '); const points=make(vals); const memPoints=make(mem.length?mem:[42,45,44,47,46,43,48,47,49,46,45,47,48,46,44,47,48,46]); return <><polygon points={`0,190 ${points} 600,190`} fill="url(#cpuArea)"/><polyline points={points} fill="none" stroke="#496e58" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><polyline points={memPoints} fill="none" stroke="#c27a4a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 5"/></>; })()}</svg><div className="chart-x-labels"><span>OLDER SAMPLES</span><span>RECENT</span><span>NOW</span></div></div></div>
        <div className="resource-footer"><div><span>AVERAGE CPU</span><b>{cpu.length ? `${(cpu.reduce((a,b)=>a+b,0)/cpu.length).toFixed(1)}%` : '—'}</b></div><div><span>ACTIVE ENDPOINTS</span><b>{data.devices.online}</b></div><div><span>DATA SOURCE</span><b>Agent telemetry + demo</b></div></div>
      </section>
      <section className="panel incidents-panel">
        <div className="panel-heading"><div><span className="panel-kicker">NEEDS ATTENTION</span><h3>Priority queue</h3></div><button className="icon-button" onClick={()=>onNavigate('incidents')} aria-label="View all incidents"><ArrowUpRight size={17}/></button></div>
        <div className="priority-list">{data.latestIncidents?.slice(0,4).map(item=><div className="priority-row" key={item.id}><div className={`priority-mark ${priorityClass(item.priority)}`}/><div className="priority-info"><b>{item.title}</b><span>{item.incidentNumber} · {timeAgo(item.createdAt)}</span></div><StatusPill status={item.status}/></div>)}</div>
        <button className="text-action" onClick={()=>onNavigate('incidents')}>Open incident queue <ChevronRight size={15}/></button>
      </section>
    </div>
    <div className="overview-lower-grid">
      <section className="panel device-panel"><div className="panel-heading"><div><span className="panel-kicker">DEVICE FLEET</span><h3>Endpoint health</h3></div><button className="text-action" onClick={()=>onNavigate('devices')}>All devices <ChevronRight size={15}/></button></div><div className="device-table-wrap"><table className="data-table"><thead><tr><th>DEVICE</th><th>OWNER / TEAM</th><th>CPU</th><th>MEMORY</th><th>STATUS</th></tr></thead><tbody>{data.latestDevices?.slice(0,5).map(d=><tr key={d.id} onClick={()=>onSelectDevice(d)} className="clickable-row"><td><div className="device-name-cell"><div className="device-mini-icon"><Laptop size={16}/></div><span><b>{d.name}</b><small>{d.hostname}</small></span></div></td><td><span className="owner-cell">{d.owner || 'Unassigned'}<small>{d.department || '—'}</small></span></td><td><UsageBar value={d.cpuUsage} compact/></td><td><UsageBar value={d.memoryUsage} compact/></td><td><StatusPill status={d.status}/></td></tr>)}</tbody></table></div></section>
      <section className="panel activity-panel"><div className="panel-heading"><div><span className="panel-kicker">SYSTEM HISTORY</span><h3>Recent activity</h3></div><button className="icon-button" onClick={()=>onNavigate('activity')}><ArrowUpRight size={17}/></button></div><div className="activity-feed">{data.activity?.slice(0,5).map(item=><div className="activity-item" key={item.id}><div className="activity-symbol"><CircleDot size={13}/></div><div><b>{item.action.replaceAll('_',' ').toLowerCase()}</b><span>{item.actor} · {item.targetType.toLowerCase()}</span><small>{timeAgo(item.createdAt)}</small></div></div>)}</div></section>
    </div>
    <div className="page-footnote"><span><i/> NEXUS CORE IS RUNNING</span><span>DEMO DATA IS MARKED WHERE APPLICABLE · LAST REFRESH {new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>
  </div>;
}

function Devices({ devices, onEnroll, onOpenDiagnostics, onRefresh, onSelectDevice, canManage = false }) {
  const [query,setQuery]=useState(''); const [filter,setFilter]=useState('ALL');
  const filtered=devices.filter(d=>(filter==='ALL'||d.status===filter)&&`${d.name} ${d.hostname} ${d.owner} ${d.platform}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page-content"><SectionHeading eyebrow="ENDPOINT MANAGEMENT" title="Device fleet" description="A clear view of the computers connected to your environment." action={<><button className="button secondary" onClick={onRefresh}><RefreshCw size={15}/> Refresh</button>{canManage&&<button className="button primary" onClick={onEnroll}><Plus size={16}/> Enroll device</button>}</>}/>
    <div className="device-stats-strip"><div><Monitor/><span><b>{devices.length}</b><small>Registered devices</small></span></div><div><span className="strip-dot green"/><span><b>{devices.filter(d=>d.status==='ONLINE').length}</b><small>Online</small></span></div><div><span className="strip-dot amber"/><span><b>{devices.filter(d=>d.status==='WARNING').length}</b><small>Needs attention</small></span></div><div><span className="strip-dot grey"/><span><b>{devices.filter(d=>d.status==='OFFLINE').length}</b><small>Offline</small></span></div></div>
    <section className="panel table-panel"><div className="table-toolbar"><div className="search-box"><Search size={16}/><input placeholder="Search devices, owners or OS…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="filter-tabs">{['ALL','ONLINE','WARNING','OFFLINE'].map(x=><button className={filter===x?'active':''} onClick={()=>setFilter(x)} key={x}>{x==='ALL'?'All':x.charAt(0)+x.slice(1).toLowerCase()}</button>)}</div></div>
      <div className="device-table-wrap"><table className="data-table wide-table"><thead><tr><th>DEVICE</th><th>OPERATING SYSTEM</th><th>ASSIGNED TO</th><th>CPU</th><th>MEMORY</th><th>DISK</th><th>LAST SEEN</th><th>STATUS</th><th/></tr></thead><tbody>{filtered.map(d=><tr key={d.id}><td><button className="device-name-cell button-plain" onClick={()=>onSelectDevice(d)}><div className="device-mini-icon"><Laptop size={16}/></div><span><b>{d.name}</b><small>{d.hostname} {d.isDemo?'· DEMO':''}</small></span></button></td><td><span className="os-cell">{d.platform}<small>{d.osVersion || 'Version not reported'}</small></span></td><td>{d.owner || 'Unassigned'}<small className="sub-cell">{d.department || '—'}</small></td><td><UsageBar value={d.cpuUsage} compact/></td><td><UsageBar value={d.memoryUsage} compact/></td><td><UsageBar value={d.diskUsage} compact/></td><td><span className="last-seen">{timeAgo(d.lastSeenAt)}</span></td><td><StatusPill status={d.status}/></td><td><button className="small-action" title="Open troubleshooting" onClick={()=>onOpenDiagnostics(d)}><Terminal size={15}/></button></td></tr>)}</tbody></table>{filtered.length===0&&<EmptyState icon={Monitor} title="No matching devices" description="Try a different search or filter."/>}</div>
      <div className="table-footer"><span>Showing {filtered.length} of {devices.length} devices</span><span><i className="demo-key"/> Demo endpoints are labelled explicitly</span></div>
    </section>
  </div>;
}

function Troubleshooting({ devices, selectedDevice, onSelectDevice, onRunTask, task, taskBusy, refreshDevice, refreshingDeviceId, onCreateIncident, onApplyDemoFix, fixingDeviceId, onNavigate }) {
  const [dnsHost,setDnsHost]=useState('intranet.company.test');
  const [pingHost,setPingHost]=useState('1.1.1.1');
  const [tcpHost,setTcpHost]=useState('localhost');
  const [tcpPort,setTcpPort]=useState('4100');
  const [commandLine,setCommandLine]=useState('');
  const [commandError,setCommandError]=useState('');
  const [commandHint,setCommandHint]=useState('');
  const [issueTitle,setIssueTitle]=useState('');
  const [issueDetails,setIssueDetails]=useState('');
  const [issueCategory,setIssueCategory]=useState('Network');
  const [issuePriority,setIssuePriority]=useState('MEDIUM');
  const [errorCode,setErrorCode]=useState('');
  const [issueBusy,setIssueBusy]=useState(false);
  const [issueResult,setIssueResult]=useState(null);
  const [remediationResult,setRemediationResult]=useState(null);
  const [issueError,setIssueError]=useState('');
  const chosen=selectedDevice || devices.find(d=>d.status==='ONLINE') || devices[0];
  const suggestedTask = issueCategory==='Network' ? 'network_summary' : issueCategory==='Application' ? 'system_overview' : issueCategory==='Hardware' ? 'system_overview' : 'service_summary';
  const recommendedFix = issueCategory==='Network' ? 'network_reconnect' : issueCategory==='Hardware' ? 'reduce_resource_load' : issueCategory==='Application' ? 'refresh_application_check' : 'refresh_device_health';
  const taskTitle = TASKS.find(t=>t.type===task?.type)?.title || 'Latest diagnostic';
  const submitConsoleCommand=(event)=>{
    event.preventDefault();const raw=commandLine.trim();if(!raw)return;
    const parts=raw.split(/\s+/);const command=parts[0].toLowerCase()==='nexus'?parts[1]?.toLowerCase():parts[0].toLowerCase();const args=parts.slice(parts[0].toLowerCase()==='nexus'?2:1);
    const commandMap={system:'system_overview',network:'network_summary',disk:'disk_report',processes:'process_summary',services:'service_summary',ping:'ping_test'};
    if(command==='help'){setCommandHint('Available: nexus system · network · disk · processes · services · dns <host> · ping <host> · tcp <host> <port>');setCommandError('');setCommandLine('');return;}
    if((command==='dns'||command==='ping')&&args.length===1){onRunTask(chosen,command==='dns'?'dns_lookup':'ping_test',{hostname:args[0]});setCommandError('');setCommandHint('');setCommandLine('');return;}
    if(command==='tcp'&&args.length===2&&/^\d+$/.test(args[1])){onRunTask(chosen,'tcp_port_check',{hostname:args[0],port:Number(args[1])});setCommandError('');setCommandHint('');setCommandLine('');return;}
    if(!commandMap[command]){setCommandError('Command not available. Type “nexus help” to see the approved diagnostics.');setCommandHint('');return;}
    onRunTask(chosen,commandMap[command],{});setCommandError('');setCommandHint('');setCommandLine('');
  };
  const submitIssue=async(event)=>{
    event.preventDefault();setIssueBusy(true);setIssueError('');setIssueResult(null);
    try{
      const description=[issueDetails.trim(),errorCode.trim()?`Error code / message: ${errorCode.trim()}`:'',`Submitted from NEXUS Troubleshooting Center. Target device: ${chosen?.name || 'Not selected'}.`].filter(Boolean).join('\n\n');
      const result=await onCreateIncident({title:issueTitle.trim(),description,priority:issuePriority,category:issueCategory,deviceId:chosen?.id||null});
      if(result){setIssueResult(result);setIssueTitle('');setIssueDetails('');setErrorCode('');}
    }catch(error){setIssueError(error.message||'The issue could not be submitted.');}
    finally{setIssueBusy(false);}
  };
  const runSuggested=()=>{
    if(!chosen){setIssueError('Select a target device before running diagnostics.');return;}
    onRunTask(chosen,suggestedTask,{});
  };
  const applyGuidedFix=async()=>{
    if(!chosen)return;
    const before={cpuUsage:chosen.cpuUsage,memoryUsage:chosen.memoryUsage,diskUsage:chosen.diskUsage};
    const result=await onApplyDemoFix(chosen,recommendedFix);
    if(result?.device)setRemediationResult({before,after:result.device,description:result.description||'Demo-only action applied.'});
  };
  return <div className="page-content">
    <SectionHeading eyebrow="DIAGNOSTIC WORKBENCH" title="Troubleshooting center" description="Capture the error, investigate the endpoint, apply an approved next step and verify the result." action={<span className="quiet-badge"><ShieldCheck size={13}/> CONTROLLED DIAGNOSTICS</span>}/>
    <section className="troubleshoot-hero">
      <div className="troubleshoot-hero-copy"><span className="hero-overline"><Sparkles size={14}/> NEXUS SUPPORT WORKFLOW</span><h2>From error report<br/>to <em>verified resolution.</em></h2><p>Keep the issue, diagnostics and follow-up work together. No more guessing what ran or whether the device changed.</p><div className="troubleshoot-hero-points"><span><CircleCheck size={15}/> Evidence-led checks</span><span><CircleCheck size={15}/> Incident-linked workflow</span></div></div>
      <div className="troubleshoot-hero-image"><img src="/images/nexus-workspace.jpg" alt="A calm, modern IT operations workspace"/><div className="hero-image-caption"><span className="live-pulse"/> NEXUS OPERATIONS <b>ONE WORKSPACE. CLEAR NEXT STEPS.</b></div></div>
    </section>
    <div className="triage-steps" aria-label="Troubleshooting workflow">
      <div className={`triage-step ${issueResult?'complete':'current'}`}><span>01</span><div><b>Report the issue</b><small>Capture the symptom</small></div></div>
      <div className={`triage-step ${task?.status==='COMPLETED'?'complete':issueResult?'current':''}`}><span>02</span><div><b>Run diagnostics</b><small>Collect endpoint evidence</small></div></div>
      <div className={`triage-step ${task?.status==='COMPLETED'&&chosen?.isDemo?'current':''}`}><span>03</span><div><b>Take action</b><small>Guided or approved next step</small></div></div>
      <div className={`triage-step ${task?.status==='COMPLETED'?'complete':''}`}><span>04</span><div><b>Verify & document</b><small>Refresh and record outcome</small></div></div>
    </div>
    <div className="troubleshoot-layout"><div className="troubleshoot-main">
      <section className="panel target-panel"><div className="target-panel-heading"><div><span className="panel-kicker">TARGET ENDPOINT</span><h3>Which device needs attention?</h3><p>Choose the computer where the problem was reported.</p></div><span className="quiet-badge">{devices.length} REGISTERED</span></div><div className="target-select-wrap"><div className="target-device-icon"><Monitor size={23}/></div><div className="target-select-info"><select value={chosen?.id||''} onChange={e=>{onSelectDevice(devices.find(d=>d.id===Number(e.target.value)));setIssueResult(null);setRemediationResult(null);}}><option value="">Select an endpoint</option>{devices.map(d=><option key={d.id} value={d.id}>{d.name} — {d.platform}</option>)}</select><span>{chosen?`${chosen.hostname} · ${chosen.owner||'Unassigned'}${chosen.isDemo?' · Simulated endpoint':''}`:'Select a device to enable endpoint diagnostics.'}</span></div>{chosen&&<StatusPill status={chosen.status}/>}</div></section>
      <section className="panel issue-report-panel"><div className="issue-report-intro"><div className="issue-report-icon"><FileWarning size={22}/></div><div><span className="panel-kicker">STEP 01 · REPORT A PROBLEM</span><h3>What error are you seeing?</h3><p>Describe what happened, include the exact message and select the affected device. NEXUS will create a trackable incident.</p></div></div>
        <form className="issue-report-form" onSubmit={submitIssue}>
          <label>Issue title<input required minLength={5} maxLength={180} value={issueTitle} onChange={e=>setIssueTitle(e.target.value)} placeholder="e.g. MacBook cannot connect to office Wi‑Fi"/></label>
          <div className="issue-form-grid"><label>Issue category<select value={issueCategory} onChange={e=>setIssueCategory(e.target.value)}><option>Network</option><option>Application</option><option>Hardware</option><option>Access</option><option>Other</option></select></label><label>Priority<select value={issuePriority} onChange={e=>setIssuePriority(e.target.value)}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label><label>Error code (optional)<input value={errorCode} onChange={e=>setErrorCode(e.target.value)} placeholder="e.g. DNS_PROBE_FINISHED"/></label></div>
          <label>What happened?<textarea required minLength={10} rows={4} value={issueDetails} onChange={e=>setIssueDetails(e.target.value)} placeholder="Tell us what you were doing, what you expected, and the exact error or behaviour you noticed."/></label>
          {issueError&&<div className="inline-error"><AlertCircle size={15}/>{issueError}</div>}
          <div className="issue-form-footer"><span><ShieldCheck size={15}/> Your report becomes an incident with an SLA and audit history.</span><button className="button primary" disabled={issueBusy}>{issueBusy?'Submitting report…':'Submit issue report'} <ArrowUpRight size={16}/></button></div>
        </form>
        {issueResult&&<div className="issue-created-card"><div className="issue-created-icon"><CheckCircle2 size={21}/></div><div className="issue-created-copy"><span className="panel-kicker">ISSUE RECEIVED · INCIDENT CREATED</span><b>{issueResult.incidentNumber || `Incident #${issueResult.id}`}</b><p>{issueResult.title} is now in the incident queue. {issueResult.slaState?`SLA state: ${issueResult.slaState}.`:''}</p></div><button className="button secondary" onClick={()=>onNavigate('incidents')}>View incident <ArrowUpRight size={14}/></button></div>}
      </section>
      <section className="diagnostic-section"><div className="diagnostic-section-heading"><div><span className="panel-kicker">STEP 02 · INVESTIGATE</span><h3>Run a diagnostic check</h3><p>Choose a safe, read-only test. Results will appear below and be stored in the device history.</p></div><span className="quiet-badge"><ShieldCheck size={13}/> APPROVED TASKS</span></div>
        <div className="diagnostic-grid">{TASKS.map((t,index)=>{const Icon=t.icon;return <div className="diagnostic-card" key={t.type}><div className="diagnostic-card-top"><div className="diagnostic-icon"><Icon size={19}/></div><span className="task-number">{String(index+1).padStart(2,'0')}</span></div><b>{t.title}</b><p>{t.detail}</p>{t.input==='hostname'&&<input className="diagnostic-input" value={t.type==='dns_lookup'?dnsHost:pingHost} onChange={e=>t.type==='dns_lookup'?setDnsHost(e.target.value):setPingHost(e.target.value)} aria-label="Hostname to test"/>}{t.input==='host_port'&&<div className="diagnostic-input-pair"><input className="diagnostic-input" value={tcpHost} onChange={e=>setTcpHost(e.target.value)} aria-label="Host to test"/><input className="diagnostic-input port-input" value={tcpPort} onChange={e=>setTcpPort(e.target.value)} aria-label="Port to test" inputMode="numeric"/></div>}<button className="diagnostic-run" disabled={!chosen||taskBusy} onClick={()=>onRunTask(chosen,t.type,t.input==='hostname'?{hostname:t.type==='dns_lookup'?dnsHost:pingHost}:t.input==='host_port'?{hostname:tcpHost,port:Number(tcpPort)}:{})}>{taskBusy&&task?.type===t.type?'Running check…':'Run diagnostic'} <ArrowUpRight size={14}/></button></div>;})}</div>
      </section>
      <section className="panel console-panel"><div className="console-header"><div><span className="panel-kicker">STEP 02 · DIAGNOSTIC OUTPUT</span><h3>{task ? taskTitle : 'Your diagnostic console is ready'}</h3><p>Commands are limited to the NEXUS diagnostic registry.</p></div><div className="console-window-controls"><i/><i/><i/></div></div><div className="console-body"><div className="console-meta"><span>nexus-diagnostics / {chosen?.hostname || 'no-target'}</span>{task&&<StatusPill status={task.status}/>}</div>{task?.output?.lines ? <pre>{task.output.lines.join('\n')}</pre> : task?.error ? <pre className="console-error">{task.error}</pre> : <div className="console-placeholder"><Terminal size={30}/><span>No diagnostic has been run yet.</span><small>Choose a diagnostic above or enter an approved command below.</small></div>}
        <form className="console-command-row" onSubmit={submitConsoleCommand}><span>nexus &gt;</span><input value={commandLine} onChange={e=>setCommandLine(e.target.value)} placeholder="help · system · network · disk · processes · services · dns host · ping host · tcp host port" disabled={!chosen||taskBusy} aria-label="NEXUS diagnostic command"/><button disabled={!chosen||taskBusy||!commandLine.trim()} aria-label="Run command"><ArrowUpRight size={16}/></button></form>
        {commandError&&<div className="console-command-error">{commandError}</div>}{commandHint&&<div className="console-command-hint">{commandHint}</div>}
      </div><div className="console-foot"><span><i/> {task?.output?.simulated?'SIMULATED DEMO OUTPUT':chosen?.isDemo?'DEMO ENDPOINT':'ENDPOINT AGENT'}</span><span>{task?.completedAt?fmtTime(task.completedAt):task?.requestedAt?`Requested ${fmtTime(task.requestedAt)}`:'No task running'}</span></div></section>
      {task?.status==='COMPLETED'&&<section className="panel resolution-panel"><div className="resolution-top"><div className="resolution-icon"><ClipboardCheck size={21}/></div><div><span className="panel-kicker">STEP 03 · NEXT ACTION</span><h3>{task.output?.simulated?'Demo remediation available':'Diagnostic completed'}</h3><p>{task.output?.simulated?'This endpoint is labelled as demo data. You can apply a clearly marked simulated improvement and see the before/after metrics change.':'The endpoint returned a diagnostic result. Review the evidence and follow your approved runbook before changing the live device.'}</p></div><StatusPill status="COMPLETED"/></div>
        {task.output?.simulated&&chosen?.isDemo?<div className="remediation-row"><div><b>Suggested action</b><span>{issueCategory==='Network'?'Reconnect network profile (demo simulation)':issueCategory==='Application'?'Refresh application health snapshot (demo simulation)':issueCategory==='Hardware'?'Reduce resource pressure (demo simulation)':'Refresh device health (demo simulation)'}</span></div><button className="button primary" onClick={applyGuidedFix} disabled={fixingDeviceId===chosen.id}>{fixingDeviceId===chosen.id?'Applying demo action…':'Apply demo action'} <ArrowUpRight size={15}/></button></div>:<div className="manual-action-note"><ShieldCheck size={17}/><span>No remote configuration changes are enabled for live endpoints. Use the approved company runbook, then refresh the device and rerun the diagnostic to verify.</span></div>}
        {remediationResult&&<div className="before-after-panel"><div className="before-after-heading"><div><span className="panel-kicker">VERIFICATION SNAPSHOT</span><b>Before and after the demo action</b></div><span className="demo-chip">SIMULATED</span></div><p>{remediationResult.description}</p><div className="before-after-grid">{[['CPU',remediationResult.before.cpuUsage,remediationResult.after.cpuUsage],['Memory',remediationResult.before.memoryUsage,remediationResult.after.memoryUsage],['Disk',remediationResult.before.diskUsage,remediationResult.after.diskUsage]].map(([label,before,after])=><div className="before-after-metric" key={label}><span>{label}</span><div><b>{Math.round(before)}%</b><ChevronRight size={14}/><b className={after<=before?'improved':''}>{Math.round(after)}%</b></div><small>{after<=before?'Lower after action':'No reduction recorded'}</small></div>)}</div></div>}
      </section>}
    </div><aside className="troubleshoot-side"><section className="panel side-health-panel"><div className="side-panel-title"><div><span className="panel-kicker">LIVE ENDPOINT SNAPSHOT</span><h3>Device health</h3></div><button className="icon-button refresh-control" onClick={()=>refreshDevice(chosen?.id)} disabled={!chosen||refreshingDeviceId===chosen?.id} title="Request fresh endpoint metrics"><RefreshCw size={17} className={refreshingDeviceId===chosen?.id?'spin':''}/></button></div><div className="health-score"><div className="health-ring" style={{'--score':`${chosen?.healthScore||0}%`}}><strong>{chosen?.healthScore??'—'}</strong><small>HEALTH</small></div><div><b>{chosen?.status==='WARNING'?'Attention needed':chosen?.status==='OFFLINE'?'Device offline':'Within expected range'}</b><span>{chosen?.isDemo?'Sample endpoint metrics · demo refresh changes the sample values':'Latest telemetry received from the endpoint agent'}</span></div></div>
        <div className="health-metric"><span><Cpu size={15}/> CPU</span><UsageBar value={chosen?.cpuUsage||0}/></div><div className="health-metric"><span><Activity size={15}/> Memory</span><UsageBar value={chosen?.memoryUsage||0}/></div><div className="health-metric"><span><HardDrive size={15}/> Disk</span><UsageBar value={chosen?.diskUsage||0}/></div><div className="side-health-foot"><span>Last heartbeat</span><b>{timeAgo(chosen?.lastSeenAt)}</b></div><button className="button secondary full-width refresh-device-button" onClick={()=>refreshDevice(chosen?.id)} disabled={!chosen||refreshingDeviceId===chosen?.id}><RefreshCw size={15} className={refreshingDeviceId===chosen?.id?'spin':''}/>{refreshingDeviceId===chosen?.id?'Refreshing device…':'Refresh device metrics'}</button>
      </section>
      <section className="panel triage-assistant-panel"><div className="assistant-visual"><div className="assistant-orbit"><Sparkles size={24}/></div><div><span className="panel-kicker">NEXUS SUPPORT GUIDE</span><h3>Make the next step clear.</h3></div></div><p>Start with the reported symptom. Run one diagnostic at a time, review the evidence and verify any change with a fresh device snapshot.</p>{issueResult?<div className="assistant-next"><b>Recommended next check</b><span>{TASKS.find(t=>t.type===suggestedTask)?.title}</span><button className="button primary full-width" onClick={runSuggested} disabled={!chosen||taskBusy}>{taskBusy?'Running check…':'Run recommended diagnostic'} <ArrowUpRight size={14}/></button></div>:<div className="assistant-next"><b>Start here</b><span>Submit an issue report to create an incident and unlock a guided diagnostic path.</span></div>}</section>
      <section className="panel safe-panel"><div className="safe-title"><ShieldCheck size={19}/><b>Controlled diagnostics</b></div><p>NEXUS uses a named task registry. No unrestricted shell strings or silent remote control are enabled.</p><ul><li>Endpoint must be enrolled</li><li>Technician or admin role required</li><li>Every run is recorded</li></ul></section>
      <section className="support-photo-card"><img src="/images/nexus-workspace.jpg" alt="NEXUS support operations workspace"/><div><span>GOOD SUPPORT IS TRACEABLE</span><b>Every check leaves<br/>a clear record.</b></div></section>
    </aside></div>
  </div>;
}
function Incidents({ incidents, devices, onCreate, onUpdate, editable = true }) {
  const [query,setQuery]=useState(''); const [filter,setFilter]=useState('ACTIVE'); const [selected,setSelected]=useState(null);
  const filtered=incidents.filter(i=>(filter==='ALL'||(filter==='ACTIVE'&&!['RESOLVED','CLOSED'].includes(i.status))||i.status===filter)&&`${i.incidentNumber} ${i.title} ${i.assignee}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page-content"><SectionHeading eyebrow="SERVICE OPERATIONS" title="Incident management" description="Coordinate response, assign ownership and keep a record from detection through resolution." action={<button className="button primary" onClick={onCreate}><Plus size={16}/> Create incident</button>}/>
    <div className="incident-summary-row"><div><b>{incidents.filter(i=>!['RESOLVED','CLOSED'].includes(i.status)).length}</b><span>Active incidents</span></div><div><b>{incidents.filter(i=>i.priority==='CRITICAL'&&!['RESOLVED','CLOSED'].includes(i.status)).length}</b><span>Critical</span></div><div><b>{incidents.filter(i=>i.status==='IN_PROGRESS').length}</b><span>Being worked</span></div><div><b>{incidents.filter(i=>i.status==='RESOLVED').length}</b><span>Resolved</span></div></div>
    <section className="panel table-panel"><div className="table-toolbar"><div className="search-box"><Search size={16}/><input placeholder="Search incidents…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="filter-tabs">{['ACTIVE','ALL','OPEN','IN_PROGRESS','RESOLVED'].map(x=><button className={filter===x?'active':''} onClick={()=>setFilter(x)} key={x}>{x.replace('_',' ')}</button>)}</div></div><div className="incident-list">{filtered.map(i=><div className="incident-row" key={i.id}><div className={`priority-mark ${priorityClass(i.priority)}`}/><div className="incident-main"><div className="incident-title-line"><b>{i.title}</b><span className="incident-ref">{i.incidentNumber}</span></div><p>{i.description}</p><div className="incident-meta"><span><Clock3 size={12}/>{timeAgo(i.createdAt)}</span><span><User size={12}/>{i.assignee||'Unassigned'}</span><span><FileText size={12}/>{i.source}</span><span><Activity size={12}/>SLA {i.slaState||'ON TRACK'}</span></div></div><div className="incident-right"><span className={`priority-label ${priorityClass(i.priority)}`}>{i.priority}</span><StatusPill status={i.status}/>{editable&&<button className="small-action" onClick={()=>setSelected(selected?.id===i.id?null:i)}><MoreHorizontal size={16}/></button>}</div>{selected?.id===i.id&&<div className="incident-expanded"><div><label>ASSIGNEE</label><select value={i.assignee||'Unassigned'} onChange={e=>onUpdate(i.id,{assignee:e.target.value})}><option>Unassigned</option><option>Avery Morgan</option><option>Taylor Brooks</option><option>Jordan Lee</option></select></div><div><label>STATUS</label><select value={i.status} onChange={e=>onUpdate(i.id,{status:e.target.value})}><option>OPEN</option><option>IN_PROGRESS</option><option>PENDING</option><option>RESOLVED</option><option>CLOSED</option></select></div><div><label>PRIORITY</label><select value={i.priority} onChange={e=>onUpdate(i.id,{priority:e.target.value})}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></div></div>}</div>)}{filtered.length===0&&<EmptyState icon={Ticket} title="No incidents found" description="There are no incidents matching this view."/>}</div><div className="table-footer"><span>{filtered.length} records</span><span>Incident changes are added to the audit log.</span></div></section>
  </div>;
}

function Applications({ applications, onCheck, onAdd, canManage = false }) {
  return <div className="page-content"><SectionHeading eyebrow="SERVICE RELIABILITY" title="Application monitoring" description="Track the health of business services and understand when a dependency needs attention." action={canManage?<button className="button primary" onClick={onAdd}><Plus size={16}/> Add application</button>:null}/>
    <div className="app-summary-row"><div><span className="summary-dot green"/><b>{applications.filter(a=>a.status==='OPERATIONAL').length}</b><small>Operational</small></div><div><span className="summary-dot amber"/><b>{applications.filter(a=>a.status==='DEGRADED').length}</b><small>Degraded</small></div><div><span className="summary-dot grey"/><b>{applications.filter(a=>a.status==='UNKNOWN').length}</b><small>Not checked</small></div></div>
    <div className="applications-grid">{applications.map(a=><article className="panel application-card" key={a.id}><div className="app-card-top"><div className="app-icon"><Server size={19}/></div><StatusPill status={a.status}/></div><div className="app-card-name"><h3>{a.name}</h3><span>{a.environment} environment · {a.criticality} criticality</span></div><p>{a.description||'No service description has been added.'}</p><div className="app-metrics"><div><span>RESPONSE TIME</span><b>{a.responseMs!=null?`${a.responseMs} ms`:'—'}</b></div><div><span>HTTP STATUS</span><b>{a.httpStatus??'—'}</b></div><div><span>LAST CHECK</span><b>{timeAgo(a.lastCheckedAt)}</b></div></div><div className="app-endpoint"><Globe size={13}/><span>{a.endpoint||'Health endpoint not configured'}</span></div><button className="button secondary full-width" onClick={()=>onCheck(a.id)} disabled={!a.endpoint}><RefreshCw size={14}/> Run health check</button></article>)}</div>
  </div>;
}

function Assets({ assets }) {
  return <div className="page-content"><SectionHeading eyebrow="CONFIGURATION & LIFECYCLE" title="IT asset register" description="A practical inventory of company equipment, ownership and lifecycle dates." action={<span className="quiet-badge"><Boxes size={13}/> INVENTORY VIEW</span>}/>
    <div className="asset-summary-row"><div className="asset-summary-card"><Package size={18}/><b>{assets.length}</b><span>Tracked assets</span></div><div className="asset-summary-card"><Laptop size={18}/><b>{assets.filter(a=>a.category==='Laptop'||a.category==='Workstation').length}</b><span>Computing devices</span></div><div className="asset-summary-card"><CalendarDays size={18}/><b>{assets.filter(a=>a.warrantyUntil&&new Date(a.warrantyUntil)<new Date(Date.now()+90*86400000)).length}</b><span>Warranty within 90 days</span></div></div>
    <section className="panel table-panel"><div className="panel-heading inside"><div><span className="panel-kicker">REGISTERED EQUIPMENT</span><h3>Asset inventory</h3></div><span className="quiet-badge">{assets.length} ITEMS</span></div><div className="device-table-wrap"><table className="data-table wide-table"><thead><tr><th>ASSET</th><th>TAG / SERIAL</th><th>CATEGORY</th><th>ASSIGNED TO</th><th>DEPARTMENT</th><th>WARRANTY</th><th>STATUS</th></tr></thead><tbody>{assets.map(a=><tr key={a.id}><td><div className="device-name-cell"><div className="device-mini-icon"><Package size={16}/></div><span><b>{a.name}</b><small>{a.purchaseDate?`Purchased ${a.purchaseDate}`:'Purchase date not recorded'}</small></span></div></td><td><span className="mono-cell">{a.assetTag}</span><small className="sub-cell">{a.serialNumber}</small></td><td>{a.category}</td><td>{a.assignedTo}</td><td>{a.department}</td><td>{a.warrantyUntil||'Not recorded'}</td><td><StatusPill status={a.status==='IN_USE'?'ONLINE':a.status}/></td></tr>)}</tbody></table>{assets.length===0&&<EmptyState icon={Boxes} title="No assets registered" description="Assets will appear here when they are added to the inventory."/>}</div></section>
  </div>;
}

function Knowledge({ articles }) {
  const [query,setQuery]=useState('');const [open,setOpen]=useState(null);
  const filtered=articles.filter(a=>`${a.title} ${a.category} ${a.summary} ${a.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page-content"><SectionHeading eyebrow="TECHNICAL KNOWLEDGE" title="Knowledge base" description="Short, repeatable procedures for common support and application issues." action={<span className="quiet-badge"><BookOpen size={13}/> {articles.length} ARTICLES</span>}/><div className="knowledge-search panel"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search symptoms, systems or procedures…"/><span>⌘ K</span></div><div className="knowledge-grid">{filtered.map(a=><article className={`panel knowledge-card ${open===a.id?'expanded':''}`} key={a.id}><div className="knowledge-card-top"><span className="knowledge-category">{a.category}</span><span className="knowledge-updated">UPDATED {new Date(a.updatedAt).toLocaleDateString()}</span></div><h3>{a.title}</h3><p>{a.summary}</p><div className="tag-list">{a.tags.map(t=><span key={t}>{t}</span>)}</div>{open===a.id&&<div className="knowledge-content">{a.content.split('\n').map((line,i)=><p key={i}>{line}</p>)}</div>}<button className="text-action" onClick={()=>setOpen(open===a.id?null:a.id)}>{open===a.id?'Close article':'Read procedure'} <ChevronRight size={15}/></button></article>)}{filtered.length===0&&<EmptyState title="No articles match" description="Try another keyword."/>}</div></div>;
}

function ActivityLog({ activity }) {
  return <div className="page-content"><SectionHeading eyebrow="AUDIT & GOVERNANCE" title="Activity log" description="A time-ordered record of actions taken in this workspace." action={<span className="quiet-badge"><ShieldCheck size={13}/> AUDIT TRAIL</span>}/><section className="panel audit-panel"><div className="panel-heading inside"><div><span className="panel-kicker">RECENT EVENTS</span><h3>Workspace history</h3></div><span className="quiet-badge">{activity.length} EVENTS</span></div>{activity.map(item=><div className="audit-row" key={item.id}><div className="audit-glyph"><Activity size={15}/></div><div className="audit-copy"><b>{item.action.replaceAll('_',' ').toLowerCase()}</b><span>{item.actor} · {item.targetType} {item.targetId}</span></div><div className="audit-time">{fmtTime(item.createdAt)}</div></div>)}</section></div>;
}

function Problems({ problems, incidents, onCreate, onUpdate, editable=true }) {
  const [showForm,setShowForm]=useState(false);const [title,setTitle]=useState('');const [description,setDescription]=useState('');const [priority,setPriority]=useState('MEDIUM');const [category,setCategory]=useState('Endpoint');const [related,setRelated]=useState('');
  const submit=e=>{e.preventDefault();onCreate({title,description,priority,category,relatedIncidentIds:related?related.split(',').map(Number).filter(Number.isInteger):[]});setTitle('');setDescription('');setRelated('');setShowForm(false);};
  return <div className="page-content"><SectionHeading eyebrow="PROBLEM MANAGEMENT" title="Problem register" description="Find recurring incidents, document root causes and track permanent corrective actions." action={editable&&<button className="button primary" onClick={()=>setShowForm(!showForm)}><Plus size={15}/> New problem</button>}/>
    {showForm&&<section className="panel workflow-form"><div className="panel-heading inside"><div><span className="panel-kicker">NEW RECORD</span><h3>Open a problem investigation</h3></div><button className="icon-button" onClick={()=>setShowForm(false)}><X size={16}/></button></div><form className="workflow-grid" onSubmit={submit}><label>Problem title<input required minLength={5} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Repeated VPN disconnects across Finance"/></label><label>Category<select value={category} onChange={e=>setCategory(e.target.value)}><option>Endpoint</option><option>Network</option><option>Application</option><option>Access</option><option>Infrastructure</option></select></label><label>Priority<select value={priority} onChange={e=>setPriority(e.target.value)}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label><label>Related incident IDs<input value={related} onChange={e=>setRelated(e.target.value)} placeholder="e.g. 12, 18 (optional)"/></label><label className="span-two">Observed pattern and business impact<textarea required minLength={10} rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe recurrence, affected users, frequency and impact."/></label><div className="span-two form-actions"><button className="button primary">Create problem record</button></div></form></section>}
    <div className="workflow-summary"><div><span>ALL PROBLEMS</span><b>{problems.length}</b></div><div><span>UNDER INVESTIGATION</span><b>{problems.filter(p=>['OPEN','INVESTIGATING','KNOWN_ERROR'].includes(p.status)).length}</b></div><div><span>LINKED INCIDENTS</span><b>{problems.reduce((n,p)=>n+(p.incidentCount||0),0)}</b></div></div>
    <div className="workflow-list">{problems.map(p=><ProblemCard key={p.id} problem={p} onUpdate={onUpdate} editable={editable}/>)}{problems.length===0&&<EmptyState icon={Bug} title="No problem records yet" description="Create a problem record when several incidents point to the same underlying cause."/>}</div>
    <p className="workflow-footnote">Problem records are for root-cause investigation. Individual user interruptions remain incidents and can be linked to a common problem.</p>
  </div>;
}
function ProblemCard({problem:p,onUpdate,editable}) {
  const [expanded,setExpanded]=useState(false);const [rootCause,setRootCause]=useState(p.rootCause||'');const [workaround,setWorkaround]=useState(p.workaround||'');const [permanentFix,setPermanentFix]=useState(p.permanentFix||'');
  return <article className="panel workflow-card"><div className="workflow-card-head"><div><span className="workflow-number">{p.problemNumber}</span><h3>{p.title}</h3><p>{p.description}</p></div><StatusPill status={p.status}/></div><div className="workflow-meta"><span><b>{p.priority}</b> priority</span><span>{p.category}</span><span>{p.incidentCount} linked incidents</span><span>Owner: {p.owner||'Unassigned'}</span><span>Updated {timeAgo(p.updatedAt)}</span></div>{expanded&&<div className="workflow-editor"><label>Root cause<textarea rows={2} value={rootCause} onChange={e=>setRootCause(e.target.value)}/></label><label>Known workaround<textarea rows={2} value={workaround} onChange={e=>setWorkaround(e.target.value)}/></label><label>Permanent corrective action<textarea rows={2} value={permanentFix} onChange={e=>setPermanentFix(e.target.value)}/></label><button className="button primary" onClick={()=>onUpdate(p.id,{rootCause,workaround,permanentFix})}>Save investigation notes</button></div>}<div className="workflow-actions"><button className="text-action" onClick={()=>setExpanded(!expanded)}>{expanded?'Hide investigation':'Update root cause & fix'} <ChevronRight size={14}/></button>{editable&&<select value={p.status} onChange={e=>onUpdate(p.id,{status:e.target.value})}><option>OPEN</option><option>INVESTIGATING</option><option>KNOWN_ERROR</option><option>RESOLVED</option><option>CLOSED</option></select>}</div></article>;
}
function Changes({changes,onCreate,onUpdate,editable=true,canApprove=false}) {
  const [showForm,setShowForm]=useState(false);const [form,setForm]=useState({title:'',description:'',changeType:'NORMAL',risk:'MEDIUM',impact:'',implementationPlan:'',rollbackPlan:'',plannedStart:'',plannedEnd:''});
  const set=(k,v)=>setForm(x=>({...x,[k]:v}));const submit=e=>{e.preventDefault();onCreate(form);setShowForm(false);setForm({title:'',description:'',changeType:'NORMAL',risk:'MEDIUM',impact:'',implementationPlan:'',rollbackPlan:'',plannedStart:'',plannedEnd:''});};
  const next=(status)=>status==='REQUESTED'?'ASSESSMENT':status==='ASSESSMENT'?(canApprove?'APPROVED':null):({APPROVED:'SCHEDULED',SCHEDULED:'IMPLEMENTING',IMPLEMENTING:'COMPLETED'})[status];
  return <div className="page-content"><SectionHeading eyebrow="CHANGE ENABLEMENT" title="Change calendar & control" description="Plan service changes with risk, impact, implementation evidence and a tested rollback path." action={editable&&<button className="button primary" onClick={()=>setShowForm(!showForm)}><Plus size={15}/> Request change</button>}/>
    {showForm&&<section className="panel workflow-form"><div className="panel-heading inside"><div><span className="panel-kicker">CHANGE REQUEST</span><h3>Submit a controlled change</h3></div><button className="icon-button" onClick={()=>setShowForm(false)}><X size={16}/></button></div><form className="workflow-grid" onSubmit={submit}><label>Change title<input required minLength={5} value={form.title} onChange={e=>set('title',e.target.value)}/></label><label>Change type<select value={form.changeType} onChange={e=>set('changeType',e.target.value)}><option>NORMAL</option><option>STANDARD</option><option>EMERGENCY</option></select></label><label>Risk<select value={form.risk} onChange={e=>set('risk',e.target.value)}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label><label>Planned start<input type="datetime-local" value={form.plannedStart} onChange={e=>set('plannedStart',e.target.value)}/></label><label>Planned end<input type="datetime-local" value={form.plannedEnd} onChange={e=>set('plannedEnd',e.target.value)}/></label><label>Business impact<input value={form.impact} onChange={e=>set('impact',e.target.value)} placeholder="Which teams or services are affected?"/></label><label className="span-two">Description<textarea rows={2} required minLength={10} value={form.description} onChange={e=>set('description',e.target.value)}/></label><label>Implementation plan<textarea rows={3} required minLength={10} value={form.implementationPlan} onChange={e=>set('implementationPlan',e.target.value)}/></label><label>Rollback plan<textarea rows={3} required minLength={10} value={form.rollbackPlan} onChange={e=>set('rollbackPlan',e.target.value)}/></label><div className="span-two form-actions"><button className="button primary">Submit change request</button></div></form></section>}
    <div className="workflow-summary"><div><span>ALL CHANGES</span><b>{changes.length}</b></div><div><span>AWAITING REVIEW</span><b>{changes.filter(c=>['REQUESTED','ASSESSMENT'].includes(c.status)).length}</b></div><div><span>COMPLETED</span><b>{changes.filter(c=>c.status==='COMPLETED').length}</b></div></div>
    <div className="workflow-list">{changes.map(c=><article className="panel workflow-card" key={c.id}><div className="workflow-card-head"><div><span className="workflow-number">{c.changeNumber} · {c.changeType} CHANGE</span><h3>{c.title}</h3><p>{c.description}</p></div><StatusPill status={c.status}/></div><div className="workflow-meta"><span><b>{c.risk}</b> risk</span><span>Requested by {c.requestedBy}</span><span>Approver: {c.approvedBy||'Pending'}</span><span>{c.plannedStart?fmtTime(c.plannedStart):'Schedule not set'}</span></div><details className="change-details"><summary>Review implementation, impact & rollback plans</summary><div className="change-detail-grid"><div><b>Business impact</b><p>{c.impact||'Not specified'}</p><b>Implementation plan</b><p>{c.implementationPlan}</p></div><div><b>Rollback plan</b><p>{c.rollbackPlan}</p></div></div></details><div className="workflow-actions">{canApprove&&['REQUESTED','ASSESSMENT'].includes(c.status)&&<><button className="button secondary" onClick={()=>onUpdate(c.id,{status:'REJECTED'})}>Reject</button><button className="button secondary" onClick={()=>onUpdate(c.id,{status:'APPROVED'})}>Approve change</button></>}{editable&&next(c.status)&&<button className="button primary" onClick={()=>onUpdate(c.id,{status:next(c.status)})}>Move to {next(c.status).toLowerCase()} <ArrowUpRight size={14}/></button>}{c.status==='REJECTED'&&<span className="muted-text">Change rejected</span>}</div></article>)}{changes.length===0&&<EmptyState icon={GitBranch} title="No change requests" description="Record a change before modifying a production service or endpoint."/>}</div>
  </div>;
}
function AccessRequestCard({request:r,onReview}) {
  const [notes,setNotes]=useState('');
  return <article className="panel workflow-card"><div className="workflow-card-head"><div><span className="workflow-number">{r.requestNumber}</span><h3>{r.systemName}</h3><p>{r.businessJustification}</p></div><StatusPill status={r.status}/></div><div className="workflow-meta"><span><b>{r.accessLevel}</b></span><span>Requested by {r.requester}</span><span>Reviewer: {r.reviewer||'Awaiting review'}</span><span>Expiry: {r.expiresAt||'Not specified'}</span></div>{r.reviewNotes&&<p className="review-notes">Reviewer note: {r.reviewNotes}</p>}{r.status==='PENDING'&&onReview&&<div className="workflow-actions access-review-actions"><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional reviewer note" aria-label="Reviewer note"/><button className="button secondary" onClick={()=>onReview(r.id,'REJECTED',notes)}>Reject</button><button className="button secondary" onClick={()=>onReview(r.id,'NEEDS_INFORMATION',notes)}>Request information</button><button className="button primary" onClick={()=>onReview(r.id,'APPROVED',notes)}>Approve access</button></div>}</article>;
}
function AccessRequests({requests,onCreate,onReview,canReview=false}) {
  const [form,setForm]=useState({systemName:'',accessLevel:'Read-only',businessJustification:'',expiresAt:''});const set=(k,v)=>setForm(x=>({...x,[k]:v}));
  const submit=e=>{e.preventDefault();onCreate(form);setForm({systemName:'',accessLevel:'Read-only',businessJustification:'',expiresAt:''});};
  return <div className="page-content"><SectionHeading eyebrow="IDENTITY & ACCESS GOVERNANCE" title="Access requests" description="Track access needs with a business reason, reviewer decision and optional expiry." action={<span className="quiet-badge"><KeyRound size={13}/> LEAST PRIVILEGE</span>}/>
    <section className="panel workflow-form"><div className="panel-heading inside"><div><span className="panel-kicker">REQUEST ACCESS</span><h3>What do you need access to?</h3></div></div><form className="workflow-grid" onSubmit={submit}><label>System / application<input required minLength={2} value={form.systemName} onChange={e=>set('systemName',e.target.value)} placeholder="e.g. Finance Ledger"/></label><label>Access level<select value={form.accessLevel} onChange={e=>set('accessLevel',e.target.value)}><option>Read-only</option><option>Standard user</option><option>Power user</option><option>Administrator</option></select></label><label>Requested expiry<input type="date" value={form.expiresAt} onChange={e=>set('expiresAt',e.target.value)}/></label><label className="span-two">Business justification<textarea rows={3} required minLength={15} value={form.businessJustification} onChange={e=>set('businessJustification',e.target.value)} placeholder="Explain the work task that requires this access."/></label><div className="span-two form-actions"><button className="button primary">Submit access request</button></div></form></section>
    <div className="workflow-list">{requests.map(r=><AccessRequestCard key={r.id} request={r} onReview={canReview?(id,status,reviewNotes)=>onReview(id,status,reviewNotes):null}/>)}{requests.length===0&&<EmptyState icon={KeyRound} title="No access requests" description="New requests will be listed here for review and tracking."/>}</div>
    <p className="workflow-footnote">This module records approval decisions; it does not directly provision accounts or grant access in external identity systems.</p>
  </div>;
}
function Reports({reports}) {
  if(!reports)return <div className="loading-panel">Preparing operational reports…</div>;
  const bars=reports.incidents.byPriority||[];const max=Math.max(1,...bars.map(x=>x.value));
  return <div className="page-content"><SectionHeading eyebrow="SERVICE INTELLIGENCE" title="Operations reports" description="A consolidated view of incident demand, endpoint health, problem investigations, changes and access governance." action={<span className="quiet-badge"><BarChart3 size={13}/> LIVE DATABASE SUMMARY</span>}/>
    <div className="report-grid"><MetricCard label="Total incidents" value={reports.incidents.total} note={`${reports.incidents.active} currently active`} icon={Ticket}/><MetricCard label="Managed endpoints" value={reports.devices.enrolled} note={`${reports.devices.warning} warning · ${reports.devices.offline} offline`} icon={Monitor} tone="blue"/><MetricCard label="Open problems" value={reports.problems.open} note={`${reports.problems.total} recorded`} icon={Bug} tone="orange"/><MetricCard label="Pending changes" value={reports.changes.pending} note={`${reports.changes.completed} completed`} icon={GitBranch}/></div>
    <div className="overview-main-grid report-main-grid"><section className="panel report-panel"><div className="panel-heading"><div><span className="panel-kicker">INCIDENT DEMAND</span><h3>Incidents by priority</h3></div></div>{bars.length?bars.map(b=><div className="report-bar-row" key={b.label}><span>{b.label}</span><div className="report-bar-track"><i style={{width:`${b.value/max*100}%`}}/></div><b>{b.value}</b></div>):<EmptyState icon={BarChart3} title="No incident data" description="Incident analytics will appear here."/>}</section><section className="panel report-side-panel"><div className="panel-heading"><div><span className="panel-kicker">GOVERNANCE QUEUE</span><h3>Requests requiring attention</h3></div></div><div className="report-queue-row"><span>Access approvals</span><b>{reports.accessRequests.pending}</b></div><div className="report-queue-row"><span>Changes awaiting assessment</span><b>{reports.changes.pending}</b></div><div className="report-queue-row"><span>Degraded applications</span><b>{reports.apps.degraded}</b></div><div className="report-queue-row"><span>Warning endpoints</span><b>{reports.devices.warning}</b></div><div className="report-foot">Summary is calculated from the workspace database. Demo data is labelled and should not be represented as real company metrics.</div></section></div>
  </div>;
}

function DeviceDrawer({ device, detail, onClose, onTroubleshoot }) {
  if(!device)return null;
  const d=detail?.device||device;
  return <div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><aside className="device-drawer"><div className="drawer-top"><span className="panel-kicker">ENDPOINT PROFILE</span><button className="icon-button" onClick={onClose}><X size={18}/></button></div><div className="drawer-device-icon"><Laptop size={27}/></div><h2>{d.name}</h2><p>{d.hostname} · {d.platform}</p><div className="drawer-pills"><StatusPill status={d.status}/>{d.isDemo&&<span className="demo-chip">SIMULATED DEVICE</span>}</div><div className="drawer-section"><h4>DEVICE DETAILS</h4><div className="detail-pair"><span>Operating system</span><b>{d.osVersion||'Not reported'}</b></div><div className="detail-pair"><span>Assigned owner</span><b>{d.owner||'Unassigned'}</b></div><div className="detail-pair"><span>Department</span><b>{d.department||'—'}</b></div><div className="detail-pair"><span>IP address</span><b>{d.ipAddress||'Not reported'}</b></div><div className="detail-pair"><span>Last heartbeat</span><b>{timeAgo(d.lastSeenAt)}</b></div></div><div className="drawer-section"><h4>RESOURCE UTILIZATION</h4><div className="drawer-usage"><span>CPU</span><UsageBar value={d.cpuUsage}/></div><div className="drawer-usage"><span>Memory</span><UsageBar value={d.memoryUsage}/></div><div className="drawer-usage"><span>Disk</span><UsageBar value={d.diskUsage}/></div></div><div className="drawer-section"><h4>RECENT DIAGNOSTICS</h4>{detail?.diagnostics?.length?detail.diagnostics.slice(0,4).map(t=><div className="drawer-task" key={t.id}><span>{t.type.replaceAll('_',' ')}</span><StatusPill status={t.status}/></div>):<span className="muted-text">No diagnostic runs recorded.</span>}</div><button className="button primary full-width" onClick={()=>onTroubleshoot(d)}><Wrench size={15}/> Open troubleshooting</button></aside></div>;
}

function Modal({ title, kicker, onClose, children, wide=false }) {
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className={`modal ${wide?'wide':''}`}><div className="modal-heading"><div><span className="panel-kicker">{kicker}</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div>{children}</section></div>;
}

function EnrollModal({ onClose, onCreate, result, busy }) {
  const [name,setName]=useState('NEXUS Endpoint');const [platform,setPlatform]=useState('Windows');
  const agentApiBase=result?.agentUrl?.replace(/^wss:/,'https:').replace(/^ws:/,'http:').replace(/\/agent$/,'');
  return <Modal title="Enroll a device" kicker="ENDPOINT ONBOARDING" onClose={onClose}>
    {!result?<form className="modal-form" onSubmit={e=>{e.preventDefault();onCreate(name,platform);}}><p className="modal-intro">Create a one-time enrollment code for a computer you own or are authorized to manage. The code expires after 30 minutes.</p><label>Device display name<input value={name} onChange={e=>setName(e.target.value)} required/></label><label>Operating system<select value={platform} onChange={e=>setPlatform(e.target.value)}><option>Windows</option><option>macOS</option><option>Linux</option></select></label><button className="button primary full-width" disabled={busy}>{busy?'Creating code…':'Generate enrollment code'} <ArrowUpRight size={15}/></button></form>:<div className="enrollment-result"><div className="enroll-success"><CheckCircle2 size={22}/><b>Enrollment code created</b></div><p>Run the agent on the target device and enter this code when prompted.</p><div className="enroll-code"><code>{result.enrollmentCode}</code><button onClick={()=>navigator.clipboard?.writeText(result.enrollmentCode)}><Copy size={15}/> Copy</button></div><div className="enroll-instructions"><b>Next step</b><code>npm install</code><code>NEXUS_SERVER={agentApiBase} NEXUS_ENROLLMENT_CODE={result.enrollmentCode} npm run agent</code><small>Keep this code private. It can only be used once and expires at {fmtTime(result.expiresAt)}.</small></div><button className="button primary full-width" onClick={onClose}>Done</button></div>}
  </Modal>;
}

function IncidentModal({ onClose, onSubmit, devices, busy }) {
  const [title,setTitle]=useState('');const [description,setDescription]=useState('');const [priority,setPriority]=useState('MEDIUM');const [deviceId,setDeviceId]=useState('');const [category,setCategory]=useState('Endpoint');
  return <Modal title="Create incident" kicker="SERVICE OPERATIONS" onClose={onClose}><form className="modal-form" onSubmit={e=>{e.preventDefault();onSubmit({title,description,priority,deviceId:deviceId||null,category});}}><label>Incident title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Describe the issue in one line" required minLength={5}/></label><label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Include symptoms, impact and what has already been checked…" rows={4} required minLength={10}/></label><div className="form-two-col"><label>Priority<select value={priority} onChange={e=>setPriority(e.target.value)}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label><label>Category<select value={category} onChange={e=>setCategory(e.target.value)}><option>Endpoint</option><option>Network</option><option>Application</option><option>Access</option><option>General</option></select></label></div><label>Related device<select value={deviceId} onChange={e=>setDeviceId(e.target.value)}><option value="">No device selected</option>{devices.map(d=><option value={d.id} key={d.id}>{d.name}</option>)}</select></label><button className="button primary full-width" disabled={busy}>{busy?'Creating…':'Create incident'} <ArrowUpRight size={15}/></button></form></Modal>;
}

function ApplicationModal({ onClose, onSubmit, busy }) {
  const [name,setName]=useState('');const [environment,setEnvironment]=useState('Production');const [endpoint,setEndpoint]=useState('');const [criticality,setCriticality]=useState('MEDIUM');const [description,setDescription]=useState('');
  return <Modal title="Register an application" kicker="SERVICE CATALOGUE" onClose={onClose}><form className="modal-form" onSubmit={e=>{e.preventDefault();onSubmit({name,environment,endpoint,criticality,description});}}><label>Application name<input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Employee Workspace" required/></label><label>Health-check endpoint<input value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="https://service.example.com/health"/></label><p className="field-help">Use a health endpoint that returns a successful HTTP status when the service is ready.</p><div className="form-two-col"><label>Environment<select value={environment} onChange={e=>setEnvironment(e.target.value)}><option>Production</option><option>Staging</option><option>Development</option></select></label><label>Criticality<select value={criticality} onChange={e=>setCriticality(e.target.value)}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label></div><label>Description<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder="What does this service support?"/></label><button className="button primary full-width" disabled={busy}>{busy?'Saving…':'Add application'} <ArrowUpRight size={15}/></button></form></Modal>;
}

function App() {
  const [user,setUser]=useState(null);const [tokenChecked,setTokenChecked]=useState(false);const [loginError,setLoginError]=useState('');const [loginBusy,setLoginBusy]=useState(false);
  const [page,setPage]=useState('overview');const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [toast,setToast]=useState('');
  const [overview,setOverview]=useState(null);const [devices,setDevices]=useState([]);const [incidents,setIncidents]=useState([]);const [applications,setApplications]=useState([]);const [assets,setAssets]=useState([]);const [articles,setArticles]=useState([]);const [activity,setActivity]=useState([]);const [problems,setProblems]=useState([]);const [changes,setChanges]=useState([]);const [accessRequests,setAccessRequests]=useState([]);const [reports,setReports]=useState(null);
  const [selectedDevice,setSelectedDevice]=useState(null);const [drawerDevice,setDrawerDevice]=useState(null);const [deviceDetail,setDeviceDetail]=useState(null);const [task,setTask]=useState(null);const [taskBusy,setTaskBusy]=useState(false);const [refreshingDeviceId,setRefreshingDeviceId]=useState(null);const [fixingDeviceId,setFixingDeviceId]=useState(null);
  const [modal,setModal]=useState(null);const [modalBusy,setModalBusy]=useState(false);const [enrollmentResult,setEnrollmentResult]=useState(null);const [mobileNav,setMobileNav]=useState(false);

  const loadAll=useCallback(async()=>{
    if(!user)return;
    setLoading(true);setError('');
    try{
      if(user.role==='EMPLOYEE'){
        const [o,i,k,ar]=await Promise.all([api('/overview'),api('/incidents'),api('/knowledge'),api('/access-requests')]);
        setOverview(o);setIncidents(i);setArticles(k);setAccessRequests(ar);setDevices([]);setApplications([]);setAssets([]);setActivity([]);setProblems([]);setChanges([]);setReports(null);
      } else {
        const [o,d,i,a,as,k,p,c,ar,r]=await Promise.all([api('/overview'),api('/devices'),api('/incidents'),api('/applications'),api('/assets'),api('/knowledge'),api('/problems'),api('/changes'),api('/access-requests'),api('/reports/summary')]);
        const log=['ADMIN','MANAGER'].includes(user.role)?await api('/audit'):[];
        setOverview(o);setDevices(d);setIncidents(i);setApplications(a);setAssets(as);setArticles(k);setActivity(log);setProblems(p);setChanges(c);setAccessRequests(ar);setReports(r);
      }
    }catch(e){setError(e.message);}finally{setLoading(false);}
  },[user]);
  useEffect(()=>{const token=localStorage.getItem('nexus_token');if(!token){setTokenChecked(true);return;}api('/auth/me').then(r=>setUser(r.user)).catch(()=>localStorage.removeItem('nexus_token')).finally(()=>setTokenChecked(true));},[]);
  useEffect(()=>{if(user)loadAll();},[user,loadAll]);
  useEffect(()=>{if(!user)return;const timer=setInterval(()=>{loadAll();},30000);return()=>clearInterval(timer);},[user,loadAll]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3500);return()=>clearTimeout(t);},[toast]);

  const login=async(email,password)=>{setLoginBusy(true);setLoginError('');try{const r=await api('/auth/login',{method:'POST',body:{email,password}});localStorage.setItem('nexus_token',r.token);setPage('overview');setUser(r.user);}catch(e){setLoginError(e.message);}finally{setLoginBusy(false);}};
  const logout=async()=>{try{await api('/auth/logout',{method:'POST'});}catch{}localStorage.removeItem('nexus_token');setUser(null);setPage('overview');setOverview(null);};
  const refreshDevice=async(id)=>{if(!id)return;setRefreshingDeviceId(id);try{const refresh=await api(`/devices/${id}/refresh`,{method:'POST'});let detail=null;if(refresh.status==='COMPLETED'&&refresh.device){detail=await api(`/devices/${id}`);}else{for(let attempt=0;attempt<5;attempt++){await new Promise(r=>setTimeout(r,800));detail=await api(`/devices/${id}`);if(detail.device?.lastSeenAt&&new Date(detail.device.lastSeenAt).getTime()>new Date(refresh.requestedAt||Date.now()-5000).getTime())break;}}if(detail){setDeviceDetail(detail);setSelectedDevice(detail.device);}await loadAll();setToast(refresh.status==='COMPLETED'?'Device metrics refreshed.':refresh.message||'Refresh requested from the endpoint agent.');return detail;}catch(e){setToast(e.message);return null;}finally{setRefreshingDeviceId(null);}};
  const applyDemoFix=async(device,action)=>{if(!device?.isDemo){setToast('Guided remote changes are not enabled for live endpoints.');return null;}setFixingDeviceId(device.id);try{const result=await api(`/devices/${device.id}/demo-remediation`,{method:'POST',body:{action}});await refreshDevice(device.id);setToast('Demo action applied. Review the before/after metrics.');return result;}catch(e){setToast(e.message);return null;}finally{setFixingDeviceId(null);}};
  const runTask=async(device,type,args={})=>{
    if(!device)return;setSelectedDevice(device);setTaskBusy(true);setTask(null);
    try{let result=await api(`/devices/${device.id}/diagnostics`,{method:'POST',body:{type,arguments:args}});setTask(result);
      for(let attempt=0;attempt<20&&['QUEUED','SENT'].includes(result.status);attempt++){await new Promise(r=>setTimeout(r,1200));result=await api(`/diagnostics/${result.taskKey}`);setTask(result);}
      if(result.status==='COMPLETED')setToast('Diagnostic run completed.');else if(result.status==='FAILED')setToast(result.error||'Diagnostic could not be completed.');
      await loadAll();await refreshDevice(device.id);
    }catch(e){setToast(e.message);}finally{setTaskBusy(false);}
  };
  const createEnrollment=async(name,platform)=>{setModalBusy(true);try{const result=await api('/agent/enrollment-codes',{method:'POST',body:{name,platform}});setEnrollmentResult(result);await loadAll();}catch(e){setToast(e.message);}finally{setModalBusy(false);}};
  const createIncident=async(data)=>{setModalBusy(true);try{const created=await api('/incidents',{method:'POST',body:data});setModal(null);setToast('Incident created.');await loadAll();return created;}catch(e){setToast(e.message);throw e;}finally{setModalBusy(false);}};
  const updateIncident=async(id,data)=>{try{await api(`/incidents/${id}`,{method:'PATCH',body:data});setToast('Incident updated.');await loadAll();}catch(e){setToast(e.message);}};
  const checkApplication=async(id)=>{try{await api(`/applications/${id}/check`,{method:'POST'});setToast('Health check completed.');await loadAll();}catch(e){setToast(e.message);}};
  const addApplication=async(data)=>{setModalBusy(true);try{await api('/applications',{method:'POST',body:data});setModal(null);setToast('Application registered.');await loadAll();}catch(e){setToast(e.message);}finally{setModalBusy(false);}};
  const createProblem=async(data)=>{try{await api('/problems',{method:'POST',body:data});setToast('Problem investigation created.');await loadAll();}catch(e){setToast(e.message);}};
  const updateProblem=async(id,data)=>{try{await api(`/problems/${id}`,{method:'PATCH',body:data});setToast('Problem record updated.');await loadAll();}catch(e){setToast(e.message);}};
  const createChange=async(data)=>{try{await api('/changes',{method:'POST',body:data});setToast('Change request submitted.');await loadAll();}catch(e){setToast(e.message);}};
  const updateChange=async(id,data)=>{try{await api(`/changes/${id}`,{method:'PATCH',body:data});setToast('Change status updated.');await loadAll();}catch(e){setToast(e.message);}};
  const createAccessRequest=async(data)=>{try{await api('/access-requests',{method:'POST',body:data});setToast('Access request submitted for review.');await loadAll();}catch(e){setToast(e.message);}};
  const reviewAccessRequest=async(id,status,reviewNotes='')=>{try{await api(`/access-requests/${id}`,{method:'PATCH',body:{status,reviewNotes}});setToast('Access request reviewed.');await loadAll();}catch(e){setToast(e.message);}};

  if(!tokenChecked)return <div className="boot-screen"><BrandMark/><span>Preparing NEXUS workspace…</span></div>;
  if(!user)return <Login onLogin={login} error={loginError} busy={loginBusy}/>;

  const activeIncidents=incidents.filter(i=>!['RESOLVED','CLOSED'].includes(i.status)).length;
  const canOperate=user.role!=='EMPLOYEE';
  const canManage=user.role==='ADMIN';
  const navItems=user.role==='EMPLOYEE'?NAV_ITEMS.filter(n=>['overview','incidents','knowledge','access'].includes(n.page)):user.role==='TECHNICIAN'?NAV_ITEMS.filter(n=>n.page!=='activity'&&n.page!=='access'):NAV_ITEMS;
  const pageTitle= NAV_ITEMS.find(n=>n.page===page)?.label || 'Overview';
  const navigate=(next)=>{setPage(next);setMobileNav(false);setError('');};
  const openTroubleshooting=(device)=>{setSelectedDevice(device);setTask(null);setDrawerDevice(null);setDeviceDetail(null);setPage('troubleshooting');};

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?'mobile-open':''}`}>
      <div className="sidebar-brand"><BrandMark/><button className="mobile-close icon-button" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <div className="workspace-switch"><div className="workspace-avatar">A</div><div><b>ABC Technologies</b><span>IT OPERATIONS</span></div><ChevronDown size={14}/></div>
      <nav className="side-nav">{navItems.map(item=><div key={item.page}>{item.section&&<div className="nav-section-label">{item.section}</div>}<button className={`nav-link ${page===item.page?'active':''}`} onClick={()=>navigate(item.page)}><item.icon size={17} strokeWidth={1.85}/><span>{item.label}</span>{item.count&&activeIncidents>0&&<small>{activeIncidents}</small>}</button></div>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><div className="help-symbol"><LifeBuoy size={16}/></div><div><b>Need a hand?</b><span>Visit the knowledge base</span></div><button onClick={()=>navigate('knowledge')}><ArrowUpRight size={15}/></button></div><div className="sidebar-user"><div className="user-avatar">{user.name?.split(' ').map(n=>n[0]).slice(0,2).join('')}</div><div className="user-copy"><b>{user.name}</b><span>{user.role.replaceAll('_',' ')}</span></div><button className="icon-button" onClick={logout} title="Sign out"><LogOut size={16}/></button></div></div>
    </aside>
    {mobileNav&&<div className="mobile-shade" onClick={()=>setMobileNav(false)}/>}
    <main className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={()=>setMobileNav(true)}><Menu size={19}/></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={13}/><b>{pageTitle}</b></div></div><div className="topbar-right"><div className="topbar-status"><i/> SYSTEMS NOMINAL</div><button className="topbar-icon" title="Help" onClick={()=>navigate('knowledge')}><CircleHelp size={17}/></button><button className="topbar-icon notification-button" title="Notifications" onClick={()=>navigate('incidents')}><Bell size={17}/>{activeIncidents>0&&<i/>}</button><div className="topbar-avatar">{user.name?.split(' ').map(n=>n[0]).slice(0,2).join('')}</div></div></header>
      {error&&<div className="error-banner"><AlertCircle size={15}/>{error}<button onClick={loadAll}>Retry</button></div>}
      {loading&&<div className="refresh-line"/>}
      {page==='overview'&&<Overview data={overview} onNavigate={navigate} canOperate={canOperate} displayName={user.name?.split(' ')[0] || 'there'} onSelectDevice={(d)=>{setDrawerDevice(d);refreshDevice(d.id);}}/>}
      {page==='devices'&&<Devices devices={devices} canManage={canManage} onEnroll={()=>{setEnrollmentResult(null);setModal('enroll');}} onOpenDiagnostics={openTroubleshooting} onRefresh={loadAll} onSelectDevice={(d)=>{setDrawerDevice(d);refreshDevice(d.id);}}/>}
      {page==='troubleshooting'&&<Troubleshooting devices={devices} selectedDevice={selectedDevice} onSelectDevice={setSelectedDevice} onRunTask={runTask} task={task} taskBusy={taskBusy} refreshDevice={refreshDevice} refreshingDeviceId={refreshingDeviceId} onCreateIncident={createIncident} onApplyDemoFix={applyDemoFix} fixingDeviceId={fixingDeviceId} onNavigate={navigate}/>}
      {page==='incidents'&&<Incidents incidents={incidents} devices={devices} editable={canOperate} onCreate={()=>setModal('incident')} onUpdate={updateIncident}/> }
      {page==='problems'&&canOperate&&<Problems problems={problems} incidents={incidents} onCreate={createProblem} onUpdate={updateProblem}/>}
      {page==='changes'&&canOperate&&<Changes changes={changes} onCreate={createChange} onUpdate={updateChange} canApprove={['ADMIN','MANAGER'].includes(user.role)}/>}
      {page==='access'&&<AccessRequests requests={accessRequests} onCreate={createAccessRequest} onReview={reviewAccessRequest} canReview={['ADMIN','MANAGER'].includes(user.role)}/>}
      {page==='reports'&&canOperate&&<Reports reports={reports}/>}
      {page==='applications'&&<Applications applications={applications} canManage={canManage} onCheck={checkApplication} onAdd={()=>setModal('application')}/>}
      {page==='assets'&&<Assets assets={assets}/>}
      {page==='knowledge'&&<Knowledge articles={articles}/>}
      {page==='activity'&&<ActivityLog activity={activity}/>}
      <footer className="global-footer"><span>© {new Date().getFullYear()} NEXUS IT COMMAND CENTER</span><span>LOCAL WORKSPACE <i/> VERSION 1.2.0</span><button onClick={()=>navigate('activity')}>Audit history <ArrowUpRight size={12}/></button></footer>
    </main>
    <DeviceDrawer device={drawerDevice} detail={deviceDetail} onClose={()=>{setDrawerDevice(null);setDeviceDetail(null);}} onTroubleshoot={d=>{setSelectedDevice(d);setDrawerDevice(null);setDeviceDetail(null);setPage('troubleshooting');}}/>
    {modal==='enroll'&&<EnrollModal onClose={()=>{setModal(null);setEnrollmentResult(null);}} onCreate={createEnrollment} result={enrollmentResult} busy={modalBusy}/>}
    {modal==='incident'&&<IncidentModal onClose={()=>setModal(null)} onSubmit={createIncident} devices={devices} busy={modalBusy}/>}
    {modal==='application'&&<ApplicationModal onClose={()=>setModal(null)} onSubmit={addApplication} busy={modalBusy}/>}
    {toast&&<div className="toast"><CheckCircle2 size={16}/>{toast}<button onClick={()=>setToast('')}><X size={14}/></button></div>}
  </div>;
}

export default App;
