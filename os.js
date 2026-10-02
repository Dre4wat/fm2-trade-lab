(() => {
'use strict';

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const num = v => Number.isFinite(+v) ? +v : null;
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const fmtN = v => v == null ? '—' : Number(v).toLocaleString();
const fmtM = v => v == null ? '—' : '$' + Number(v).toFixed(Math.abs(+v)<10?1:0) + 'M';
const fmtDate = v => { if(!v) return 'TBD'; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); };
const ordinal = n => { if(n==null)return '—'; const v=n%100; return n + (v>=11&&v<=13?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th')); };

const APP_META = {
  home:['⌂','Command Center','Live league telemetry and control surface'],
  teams:['32','Franchises','Every team as a living franchise system'],
  players:['◎','Player Matrix','Search, filter and inspect every player'],
  standings:['≋','Standings','Conference and divisional race'],
  schedule:['▦','Schedule','Results, upcoming games and weekly flow'],
  contracts:['$','Cap Matrix','Contracts, cap pressure and value'],
  compare:['⇄','Compare','Side-by-side player analysis'],
  trade:['⇌','Trade Lab','Build and evaluate FM2 deals'],
  lab:['✦','FM2 Lab','Command-line exploration of the league']
};

const DIVISIONS = {
  ARI:['NFC','NFC West'],ATL:['NFC','NFC South'],BAL:['AFC','AFC North'],BUF:['AFC','AFC East'],
  CAR:['NFC','NFC South'],CHI:['NFC','NFC North'],CIN:['AFC','AFC North'],CLE:['AFC','AFC North'],
  DAL:['NFC','NFC East'],DEN:['AFC','AFC West'],DET:['NFC','NFC North'],GB:['NFC','NFC North'],
  HOU:['AFC','AFC South'],IND:['AFC','AFC South'],JAX:['AFC','AFC South'],KC:['AFC','AFC West'],
  LV:['AFC','AFC West'],LAC:['AFC','AFC West'],LAR:['NFC','NFC West'],MIA:['AFC','AFC East'],
  MIN:['NFC','NFC North'],NE:['AFC','AFC East'],NO:['NFC','NFC South'],NYG:['NFC','NFC East'],
  NYJ:['AFC','AFC East'],PHI:['NFC','NFC East'],PIT:['AFC','AFC North'],SEA:['NFC','NFC West'],
  SF:['NFC','NFC West'],TB:['NFC','NFC South'],TEN:['AFC','AFC South'],WAS:['NFC','NFC East']
};

const state = {
  db:{meta:{},teams:[],players:[],games:[],standings:[]},
  app:'home', team:null, player:null,
  playerFilter:{q:'',team:'ALL',pos:'ALL',dev:'ALL',sort:'ovr'},
  scheduleFilter:{team:'ALL',stage:'ALL',week:'ALL'},
  compare:[null,null],
  trade:{left:'ARI',right:'CHI',L:[],R:[]},
  terminal:[],
  previous:null,
  motion:true,compact:false,focus:false
};

function toast(title, body){
  const el=document.createElement('div'); el.className='toast';
  el.innerHTML='<b>'+esc(title)+'</b><span>'+esc(body)+'</span>';
  $('#toastStack').appendChild(el);
  setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(12px)';setTimeout(()=>el.remove(),250)},3300);
}
function team(ab){
  return state.db.teams.find(t=>t.abbr===ab) || {abbr:ab,city:ab,name:'',c1:'#142033',c2:'#070a10',logo:'',capAvailable:null};
}
function roster(ab){ return state.db.players.filter(p=>p.team===ab); }
function playerById(id){ return state.db.players.find(p=>String(p.id)===String(id)); }
function standing(ab){ return state.db.standings.find(s=>s.team===ab) || null; }
function record(ab){
  const s=standing(ab);
  if(s && s.wins!=null) return {w:+s.wins||0,l:+s.losses||0,t:+s.ties||0,pf:s.pointsFor,pa:s.pointsAgainst};
  let w=0,l=0,t=0,pf=0,pa=0;
  state.db.games.filter(g=>g.played && (g.home===ab||g.away===ab)).forEach(g=>{
    const hs=+g.homeScore||0,as=+g.awayScore||0,isHome=g.home===ab;
    const us=isHome?hs:as,them=isHome?as:hs; pf+=us;pa+=them;
    if(us>them)w++;else if(us<them)l++;else t++;
  });
  return {w,l,t,pf,pa};
}
function valueOf(p){
  if(p?.value!=null && Number.isFinite(+p.value)) return +p.value;
  const o=+p?.ovr||60,a=+p?.age||27;
  let v=(o*o)*.58*Math.max(.45,1.34-(a-22)*.055);
  if(p?.dev==='X-FACTOR')v*=1.32; else if(p?.dev==='SUPERSTAR')v*=1.18; else if(p?.dev==='STAR')v*=1.08;
  return Math.round(v);
}
function teamImg(ab, cls='team-logo'){
  const t=team(ab); return t.logo?'<img class="'+cls+'" src="'+esc(t.logo)+'" alt="'+esc(ab)+'" onerror="this.style.visibility=\'hidden\'">':'<div class="'+cls+'"></div>';
}
function playerImg(p, cls='avatar round'){
  if(p?.headshot) return '<img class="'+cls+'" src="'+esc(p.headshot)+'" alt="" onerror="this.style.display=\'none\'">';
  const ini=String(p?.name||'?').split(/\s+/).map(x=>x[0]).slice(0,2).join('');
  return '<div class="'+cls+'" style="display:grid;place-items:center;font-weight:950">'+esc(ini)+'</div>';
}
function devBadge(dev){
  const d=String(dev||'NORMAL').toUpperCase();
  const c=d.includes('X-')?'xf':d==='SUPERSTAR'?'ss':d==='STAR'?'star':'normal';
  return '<span class="badge '+c+'">'+esc(d)+'</span>';
}
function setAccent(ab){
  const t=ab?team(ab):null;
  document.documentElement.style.setProperty('--accent', t?.c1 || '#70e7ff');
  document.documentElement.style.setProperty('--accent2', t?.c2 || '#9c7cff');
}
function ageProfile(ab){
  const ps=roster(ab).filter(p=>p.age!=null); if(!ps.length)return 'Unknown';
  const avg=ps.reduce((s,p)=>s+(+p.age||0),0)/ps.length;
  if(avg<25.7)return 'Young Core'; if(avg<27.6)return 'Prime Window'; return 'Veteran Build';
}
function teamPower(ab){
  const ps=[...roster(ab)].sort((a,b)=>(b.ovr||0)-(a.ovr||0)).slice(0,22);
  if(!ps.length)return 0;
  let score=ps.reduce((s,p)=>s+(+p.ovr||0),0)/ps.length;
  const stars=ps.filter(p=>['X-FACTOR','SUPERSTAR'].includes(p.dev)).length;
  score += stars*.22; return Math.round(score*10)/10;
}
function posRoom(ab,pos){
  return roster(ab).filter(p=>p.pos===pos).sort((a,b)=>(b.ovr||0)-(a.ovr||0));
}
function gamesFor(ab, played=null){
  let g=state.db.games.filter(x=>x.home===ab||x.away===ab);
  if(played===true)g=g.filter(x=>x.played); if(played===false)g=g.filter(x=>!x.played);
  return g.sort((a,b)=>((a.stageIndex??0)-(b.stageIndex??0))||((a.weekIndex??0)-(b.weekIndex??0)));
}
function rankOf(p, field='ovr', filter=()=>true, desc=true){
  const list=state.db.players.filter(filter).filter(x=>x[field]!=null).sort((a,b)=>desc?(+b[field]||0)-(+a[field]||0):(+a[field]||0)-(+b[field]||0));
  const i=list.findIndex(x=>String(x.id)===String(p.id)); return i<0?null:i+1;
}
function valueRank(p,filter=()=>true){
  const list=state.db.players.filter(filter).sort((a,b)=>valueOf(b)-valueOf(a));
  const i=list.findIndex(x=>String(x.id)===String(p.id)); return i<0?null:i+1;
}
function stat(label,value,sub=''){
  return '<div class="stat-chip"><span>'+esc(label)+'</span><b>'+esc(value)+'</b><small>'+esc(sub)+'</small></div>';
}
function rowPlayer(p,side=''){
  return '<div class="row-card clickable" data-player="'+esc(p.id)+'">'+playerImg(p)+'<div class="row-main"><b>'+esc(p.name)+'</b><span>'+esc(p.team)+' · '+esc(p.pos)+' · Age '+esc(p.age??'—')+' '+(side?'· '+esc(side):'')+'</span></div><div class="row-side"><b>'+(p.ovr??'—')+' OVR</b><span>'+fmtN(valueOf(p))+' value</span></div></div>';
}
function gameCard(g){
  const home=team(g.home),away=team(g.away);
  return '<div class="game-card"><div class="game-top"><span>'+esc(g.stage||'')+' '+(g.week?'· W'+g.week:'')+'</span><span>'+esc(g.played?'FINAL':fmtDate(g.date))+'</span></div>'+
    '<div class="game-team">'+teamImg(g.away)+'<b>'+esc(g.away||'TBD')+'</b><span class="game-score">'+(g.played?(g.awayScore??0):'—')+'</span></div>'+
    '<div class="game-team">'+teamImg(g.home)+'<b>'+esc(g.home||'TBD')+'</b><span class="game-score">'+(g.played?(g.homeScore??0):'—')+'</span></div></div>';
}
function infoWindow(title,body,actions=''){
  return '<section class="window"><div class="window-head"><div class="window-title"><span class="lights"><i></i><i></i><i></i></span>'+esc(title)+'</div>'+actions+'</div><div class="window-body">'+body+'</div></section>';
}
function heroTitle(kicker,title,desc,actions=''){
  return '<div class="hero-copy"><span class="eyebrow">'+esc(kicker)+'</span><h2>'+title+'</h2><p>'+esc(desc)+'</p><div class="hero-actions">'+actions+'</div></div>';
}

function renderHome(){
  setAccent(null);
  const played=state.db.games.filter(g=>g.played).sort((a,b)=>((b.stageIndex??0)-(a.stageIndex??0))||((b.weekIndex??0)-(a.weekIndex??0))).slice(0,6);
  const upcoming=state.db.games.filter(g=>!g.played).sort((a,b)=>((a.stageIndex??0)-(b.stageIndex??0))||((a.weekIndex??0)-(b.weekIndex??0))).slice(0,6);
  const topTeams=[...state.db.teams].sort((a,b)=>{
    const ra=record(a.abbr),rb=record(b.abbr); return (rb.w-rb.l)-(ra.w-ra.l) || teamPower(b.abbr)-teamPower(a.abbr);
  }).slice(0,8);
  const topPlayers=[...state.db.players].sort((a,b)=>valueOf(b)-valueOf(a)).slice(0,6);
  const young=[...state.db.players].filter(p=>(+p.age||99)<=24).sort((a,b)=>valueOf(b)-valueOf(a)).slice(0,6);
  const meta=state.db.meta||{};
  const hero=infoWindow('FM2 KERNEL',
    '<div class="hero-kernel">'+
    heroTitle('FRANCHISE INTELLIGENCE LAYER','The league is now an <span>operating system.</span>','Every roster, game, contract and rating lives inside one interactive command surface. Search anything. Open any franchise. Build deals. Explore the league like software.',
      '<button class="btn primary" data-app="teams">Enter Franchise Grid</button><button class="btn" data-app="players">Open Player Matrix</button><button class="btn" data-app="lab">Launch FM2 Lab</button>')+
    '<div class="kernel-orbit"><div class="kernel-core">FM2</div><div class="orbit-node n1">'+state.db.teams.length+' T</div><div class="orbit-node n2">'+state.db.players.length+' P</div><div class="orbit-node n3">'+state.db.games.length+' G</div><div class="orbit-node n4">LIVE</div></div></div>'+
    '<div class="stat-strip">'+
      stat('Season',meta.season||'2026',(meta.stage||'')+' '+(meta.week||''))+
      stat('Franchises',state.db.teams.length,'connected systems')+
      stat('Players',fmtN(state.db.players.length),'live player records')+
      stat('Games',fmtN(state.db.games.length),'league schedule')+
    '</div>'
  );
  const power=infoWindow('FRANCHISE SIGNAL', '<div class="list">'+topTeams.map((t,i)=>{
    const r=record(t.abbr),s=standing(t.abbr);
    return '<div class="row-card clickable" data-team="'+t.abbr+'">'+teamImg(t.abbr)+'<div class="row-main"><b>'+(i+1)+'. '+esc(t.city+' '+t.name)+'</b><span>'+r.w+'-'+r.l+(r.t?'-'+r.t:'')+' · '+esc(s?.division||DIVISIONS[t.abbr]?.[1]||'')+'</span></div><div class="row-side"><b>'+teamPower(t.abbr)+'</b><span>POWER</span></div></div>';
  }).join('')+'</div>');
  const elite=infoWindow('ASSET ORBIT','<div class="list">'+topPlayers.map(p=>rowPlayer(p)).join('')+'</div>');
  const youth=infoWindow('FUTURE CORE','<div class="list">'+young.map(p=>rowPlayer(p,'U24')).join('')+'</div>');
  const recent=infoWindow('RECENT SIGNALS',played.length?'<div class="schedule-grid">'+played.map(gameCard).join('')+'</div>':'<div class="empty">No completed games in the live feed.</div>');
  const next=infoWindow('NEXT UP',upcoming.length?'<div class="schedule-grid">'+upcoming.map(gameCard).join('')+'</div>':'<div class="empty">No upcoming games in the live feed.</div>');
  $('#desktop').innerHTML='<div class="hero-grid"><div>'+hero+'</div><div class="grid">'+power+'</div></div><div class="section g2 grid"><div>'+elite+'</div><div>'+youth+'</div></div><div class="section">'+recent+'</div><div class="section">'+next+'</div>';
}

function renderTeams(){
  if(state.team){ renderTeamDetail(state.team); return; }
  setAccent(null);
  const tiles=[...state.db.teams].sort((a,b)=>a.abbr.localeCompare(b.abbr)).map(t=>{
    const r=record(t.abbr),s=standing(t.abbr);
    return '<article class="team-tile" style="--c1:'+esc(t.c1||'#142033')+';--c2:'+esc(t.c2||'#070a10')+'" data-team="'+esc(t.abbr)+'">'+
      teamImg(t.abbr)+'<span class="eyebrow">'+esc(t.abbr)+' // '+esc(DIVISIONS[t.abbr]?.[0]||'NFL')+'</span><h3>'+esc(t.city)+'<br>'+esc(t.name)+'</h3><p>'+esc(s?.userName||'FM2 FRANCHISE')+'</p>'+
      '<div class="mini"><span>'+r.w+'-'+r.l+(r.t?'-'+r.t:'')+'</span><span>'+teamPower(t.abbr)+' PWR</span><span>'+fmtM(t.capAvailable)+' CAP</span></div></article>';
  }).join('');
  $('#desktop').innerHTML=infoWindow('FRANCHISE GRID','<div class="section-head"><div><span class="eyebrow">32 LIVE SYSTEMS</span><h2>Choose a franchise node</h2></div><p>Each card is a portal into its full FM2 state.</p></div><div class="team-galaxy">'+tiles+'</div>');
}

function renderTeamDetail(ab){
  const t=team(ab),r=record(ab),s=standing(ab),ps=[...roster(ab)].sort((a,b)=>(b.ovr||0)-(a.ovr||0));
  setAccent(ab);
  const stars=ps.filter(p=>['X-FACTOR','SUPERSTAR','STAR'].includes(p.dev));
  const avgAge=ps.filter(p=>p.age!=null).reduce((x,p)=>x+(+p.age||0),0)/(ps.filter(p=>p.age!=null).length||1);
  const expiring=ps.filter(p=>+p.yearsLeft===1).sort((a,b)=>(b.ovr||0)-(a.ovr||0));
  const contracts=[...ps].filter(p=>p.capHit!=null).sort((a,b)=>(b.capHit||0)-(a.capHit||0));
  const recent=gamesFor(ab,true).slice(-5).reverse(), next=gamesFor(ab,false).slice(0,5);
  const posGroups={QB:['QB'],BACKFIELD:['HB','FB'],RECEIVERS:['WR','TE'],OL:['LT','LG','C','RG','RT'],DL:['LE','RE','DT'],LB:['LOLB','MLB','ROLB'],SECONDARY:['CB','FS','SS']};
  const rooms=Object.entries(posGroups).map(([k,pos])=>{
    const list=ps.filter(p=>pos.includes(p.pos)).slice(0,5),score=list.length?list.slice(0,3).reduce((x,p)=>x+(+p.ovr||0),0)/Math.min(3,list.length):0;
    return '<div class="info-card"><h4>'+k+'</h4><div class="kv"><span>Room grade</span><b>'+(score?score.toFixed(1):'—')+'</b></div><div class="kv"><span>Top unit</span><b>'+esc(list.slice(0,2).map(p=>p.name).join(' / ')||'—')+'</b></div></div>';
  }).join('');
  const hero='<section class="detail-hero" style="--c1:'+esc(t.c1||'#17243a')+';--c2:'+esc(t.c2||'#070a10')+'"><div class="detail-grid">'+teamImg(ab,'big-team-logo')+
    '<div><span class="eyebrow">'+esc(ab)+' // '+esc(s?.division||DIVISIONS[ab]?.[1]||'FRANCHISE')+'</span><h2>'+esc(t.city)+' '+esc(t.name)+'</h2><p>Owner '+esc(s?.userName||'—')+' · '+esc(ageProfile(ab))+' · '+stars.length+' impact-development players</p>'+
    '<div class="detail-metrics"><div class="metric"><span>Record</span><b>'+r.w+'-'+r.l+(r.t?'-'+r.t:'')+'</b></div><div class="metric"><span>Power</span><b>'+teamPower(ab)+'</b></div><div class="metric"><span>Cap</span><b>'+fmtM(t.capAvailable)+'</b></div><div class="metric"><span>Roster</span><b>'+ps.length+'</b></div></div>'+
    '<div class="hero-actions"><button class="btn" data-back-teams="1">← Grid</button><button class="btn primary" data-team-trade="'+ab+'">Open in Trade Lab</button></div></div>'+
    '<div><span class="eyebrow">PLAYOFF SIGNAL</span><div style="font-size:46px;font-weight:1000;margin-top:8px">'+esc(s?.seed?'#'+s.seed:'—')+'</div><div class="muted" style="font-size:9px">'+esc(s?.playoffStatus||'SEED / STATUS')+'</div></div></div></section>';
  const perf='<div class="profile-cards">'+[
    ['OFFENSE',[['Total yards',s?.offTotalYds],['Pass yards',s?.offPassYds],['Rush yards',s?.offRushYds],['Points',s?.pointsFor]]],
    ['DEFENSE',[['Total yards allowed',s?.defTotalYds],['Pass allowed',s?.defPassYds],['Rush allowed',s?.defRushYds],['Points allowed',s?.pointsAgainst]]],
    ['ROSTER OS',[['Average age',avgAge?avgAge.toFixed(1):'—'],['Stars',stars.length],['Expiring',expiring.length],['Turnover diff',s?.turnoverDiff??'—']]]
  ].map(([title,rows])=>'<div class="info-card"><h4>'+title+'</h4>'+rows.map(([k,v])=>'<div class="kv"><span>'+esc(k)+'</span><b>'+esc(v??'—')+'</b></div>').join('')+'</div>').join('')+'</div>';
  const top=infoWindow('CORE ASSETS','<div class="list">'+ps.slice(0,8).map(p=>rowPlayer(p)).join('')+'</div>');
  const cap=infoWindow('CAP PRESSURE','<div class="list">'+contracts.slice(0,8).map(p=>rowPlayer(p,fmtM(p.capHit)+' CAP')).join('')+'</div>');
  const fullRows=ps.map(p=>'<tr class="clickable" data-player="'+esc(p.id)+'"><td><div class="person">'+playerImg(p)+'<div><b>'+esc(p.name)+'</b><small>'+esc(p.pos)+' · '+esc(p.dev||'NORMAL')+'</small></div></div></td><td>'+esc(p.ovr??'—')+'</td><td>'+esc(p.age??'—')+'</td><td>'+esc(p.speed??'—')+'</td><td>'+fmtM(p.capHit)+'</td><td>'+esc(p.yearsLeft??'—')+'</td><td>'+fmtN(valueOf(p))+'</td></tr>').join('');
  const rosterWindow=infoWindow('ROSTER DATABASE','<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Player</th><th>OVR</th><th>Age</th><th>SPD</th><th>Cap</th><th>Years</th><th>Value</th></tr></thead><tbody>'+fullRows+'</tbody></table></div>');
  const roomWin=infoWindow('POSITION TOPOLOGY','<div class="profile-cards">'+rooms+'</div>');
  const games=infoWindow('FRANCHISE TIMELINE','<div class="section-head"><div><span class="eyebrow">RECENT</span><h2>Last signals</h2></div></div><div class="schedule-grid">'+(recent.map(gameCard).join('')||'<div class="empty">No results.</div>')+'</div><div class="section-head" style="margin-top:14px"><div><span class="eyebrow">NEXT</span><h2>Upcoming</h2></div></div><div class="schedule-grid">'+(next.map(gameCard).join('')||'<div class="empty">No upcoming games.</div>')+'</div>');
  $('#desktop').innerHTML='<div class="detail-shell">'+hero+perf+'<div class="grid g2">'+top+cap+'</div>'+roomWin+rosterWindow+games+'</div>';
}

function renderPlayers(){
  if(state.player){ renderPlayerDetail(state.player); return; }
  setAccent(null);
  const f=state.playerFilter;
  const positions=[...new Set(state.db.players.map(p=>p.pos).filter(Boolean))].sort();
  let ps=state.db.players.filter(p=>{
    const q=f.q.toLowerCase();
    return (!q || (p.name+' '+p.team+' '+p.pos+' '+(p.college||'')).toLowerCase().includes(q)) &&
      (f.team==='ALL'||p.team===f.team) && (f.pos==='ALL'||p.pos===f.pos) && (f.dev==='ALL'||p.dev===f.dev);
  });
  ps.sort((a,b)=>f.sort==='value'?valueOf(b)-valueOf(a):f.sort==='age'?(+a.age||99)-(+b.age||99):f.sort==='cap'?(+b.capHit||0)-(+a.capHit||0):(b.ovr||0)-(a.ovr||0));
  const filters='<div class="filters"><input id="playerQ" class="input" placeholder="Search player, team, college…" value="'+esc(f.q)+'">'+
    '<select id="playerTeam" class="select"><option value="ALL">All teams</option>'+state.db.teams.map(t=>'<option '+(f.team===t.abbr?'selected':'')+'>'+t.abbr+'</option>').join('')+'</select>'+
    '<select id="playerPos" class="select"><option value="ALL">All positions</option>'+positions.map(x=>'<option '+(f.pos===x?'selected':'')+'>'+x+'</option>').join('')+'</select>'+
    '<select id="playerDev" class="select"><option value="ALL">All development</option>'+['X-FACTOR','SUPERSTAR','STAR','NORMAL'].map(x=>'<option '+(f.dev===x?'selected':'')+'>'+x+'</option>').join('')+'</select>'+
    '<select id="playerSort" class="select"><option value="ovr" '+(f.sort==='ovr'?'selected':'')+'>Sort: OVR</option><option value="value" '+(f.sort==='value'?'selected':'')+'>Sort: Value</option><option value="age" '+(f.sort==='age'?'selected':'')+'>Sort: Youngest</option><option value="cap" '+(f.sort==='cap'?'selected':'')+'>Sort: Cap hit</option></select></div>';
  const rows=ps.slice(0,500).map((p,i)=>'<tr class="clickable" data-player="'+esc(p.id)+'"><td>'+(i+1)+'</td><td><div class="person">'+playerImg(p)+'<div><b>'+esc(p.name)+'</b><small>'+esc(p.team)+' · '+esc(p.pos)+' · '+esc(p.college||'—')+'</small></div></div></td><td><span class="ovr">'+esc(p.ovr??'—')+'</span></td><td>'+devBadge(p.dev)+'</td><td>'+esc(p.age??'—')+'</td><td>'+esc(p.speed??'—')+'</td><td>'+fmtM(p.capHit)+'</td><td>'+fmtN(valueOf(p))+'</td></tr>').join('');
  $('#desktop').innerHTML=infoWindow('PLAYER MATRIX','<div class="section-head"><div><span class="eyebrow">LIVE DATABASE</span><h2>'+fmtN(ps.length)+' matching players</h2></div><p>Click any row to open its identity layer.</p></div>'+filters+'<div class="data-table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Player</th><th>OVR</th><th>Dev</th><th>Age</th><th>SPD</th><th>Cap</th><th>Value</th></tr></thead><tbody>'+rows+'</tbody></table></div>');
}

function ratingSections(p){
  const groups = {
    'ATHLETIC':[['Speed','speed'],['Acceleration','acceleration'],['Agility','agility'],['Strength','strength'],['Jumping','jumping'],['Awareness','awareness'],['Stamina','stamina']],
    'PASSING':[['Throw Power','throwPower'],['Short Accuracy','shortAccuracy'],['Medium Accuracy','mediumAccuracy'],['Deep Accuracy','deepAccuracy'],['Throw on Run','throwOnRun'],['Under Pressure','underPressure'],['Play Action','playAction']],
    'BALL CARRIER':[['Carrying','carrying'],['Break Tackle','breakTackle'],['Trucking','trucking'],['Juke','juke'],['Spin','spin'],['Stiff Arm','stiffArm'],['BC Vision','bcVision']],
    'RECEIVING':[['Catching','catching'],['Catch in Traffic','catchInTraffic'],['Spectacular Catch','spectacularCatch'],['Release','release'],['Short Route','shortRoute'],['Medium Route','mediumRoute'],['Deep Route','deepRoute']],
    'DEFENSE':[['Tackle','tackle'],['Hit Power','hitPower'],['Pursuit','pursuit'],['Play Recognition','playRecognition'],['Man Coverage','manCoverage'],['Zone Coverage','zoneCoverage'],['Press','press'],['Block Shed','blockShedding'],['Power Moves','powerMoves'],['Finesse Moves','finesseMoves']],
    'BLOCKING':[['Pass Block','passBlock'],['Run Block','runBlock'],['Impact Block','impactBlock'],['PB Power','passBlockPower'],['PB Finesse','passBlockFinesse'],['RB Power','runBlockPower'],['RB Finesse','runBlockFinesse']],
    'KICKING':[['Kick Power','kickPower'],['Kick Accuracy','kickAccuracy']]
  };
  return Object.entries(groups).map(([title,rows])=>{
    const visible=rows.map(([label,key])=>({label,val:p.ratings?.[key]})).filter(x=>x.val!=null);
    if(!visible.length)return '';
    return '<div class="rating-card"><h4>'+title+'</h4>'+visible.map(x=>'<div class="rating-line"><span>'+esc(x.label)+'</span><b>'+x.val+'</b><div class="track"><i style="width:'+clamp(+x.val||0,0,99)+'%"></i></div></div>').join('')+'</div>';
  }).join('');
}
function renderPlayerDetail(id){
  const p=playerById(id); if(!p){state.player=null;renderPlayers();return;}
  const t=team(p.team);setAccent(p.team);
  const posRank=rankOf(p,'ovr',x=>x.pos===p.pos),leagueRank=rankOf(p),teamRank=rankOf(p,'ovr',x=>x.team===p.team),vRank=valueRank(p);
  const peers=roster(p.team).filter(x=>x.pos===p.pos&&String(x.id)!==String(p.id)).sort((a,b)=>(b.ovr||0)-(a.ovr||0)).slice(0,5);
  const prev=state.previous?.players?.[String(p.id)];
  const changes=[];
  if(prev){ if(prev.ovr!==p.ovr)changes.push('OVR '+prev.ovr+' → '+p.ovr); if(prev.team!==p.team)changes.push('TEAM '+prev.team+' → '+p.team); if(prev.dev!==p.dev)changes.push('DEV '+prev.dev+' → '+p.dev); if(prev.value!==p.value)changes.push('VALUE '+fmtN(prev.value)+' → '+fmtN(p.value)); }
  const hero='<section class="detail-hero" style="--c1:'+esc(t.c1||'#162238')+';--c2:'+esc(t.c2||'#070a10')+'"><div class="detail-grid">'+
    (p.headshot?'<img class="player-silhouette" src="'+esc(p.headshot)+'" alt="" onerror="this.style.display=\'none\'">':'<div class="player-silhouette"></div>')+
    '<div><span class="eyebrow">'+esc(p.team)+' // '+esc(p.pos)+(p.jersey!=null?' // #'+p.jersey:'')+'</span><h2>'+esc(p.name)+'</h2><p>'+esc(p.archetype||'FM2 PLAYER')+' · Age '+esc(p.age??'—')+' · '+esc(p.yearsPro??'—')+' years pro · '+esc(p.college||'College unknown')+'</p><div class="hero-actions">'+devBadge(p.dev)+'<button class="btn" data-team="'+p.team+'">Open '+p.team+'</button><button class="btn primary" data-add-trade="'+esc(p.id)+'">Route to Trade Lab</button></div>'+
    '<div class="detail-metrics"><div class="metric"><span>Overall</span><b>'+esc(p.ovr??'—')+'</b></div><div class="metric"><span>Speed</span><b>'+esc(p.speed??'—')+'</b></div><div class="metric"><span>Trade value</span><b>'+fmtN(valueOf(p))+'</b></div><div class="metric"><span>Cap hit</span><b>'+fmtM(p.capHit)+'</b></div></div></div>'+
    '<div><span class="eyebrow">LEAGUE ID</span><div style="font-size:50px;font-weight:1000;margin-top:8px">#'+ordinal(leagueRank)+'</div><div class="muted" style="font-size:9px">OVR RANK</div></div></div></section>';
  const ranks='<div class="stat-strip">'+stat('League OVR',ordinal(leagueRank),(p.ovr??'—')+' OVR')+stat(p.pos+' OVR',ordinal(posRank),'position rank')+stat('Team OVR',ordinal(teamRank),p.team+' roster')+stat('Asset Rank',ordinal(vRank),fmtN(valueOf(p))+' value')+'</div>';
  const identity='<div class="profile-cards"><div class="info-card"><h4>IDENTITY</h4>'+
    [['Jersey',p.jersey!=null?'#'+p.jersey:'—'],['Height',p.height],['Weight',p.weight],['College',p.college],['Draft',p.draftRound?'R'+p.draftRound+' / Pick '+(p.draftPick??'—'):'—'],['Rookie Year',p.rookieYear]].map(x=>'<div class="kv"><span>'+esc(x[0])+'</span><b>'+esc(x[1]??'—')+'</b></div>').join('')+
    '</div><div class="info-card"><h4>CONTRACT</h4>'+
    [['Cap Hit',fmtM(p.capHit)],['Salary',fmtM(p.contractSalary)],['Bonus',fmtM(p.contractBonus)],['Length',(p.contractLength??'—')+' yrs'],['Years Left',p.yearsLeft??'—'],['Release Savings',fmtM(p.net)],['Release Penalty',fmtM(p.releasePenaltyTotal)]].map(x=>'<div class="kv"><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>').join('')+
    '</div><div class="info-card"><h4>SYSTEM STATUS</h4>'+
    [['Development',p.dev],['Archetype',p.archetype],['Scheme',p.scheme],['Skill Points',p.skillPoints],['XP',p.experiencePoints],['Legacy',p.legacyScore],['Injury',p.injuryType||p.injury||'Clear']].map(x=>'<div class="kv"><span>'+esc(x[0])+'</span><b>'+esc(x[1]??'—')+'</b></div>').join('')+'</div></div>';
  const ratings=infoWindow('SCOUTING CORE','<div class="rating-grid">'+(ratingSections(p)||'<div class="empty">Detailed ratings are not available for this record.</div>')+'</div>');
  const room=infoWindow(p.team+' '+p.pos+' ROOM','<div class="list">'+[p,...peers].map((x,i)=>rowPlayer(x,i===0?'ACTIVE':'PEER')).join('')+'</div>');
  const changesWin=infoWindow('CHANGE LOG', changes.length?'<div class="list">'+changes.map(x=>'<div class="row-card"><div class="spot-icon">Δ</div><div class="row-main"><b>'+esc(x)+'</b><span>Compared with the previous browser snapshot</span></div></div>').join('')+'</div>':'<div class="empty">No OVR, team, dev or value changes detected since your previous stored snapshot.</div>');
  $('#desktop').innerHTML='<div class="detail-shell">'+hero+ranks+identity+ratings+'<div class="grid g2">'+room+changesWin+'</div></div>';
}

function renderStandings(){
  setAccent(null);
  const divs={};
  state.db.teams.forEach(t=>{
    const d=standing(t.abbr)?.division || DIVISIONS[t.abbr]?.[1] || 'Other';
    (divs[d]||(divs[d]=[])).push(t.abbr);
  });
  const blocks=Object.entries(divs).sort().map(([d,abs])=>{
    const list=abs.map(ab=>({ab,s:standing(ab),r:record(ab)})).sort((a,b)=>(b.s?.pct??(b.r.w/(b.r.w+b.r.l||1)))-(a.s?.pct??(a.r.w/(a.r.w+a.r.l||1))));
    return '<div class="division"><h3>'+esc(d)+'</h3>'+list.map((x,i)=>'<div class="standing-row clickable" data-team="'+x.ab+'"><span class="seed">'+esc(x.s?.seed??(i+1))+'</span><div class="person">'+teamImg(x.ab)+'<div><b>'+x.ab+'</b><small>'+esc(team(x.ab).name)+'</small></div></div><b>'+x.r.w+'</b><b>'+x.r.l+'</b><span class="muted">'+(x.r.t||0)+'</span><span class="'+((x.s?.netPoints??0)>=0?'green':'red')+'">'+((x.s?.netPoints??0)>0?'+':'')+esc(x.s?.netPoints??'—')+'</span></div>').join('')+'</div>';
  }).join('');
  $('#desktop').innerHTML=infoWindow('STANDINGS OS','<div class="section-head"><div><span class="eyebrow">PLAYOFF TOPOLOGY</span><h2>League race</h2></div><p>Seed · W · L · T · Point differential</p></div><div class="standings-grid">'+blocks+'</div>');
}

function renderSchedule(){
  setAccent(null); const f=state.scheduleFilter;
  const weeks=[...new Set(state.db.games.map(g=>g.week).filter(x=>x!=null))].sort((a,b)=>a-b);
  const stages=[...new Set(state.db.games.map(g=>g.stage).filter(Boolean))];
  const filters='<div class="filters"><select id="schedTeam" class="select"><option value="ALL">All teams</option>'+state.db.teams.map(t=>'<option value="'+t.abbr+'" '+(f.team===t.abbr?'selected':'')+'>'+t.abbr+'</option>').join('')+'</select>'+
    '<select id="schedStage" class="select"><option value="ALL">All stages</option>'+stages.map(x=>'<option '+(f.stage===x?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select>'+
    '<select id="schedWeek" class="select"><option value="ALL">All weeks</option>'+weeks.map(x=>'<option value="'+x+'" '+(String(f.week)===String(x)?'selected':'')+'>Week '+x+'</option>').join('')+'</select></div>';
  const gs=state.db.games.filter(g=>(f.team==='ALL'||g.home===f.team||g.away===f.team)&&(f.stage==='ALL'||g.stage===f.stage)&&(f.week==='ALL'||String(g.week)===String(f.week))).sort((a,b)=>((a.stageIndex??0)-(b.stageIndex??0))||((a.weekIndex??0)-(b.weekIndex??0)));
  $('#desktop').innerHTML=infoWindow('SCHEDULE STREAM','<div class="section-head"><div><span class="eyebrow">LEAGUE TIMELINE</span><h2>'+fmtN(gs.length)+' games in view</h2></div></div>'+filters+'<div class="schedule-grid">'+(gs.map(gameCard).join('')||'<div class="empty">No games match these filters.</div>')+'</div>');
}

function renderContracts(){
  setAccent(null);
  const players=state.db.players.filter(p=>p.capHit!=null);
  const expensive=[...players].sort((a,b)=>(b.capHit||0)-(a.capHit||0)).slice(0,25);
  const valueDeals=[...players].filter(p=>(p.ovr||0)>=80).sort((a,b)=>((b.ovr||0)/Math.max(.25,b.capHit||.25))-((a.ovr||0)/Math.max(.25,a.capHit||.25))).slice(0,16);
  const expiring=[...players].filter(p=>+p.yearsLeft===1).sort((a,b)=>(b.ovr||0)-(a.ovr||0)).slice(0,20);
  const teams=[...state.db.teams].sort((a,b)=>(b.capAvailable??-999)-(a.capAvailable??-999)).slice(0,12);
  const capRows=expensive.map((p,i)=>'<tr class="clickable" data-player="'+esc(p.id)+'"><td>'+(i+1)+'</td><td><div class="person">'+playerImg(p)+'<div><b>'+esc(p.name)+'</b><small>'+p.team+' · '+p.pos+'</small></div></div></td><td>'+esc(p.ovr??'—')+'</td><td>'+fmtM(p.capHit)+'</td><td>'+fmtM(p.contractSalary)+'</td><td>'+fmtM(p.contractBonus)+'</td><td>'+esc(p.yearsLeft??'—')+'</td></tr>').join('');
  const capspace=infoWindow('FRANCHISE LIQUIDITY','<div class="list">'+teams.map((t,i)=>{const r=record(t.abbr);return '<div class="row-card clickable" data-team="'+t.abbr+'">'+teamImg(t.abbr)+'<div class="row-main"><b>'+(i+1)+'. '+t.abbr+' '+esc(t.name)+'</b><span>'+r.w+'-'+r.l+' · '+esc(ageProfile(t.abbr))+'</span></div><div class="row-side"><b>'+fmtM(t.capAvailable)+'</b><span>AVAILABLE</span></div></div>';}).join('')+'</div>');
  const deals=infoWindow('EFFICIENCY SIGNAL','<div class="list">'+valueDeals.map(p=>rowPlayer(p,'VALUE DEAL')).join('')+'</div>');
  const expire=infoWindow('EXPIRING SOON','<div class="list">'+expiring.slice(0,10).map(p=>rowPlayer(p,'1 YR LEFT')).join('')+'</div>');
  const table=infoWindow('CAP HIT INDEX','<div class="data-table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Player</th><th>OVR</th><th>Cap Hit</th><th>Salary</th><th>Bonus</th><th>Years</th></tr></thead><tbody>'+capRows+'</tbody></table></div>');
  $('#desktop').innerHTML='<div class="grid g3">'+capspace+deals+expire+'</div><div class="section">'+table+'</div>';
}

function playerOptions(selected){
  return '<option value="">Select player…</option>'+[...state.db.players].sort((a,b)=>(b.ovr||0)-(a.ovr||0)).map(p=>'<option value="'+esc(p.id)+'" '+(String(selected)===String(p.id)?'selected':'')+'>'+esc(p.name)+' · '+p.team+' · '+p.pos+' · '+(p.ovr??'—')+'</option>').join('');
}
function renderCompare(){
  setAccent(null);
  const a=playerById(state.compare[0]),b=playerById(state.compare[1]);
  const selectors='<div class="filters"><select id="compareA" class="select" style="flex:1">'+playerOptions(state.compare[0])+'</select><select id="compareB" class="select" style="flex:1">'+playerOptions(state.compare[1])+'</select></div>';
  if(!a||!b){$('#desktop').innerHTML=infoWindow('DUAL CORE COMPARE','<div class="section-head"><div><span class="eyebrow">PLAYER VS PLAYER</span><h2>Load two identities</h2></div></div>'+selectors+'<div class="empty">Choose two players to generate a live comparison surface.</div>');return;}
  const fields=[['OVR','ovr'],['Speed','speed'],['Age','age'],['Trade Value','_value'],['Cap Hit','_cap'],['Years Left','yearsLeft'],['Acceleration','ratings.acceleration'],['Awareness','ratings.awareness'],['Strength','ratings.strength'],['Catching','ratings.catching'],['Throw Power','ratings.throwPower'],['Tackle','ratings.tackle'],['Man Coverage','ratings.manCoverage'],['Zone Coverage','ratings.zoneCoverage']];
  const read=(p,key)=>key==='_value'?valueOf(p):key==='_cap'?fmtM(p.capHit):key.split('.').reduce((o,k)=>o?.[k],p);
  const rows=fields.filter(([,k])=>read(a,k)!=null||read(b,k)!=null).map(([label,key])=>{
    const av=read(a,key),bv=read(b,key),an=key==='_cap'?a.capHit:+av,bn=key==='_cap'?b.capHit:+bv;
    const aWin=Number.isFinite(an)&&Number.isFinite(bn)&&(key==='age'||key==='_cap'?an<bn:an>bn),bWin=Number.isFinite(an)&&Number.isFinite(bn)&&(key==='age'||key==='_cap'?bn<an:bn>an);
    return '<div class="kv"><b class="'+(aWin?'green':'')+'">'+esc(av??'—')+'</b><span>'+esc(label)+'</span><b class="'+(bWin?'green':'')+'">'+esc(bv??'—')+'</b></div>';
  }).join('');
  const head=p=>'<div style="text-align:center">'+playerImg(p,'player-head')+'<h3 style="margin:8px 0 2px">'+esc(p.name)+'</h3><span class="muted" style="font-size:9px">'+p.team+' · '+p.pos+' · '+esc(p.dev||'NORMAL')+'</span></div>';
  $('#desktop').innerHTML=infoWindow('DUAL CORE COMPARE',selectors+'<div class="grid g3" style="align-items:start;margin-top:10px"><div>'+head(a)+'</div><div class="info-card"><h4>DIFFERENTIAL</h4>'+rows+'</div><div>'+head(b)+'</div></div>');
}

function tradeAssetSelect(side,teamAb,idx,selected){
  const used=new Set((side==='L'?state.trade.L:state.trade.R).filter(Boolean).map(p=>String(p.id))); if(selected)used.delete(String(selected));
  const opts=roster(teamAb).filter(p=>!used.has(String(p.id))).sort((a,b)=>(b.ovr||0)-(a.ovr||0)).map(p=>'<option value="'+esc(p.id)+'" '+(String(selected)===String(p.id)?'selected':'')+'>'+esc(p.name)+' · '+p.pos+' · '+(p.ovr??'—')+'</option>').join('');
  return '<select class="select trade-player" data-side="'+side+'" data-idx="'+idx+'" style="width:100%"><option value="">+ Add player</option>'+opts+'</select>';
}
function tradeSide(side,ab,arr){
  const t=team(ab);
  let slots=''; for(let i=0;i<6;i++){const p=arr[i];slots+='<div class="asset-slot">'+(p?'<div class="person clickable" data-player="'+esc(p.id)+'">'+playerImg(p)+'<div><b>'+esc(p.name)+'</b><small>'+p.pos+' · '+(p.ovr??'—')+' OVR · '+fmtM(p.capHit)+'</small></div></div>':tradeAssetSelect(side,ab,i,null))+(p?'<button class="btn micro danger remove-trade" data-side="'+side+'" data-idx="'+i+'">×</button>':'')+'</div>';}
  return '<div class="trade-side"><div class="section-head"><div>'+teamImg(ab)+'<span class="eyebrow">'+esc(ab)+' SENDS</span><h2>'+esc(t.name)+'</h2></div></div><select class="select trade-team" data-side="'+side+'" style="width:100%">'+state.db.teams.map(x=>'<option value="'+x.abbr+'" '+(x.abbr===ab?'selected':'')+'>'+x.abbr+' · '+esc(x.city+' '+x.name)+'</option>').join('')+'</select><div style="margin-top:8px">'+slots+'</div></div>';
}
function incomingCap(p){ return p?.tradeInCap!=null?+p.tradeInCap:+p?.capHit||0; }
function savings(p){ return p?.net!=null?+p.net:Math.max(0,(+p?.capHit||0)-(+p?.currentPenalty||0)); }
function renderTrade(){
  const tr=state.trade; setAccent(tr.left);
  const lv=tr.L.reduce((s,p)=>s+valueOf(p),0),rv=tr.R.reduce((s,p)=>s+valueOf(p),0),total=lv+rv,diff=total?(rv-lv)/total:0,marker=50+clamp(diff*100,-46,46);
  const lt=team(tr.left),rt=team(tr.right);
  const lAfter=lt.capAvailable==null?null:+lt.capAvailable+tr.L.reduce((s,p)=>s+savings(p),0)-tr.R.reduce((s,p)=>s+incomingCap(p),0);
  const rAfter=rt.capAvailable==null?null:+rt.capAvailable+tr.R.reduce((s,p)=>s+savings(p),0)-tr.L.reduce((s,p)=>s+incomingCap(p),0);
  let verdict='Load assets on both sides to wake the evaluator.';
  if(total){const pct=Math.abs(lv-rv)/Math.max(lv,rv)*100;verdict=pct<8?'Signal lock: the asset values are extremely close.':pct<20?'Competitive value range detected.':(lv>rv?tr.left:tr.right)+' is transmitting substantially more asset value.';}
  const sum='<div class="trade-summary"><div class="section-head"><div><span class="eyebrow">VALUE SIGNAL</span><h2>'+fmtN(Math.round(lv))+' ⇄ '+fmtN(Math.round(rv))+'</h2></div></div><div class="trade-gauge"><i style="left:'+marker+'%"></i></div><p class="muted" style="font-size:10px">'+esc(verdict)+'</p><div class="profile-cards"><div class="info-card"><h4>'+tr.left+' CAP</h4><div class="kv"><span>Before</span><b>'+fmtM(lt.capAvailable)+'</b></div><div class="kv"><span>After</span><b class="'+(lAfter!=null&&lAfter<0?'red':'')+'">'+fmtM(lAfter)+'</b></div></div><div class="info-card"><h4>'+tr.right+' CAP</h4><div class="kv"><span>Before</span><b>'+fmtM(rt.capAvailable)+'</b></div><div class="kv"><span>After</span><b class="'+(rAfter!=null&&rAfter<0?'red':'')+'">'+fmtM(rAfter)+'</b></div></div><div class="info-card"><h4>PROTOCOL</h4><div class="kv"><span>Model</span><b>FM2 Value</b></div><div class="kv"><span>Cap model</span><b>Current year</b></div></div></div></div>';
  $('#desktop').innerHTML=infoWindow('TRADE LAB // SYNTHESIS','<div class="section-head"><div><span class="eyebrow">ASSET EXCHANGE ENGINE</span><h2>Build the signal</h2></div><button class="btn" id="clearTrade">Clear</button></div><div class="trade-builder">'+tradeSide('L',tr.left,tr.L)+'<div class="trade-center">⇌</div>'+tradeSide('R',tr.right,tr.R)+'</div>'+sum);
}

function terminalLine(text,type=''){
  state.terminal.push({text,type}); if(state.terminal.length>60)state.terminal.shift();
}
function runCommand(raw){
  const q=raw.trim(); if(!q)return;
  terminalLine('> '+q,'cmd');
  const parts=q.split(/\s+/),cmd=parts.shift().toLowerCase(),arg=parts.join(' ');
  if(cmd==='help') terminalLine('Commands: help · top [POS] · find [name] · team [ABBR] · cap · young · xfactor · games · clear');
  else if(cmd==='clear') state.terminal=[];
  else if(cmd==='top'){
    const pos=arg.toUpperCase(); const list=state.db.players.filter(p=>!pos||p.pos===pos).sort((a,b)=>(b.ovr||0)-(a.ovr||0)).slice(0,10);
    list.forEach((p,i)=>terminalLine((i+1)+'. '+p.name+' | '+p.team+' '+p.pos+' | '+p.ovr+' OVR | '+fmtN(valueOf(p))+' value'));
  } else if(cmd==='find'){
    const list=state.db.players.filter(p=>p.name.toLowerCase().includes(arg.toLowerCase())).slice(0,12);
    if(!list.length)terminalLine('No identity matched "'+arg+'".','error'); else list.forEach(p=>terminalLine(p.name+' | '+p.team+' '+p.pos+' | '+p.ovr+' OVR | age '+(p.age??'—')));
  } else if(cmd==='team'){
    const ab=arg.toUpperCase(); const t=state.db.teams.find(x=>x.abbr===ab); if(!t)terminalLine('Unknown franchise code.','error'); else {const r=record(ab);terminalLine(ab+' '+t.name+' | '+r.w+'-'+r.l+' | power '+teamPower(ab)+' | cap '+fmtM(t.capAvailable)+' | '+roster(ab).length+' players');}
  } else if(cmd==='cap') [...state.db.teams].sort((a,b)=>(b.capAvailable??-999)-(a.capAvailable??-999)).slice(0,10).forEach((t,i)=>terminalLine((i+1)+'. '+t.abbr+' '+fmtM(t.capAvailable)));
  else if(cmd==='young') [...state.db.players].filter(p=>(+p.age||99)<=24).sort((a,b)=>valueOf(b)-valueOf(a)).slice(0,10).forEach((p,i)=>terminalLine((i+1)+'. '+p.name+' | '+p.team+' | '+p.age+' | '+p.ovr+' OVR'));
  else if(cmd==='xfactor') state.db.players.filter(p=>p.dev==='X-FACTOR').sort((a,b)=>(b.ovr||0)-(a.ovr||0)).slice(0,20).forEach(p=>terminalLine(p.name+' | '+p.team+' '+p.pos+' | '+p.ovr+' OVR'));
  else if(cmd==='games') state.db.games.filter(g=>!g.played).slice(0,12).forEach(g=>terminalLine((g.away||'?')+' @ '+(g.home||'?')+' | '+(g.stage||'')+' '+(g.week?'W'+g.week:'')+' | '+fmtDate(g.date)));
  else terminalLine('Unknown command. Type "help".','error');
}
function renderLab(){
  setAccent(null);
  if(!state.terminal.length){terminalLine('FM2 PRIME SHELL v1.0');terminalLine('Connected to '+state.db.players.length+' player records and '+state.db.games.length+' games.');terminalLine('Type "help" to explore the league.');}
  const presets=[['top QB','Top quarterbacks'],['young','Best young assets'],['cap','Most cap space'],['xfactor','X-Factor registry'],['games','Upcoming schedule'],['find Mahomes','Search by name']];
  $('#desktop').innerHTML='<div class="command-lab">'+infoWindow('FM2 TERMINAL','<div id="terminalScreen" class="terminal-screen">'+state.terminal.map(x=>'<div class="'+(x.type==='error'?'red':x.type==='cmd'?'cyan':'')+'">'+esc(x.text)+'</div>').join('')+'</div><div class="terminal-input"><span>prime@fm2:~$</span><input id="terminalInput" autocomplete="off" autofocus placeholder="type help"></div>')+
  infoWindow('COMMAND PALETTE','<div class="lab-presets">'+presets.map(x=>'<div class="preset" data-cmd="'+esc(x[0])+'"><b>'+esc(x[0])+'</b><span>'+esc(x[1])+'</span></div>').join('')+'</div><div class="section"><span class="eyebrow">WHY THIS EXISTS</span><p class="muted" style="font-size:10px;line-height:1.7">The Lab turns the FM2 database into something you can interrogate like a system terminal. It is intentionally different from a normal sports website.</p></div>')+'</div>';
  setTimeout(()=>{const el=$('#terminalScreen');if(el)el.scrollTop=el.scrollHeight;},0);
}

function render(){
  const meta=APP_META[state.app]||APP_META.home;
  $('#spaceTitle').textContent=meta[1];
  $$('.rail-item,.dock-app').forEach(b=>b.classList.toggle('active',b.dataset.app===state.app));
  if(state.app==='home')renderHome();
  else if(state.app==='teams')renderTeams();
  else if(state.app==='players')renderPlayers();
  else if(state.app==='standings')renderStandings();
  else if(state.app==='schedule')renderSchedule();
  else if(state.app==='contracts')renderContracts();
  else if(state.app==='compare')renderCompare();
  else if(state.app==='trade')renderTrade();
  else if(state.app==='lab')renderLab();
  window.scrollTo(0,0); $('.workspace')?.scrollTo(0,0);
}
function openApp(app){
  if(!APP_META[app])return;
  state.app=app; if(app!=='teams')state.team=null;if(app!=='players')state.player=null;
  render(); history.replaceState(null,'','#'+app);
}
function openTeam(ab){state.app='teams';state.team=ab;state.player=null;render();}
function openPlayer(id){state.app='players';state.player=String(id);state.team=null;render();}

function showSpotlight(){
  $('#spotlight').classList.remove('hidden'); $('#spotlight').setAttribute('aria-hidden','false'); $('#spotlightInput').value=''; renderSpotlight(''); setTimeout(()=>$('#spotlightInput').focus(),30);
}
function hideSpotlight(){ $('#spotlight').classList.add('hidden');$('#spotlight').setAttribute('aria-hidden','true'); }
function renderSpotlight(q){
  const query=q.trim().toLowerCase(), out=[];
  Object.entries(APP_META).forEach(([id,m])=>{if(!query||m.join(' ').toLowerCase().includes(query))out.push({type:'app',id,icon:m[0],title:m[1],sub:m[2],meta:'APP'});});
  state.db.teams.forEach(t=>{if(!query||(t.abbr+' '+t.city+' '+t.name).toLowerCase().includes(query))out.push({type:'team',id:t.abbr,icon:t.abbr,title:t.city+' '+t.name,sub:(standing(t.abbr)?.division||DIVISIONS[t.abbr]?.[1]||'')+' · '+record(t.abbr).w+'-'+record(t.abbr).l,meta:'TEAM'});});
  state.db.players.forEach(p=>{if(query&&(p.name+' '+p.team+' '+p.pos+' '+(p.college||'')).toLowerCase().includes(query))out.push({type:'player',id:p.id,icon:p.ovr??'◎',title:p.name,sub:p.team+' · '+p.pos+' · '+(p.ovr??'—')+' OVR',meta:'PLAYER'});});
  $('#spotlightResults').innerHTML=(out.slice(0,18).map((x,i)=>'<div class="spot-result '+(i===0?'active':'')+'" data-spot-type="'+x.type+'" data-spot-id="'+esc(x.id)+'"><div class="spot-icon">'+esc(x.icon)+'</div><div class="spot-copy"><b>'+esc(x.title)+'</b><span>'+esc(x.sub)+'</span></div><div class="spot-meta">'+x.meta+'</div></div>').join('')||'<div class="empty">No FM2 object matched that query.</div>');
}
function showMission(){
  $('#missionControl').classList.remove('hidden');
  $('#missionApps').innerHTML=Object.entries(APP_META).map(([id,m])=>'<div class="mission-app" data-app="'+id+'"><div class="mi-icon">'+esc(m[0])+'</div><b>'+esc(m[1])+'</b><span>'+esc(m[2])+'</span></div>').join('');
}
function hideMission(){$('#missionControl').classList.add('hidden');}
function toggleControl(){$('#controlCenter').classList.toggle('hidden');}

function bind(){
  document.addEventListener('click',e=>{
    const app=e.target.closest('[data-app]'); if(app){openApp(app.dataset.app);hideMission();return;}
    const t=e.target.closest('[data-team]'); if(t){openTeam(t.dataset.team);return;}
    const p=e.target.closest('[data-player]'); if(p){openPlayer(p.dataset.player);return;}
    if(e.target.closest('[data-back-teams]')){state.team=null;state.app='teams';render();return;}
    const tradeTeam=e.target.closest('[data-team-trade]'); if(tradeTeam){state.trade.left=tradeTeam.dataset.team;if(state.trade.right===state.trade.left)state.trade.right=state.db.teams.find(x=>x.abbr!==state.trade.left)?.abbr||'CHI';state.app='trade';render();return;}
    const add=e.target.closest('[data-add-trade]'); if(add){const p=playerById(add.dataset.addTrade);if(p){state.trade.left=p.team;state.trade.L=[p];if(state.trade.right===p.team)state.trade.right=state.db.teams.find(x=>x.abbr!==p.team)?.abbr||'CHI';state.app='trade';render();toast('Routed to Trade Lab',p.name+' loaded on '+p.team+' side.');}return;}
    if(e.target.closest('#spotlightBtn')){showSpotlight();return;}
    if(e.target.closest('#controlBtn')){toggleControl();return;}
    if(e.target.closest('#missionBtn')){showMission();return;}
    if(e.target.closest('#refreshBtn')){load(true);return;}
    if(e.target.closest('#clearTrade')){state.trade.L=[];state.trade.R=[];renderTrade();return;}
    const close=e.target.closest('[data-close]'); if(close){if(close.dataset.close==='spotlight')hideSpotlight();if(close.dataset.close==='mission')hideMission();if(close.dataset.close==='control')$('#controlCenter').classList.add('hidden');return;}
    const rm=e.target.closest('.remove-trade'); if(rm){const arr=rm.dataset.side==='L'?state.trade.L:state.trade.R;arr.splice(+rm.dataset.idx,1);renderTrade();return;}
    const cmd=e.target.closest('[data-cmd]'); if(cmd){runCommand(cmd.dataset.cmd);renderLab();return;}
  });
  document.addEventListener('change',e=>{
    if(e.target.matches('#playerTeam')){state.playerFilter.team=e.target.value;renderPlayers();}
    if(e.target.matches('#playerPos')){state.playerFilter.pos=e.target.value;renderPlayers();}
    if(e.target.matches('#playerDev')){state.playerFilter.dev=e.target.value;renderPlayers();}
    if(e.target.matches('#playerSort')){state.playerFilter.sort=e.target.value;renderPlayers();}
    if(e.target.matches('#schedTeam')){state.scheduleFilter.team=e.target.value;renderSchedule();}
    if(e.target.matches('#schedStage')){state.scheduleFilter.stage=e.target.value;renderSchedule();}
    if(e.target.matches('#schedWeek')){state.scheduleFilter.week=e.target.value;renderSchedule();}
    if(e.target.matches('#compareA')){state.compare[0]=e.target.value||null;renderCompare();}
    if(e.target.matches('#compareB')){state.compare[1]=e.target.value||null;renderCompare();}
    if(e.target.matches('.trade-team')){const side=e.target.dataset.side;if(side==='L'){state.trade.left=e.target.value;state.trade.L=[];if(state.trade.right===state.trade.left)state.trade.right=state.db.teams.find(x=>x.abbr!==state.trade.left)?.abbr||'CHI';}else{state.trade.right=e.target.value;state.trade.R=[];if(state.trade.left===state.trade.right)state.trade.left=state.db.teams.find(x=>x.abbr!==state.trade.right)?.abbr||'ARI';}renderTrade();}
    if(e.target.matches('.trade-player')){const p=playerById(e.target.value);if(!p)return;const arr=e.target.dataset.side==='L'?state.trade.L:state.trade.R;arr[+e.target.dataset.idx]=p;renderTrade();}
  });
  document.addEventListener('input',e=>{
    if(e.target.matches('#playerQ')){state.playerFilter.q=e.target.value;clearTimeout(window.__pf);window.__pf=setTimeout(renderPlayers,120);}
    if(e.target.matches('#spotlightInput'))renderSpotlight(e.target.value);
  });
  document.addEventListener('keydown',e=>{
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showSpotlight();}
    if(e.key==='Escape'){hideSpotlight();hideMission();$('#controlCenter').classList.add('hidden');}
    if(e.target.matches('#terminalInput')&&e.key==='Enter'){runCommand(e.target.value);renderLab();setTimeout(()=>$('#terminalInput')?.focus(),20);}
    if(e.target.matches('#spotlightInput')&&e.key==='Enter'){const first=$('.spot-result');if(first)first.click();}
  });
  $('#spotlightResults').addEventListener('click',e=>{const r=e.target.closest('.spot-result');if(!r)return;hideSpotlight();if(r.dataset.spotType==='app')openApp(r.dataset.spotId);else if(r.dataset.spotType==='team')openTeam(r.dataset.spotId);else openPlayer(r.dataset.spotId);});
  $('#motionToggle').onclick=()=>{state.motion=!state.motion;document.body.classList.toggle('no-motion',!state.motion);$('#motionToggle').classList.toggle('active',state.motion);};
  $('#compactToggle').onclick=()=>{state.compact=!state.compact;document.body.classList.toggle('compact',state.compact);$('#compactToggle').classList.toggle('active',state.compact);};
  $('#focusToggle').onclick=()=>{state.focus=!state.focus;document.body.classList.toggle('focus-mode',state.focus);$('#focusToggle').classList.toggle('active',state.focus);};
  $('#randomTeamBtn').onclick=()=>{const t=state.db.teams[Math.floor(Math.random()*state.db.teams.length)];if(t){$('#controlCenter').classList.add('hidden');openTeam(t.abbr);}};
}
function saveSnapshot(){
  try{
    const snap={at:new Date().toISOString(),players:{}};
    state.db.players.forEach(p=>snap.players[String(p.id)]={ovr:p.ovr,team:p.team,dev:p.dev,value:p.value});
    localStorage.setItem('fm2-prime-snapshot',JSON.stringify(snap));
  }catch{}
}
function readSnapshot(){
  try{return JSON.parse(localStorage.getItem('fm2-prime-snapshot')||'null');}catch{return null;}
}
function updateKernel(){
  const m=state.db.meta||{};
  $('#kernelStatus').textContent='ONLINE';
  $('#kernelPlayers').textContent=fmtN(state.db.players.length);
  $('#kernelGames').textContent=fmtN(state.db.games.length);
  $('#kernelSync').textContent=m.lastSync?new Date(m.lastSync).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'—';
  $('#syncStatus').textContent='LIVE · '+state.db.players.length;
  $('#seasonLabel').textContent=(m.season||'2026')+' '+(m.stage||'')+' '+(m.week||'')+' · PRIME OS';
}
async function load(manual=false){
  try{
    if(manual){$('#syncStatus').textContent='SYNCING';toast('FM2 Sync','Refreshing deployed NeonSportz snapshot…');}
    const r=await fetch('./data/fm2-data.json?ts='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const db=await r.json();
    if(!Array.isArray(db.players)||db.players.length<20)throw new Error('Player snapshot is empty');
    state.db={meta:db.meta||{},teams:db.teams||[],players:db.players||[],games:db.games||[],standings:db.standings||[]};
    state.previous=readSnapshot();
    if(!state.db.teams.find(t=>t.abbr===state.trade.left))state.trade.left=state.db.teams[0]?.abbr||'ARI';
    if(!state.db.teams.find(t=>t.abbr===state.trade.right)||state.trade.right===state.trade.left)state.trade.right=state.db.teams.find(t=>t.abbr!==state.trade.left)?.abbr||'CHI';
    updateKernel(); render(); setTimeout(saveSnapshot,1000);
    if(manual)toast('Sync complete',state.db.players.length+' players · '+state.db.games.length+' games loaded.');
  }catch(err){
    $('#syncStatus').textContent='DATA ERROR';$('#kernelStatus').textContent='OFFLINE';
    $('#desktop').innerHTML='<div class="empty"><b>Prime OS could not mount the FM2 data kernel.</b><br><br>'+esc(err.message)+'</div>';
    toast('Data kernel error',err.message);
  }
}
function boot(){
  const msgs=['Mounting FM2 data volume…','Linking 32 franchise nodes…','Calibrating player matrix…','Starting PRIME OS…'];
  let i=0; const iv=setInterval(()=>{$('#bootText').textContent=msgs[Math.min(++i,msgs.length-1)];},420);
  setTimeout(()=>{clearInterval(iv);$('#boot').classList.add('done');$('#os').classList.remove('is-loading');},1850);
}
function clock(){
  const d=new Date();$('#clock').textContent=d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
}
bind(); clock(); setInterval(clock,15000);
const hash=location.hash.replace('#',''); if(APP_META[hash])state.app=hash;
boot(); load(false);
})();