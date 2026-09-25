import { mkdir, writeFile } from 'node:fs/promises';

const API = 'https://neonsportz.com/api/leagues/FM2';
const PAGE_SIZE = 100;
const OUT = new URL('../data/fm2-data.json', import.meta.url);

const TEAM_META = [
  ['ARI','Arizona','Cardinals','#97233F','#4b1020','ari'],['ATL','Atlanta','Falcons','#A71930','#111111','atl'],['BAL','Baltimore','Ravens','#241773','#111111','bal'],['BUF','Buffalo','Bills','#00338D','#C60C30','buf'],
  ['CAR','Carolina','Panthers','#0085CA','#101820','car'],['CHI','Chicago','Bears','#0B162A','#C83803','chi'],['CIN','Cincinnati','Bengals','#FB4F14','#111111','cin'],['CLE','Cleveland','Browns','#311D00','#FF3C00','cle'],
  ['DAL','Dallas','Cowboys','#041E42','#869397','dal'],['DEN','Denver','Broncos','#FB4F14','#002244','den'],['DET','Detroit','Lions','#0076B6','#B0B7BC','det'],['GB','Green Bay','Packers','#203731','#FFB612','gb'],
  ['HOU','Houston','Texans','#03202F','#A71930','hou'],['IND','Indianapolis','Colts','#002C5F','#A2AAAD','ind'],['JAX','Jacksonville','Jaguars','#006778','#101820','jax'],['KC','Kansas City','Chiefs','#E31837','#FFB81C','kc'],
  ['LV','Las Vegas','Raiders','#000000','#A5ACAF','lv'],['LAC','Los Angeles','Chargers','#0080C6','#FFC20E','lac'],['LAR','Los Angeles','Rams','#003594','#FFA300','lar'],['MIA','Miami','Dolphins','#008E97','#FC4C02','mia'],
  ['MIN','Minnesota','Vikings','#4F2683','#FFC62F','min'],['NE','New England','Patriots','#002244','#C60C30','ne'],['NO','New Orleans','Saints','#D3BC8D','#101820','no'],['NYG','New York','Giants','#0B2265','#A71930','nyg'],
  ['NYJ','New York','Jets','#125740','#101820','nyj'],['PHI','Philadelphia','Eagles','#004C54','#A5ACAF','phi'],['PIT','Pittsburgh','Steelers','#101820','#FFB612','pit'],['SEA','Seattle','Seahawks','#002244','#69BE28','sea'],
  ['SF','San Francisco','49ers','#AA0000','#B3995D','sf'],['TB','Tampa Bay','Buccaneers','#D50A0A','#34302B','tb'],['TEN','Tennessee','Titans','#0C2340','#4B92DB','ten'],['WAS','Washington','Commanders','#5A1414','#FFB612','wsh']
].map(([abbr,city,name,c1,c2,espn])=>({abbr,city,name,c1,c2,espn,logo:`https://a.espncdn.com/i/teamlogos/nfl/500/${espn}.png`}));

const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');
function getField(row,aliases){
  if(!row||typeof row!=='object') return null;
  const map={}; for(const k of Object.keys(row)) map[norm(k)]=row[k];
  for(const a of aliases){const v=map[norm(a)]; if(v!==undefined&&v!==null&&v!=='') return v;}
  return null;
}
function canonicalTeam(raw){
  if(raw==null||raw==='') return null;
  if(typeof raw==='object'){
    const nested=getField(raw,['abbrName','abbr','abbreviation','teamAbbr','team_abbrev','nickName','teamName','displayName','name']);
    return nested==null?null:canonicalTeam(nested);
  }
  const s=String(raw).trim().toUpperCase();
  const aliases={ARZ:'ARI',AZ:'ARI',KAN:'KC',KCC:'KC',LVR:'LV',OAK:'LV',SD:'LAC',STL:'LAR',WSH:'WAS',WFT:'WAS'};
  if(TEAM_META.some(t=>t.abbr===s)) return s;
  if(aliases[s]) return aliases[s];
  const n=norm(raw);
  return TEAM_META.find(t=>norm(`${t.city}${t.name}`)===n||norm(t.name)===n||norm(`${t.city} ${t.name}`)===n||norm(t.city)===n)?.abbr||null;
}
function num(v){
  if(v==null||v==='') return null;
  const n=Number(String(v).replace(/[$,%\s,]/g,''));
  return Number.isFinite(n)?n:null;
}
function moneyM(v){
  if(v==null||v==='') return null;
  if(typeof v==='string'){
    const raw=v.trim().replace(/[$,\s]/g,'');
    const m=raw.match(/^(-?[\d.]+)([KMB])?$/i); if(!m) return null;
    let n=Number(m[1]); if(!Number.isFinite(n)) return null;
    const u=m[2]?.toUpperCase(); if(u==='B') return n*1000; if(u==='M') return n; if(u==='K') return n/1000;
    return Math.abs(n)>10000?n/1_000_000:n;
  }
  const n=Number(v); if(!Number.isFinite(n)) return null;
  return Math.abs(n)>10000?n/1_000_000:n;
}
function bool(v){return v===true||v===1||String(v).toLowerCase()==='true'||String(v)==='1';}
function devLabel(raw){
  if(raw==null||raw==='') return 'NORMAL';
  const n=Number(raw); if(Number.isFinite(n)&&String(raw).trim()!=='') return ({0:'NORMAL',1:'STAR',2:'SUPERSTAR',3:'X-FACTOR'}[n]||String(raw));
  const s=String(raw).trim().toUpperCase().replace(/_/g,'-'); return s==='XFACTOR'?'X-FACTOR':(s||'NORMAL');
}
function extractPage(payload){
  if(Array.isArray(payload)) return {items:payload,count:payload.length,next:null};
  if(!payload||typeof payload!=='object') return {items:[],count:0,next:null};
  let items=[]; for(const k of ['results','data','items','players','teams']) if(Array.isArray(payload[k])){items=payload[k];break;}
  return {items,count:num(payload.count??payload.total??payload.totalCount??payload.total_count),next:payload.next??payload.links?.next??payload.nextPage??payload.next_page??null};
}
function identity(r){return String(getField(r,['id','playerId','player_id','rosterId','roster_id','teamId','team_id'])??JSON.stringify(r).slice(0,120));}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchJson(url,retries=5){
  const res=await fetch(url,{headers:{Accept:'application/json','User-Agent':'fm2-trade-lab-github-action'},redirect:'follow'});
  if(res.status===429&&retries>0){
    const sec=Math.max(1,Math.min(90,Number(res.headers.get('retry-after'))||5));
    console.log(`Rate limited; retrying in ${sec}s`); await wait(sec*1000); return fetchJson(url,retries-1);
  }
  if(!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}
async function fetchAll(endpoint,label){
  const out=[],seen=new Set();
  for(let page=1;page<=50;page++){
    const join=endpoint.includes('?')?'&':'?';
    const url=`${API}${endpoint}${join}size=${PAGE_SIZE}&page=${page}`;
    console.log(`Fetching ${label} page ${page}`);
    const payload=await fetchJson(url);
    const {items,count,next}=extractPage(payload);
    if(!items.length) break;
    const first=identity(items[0]); if(page>1&&seen.has(first)) throw new Error(`${label} pagination did not advance`);
    seen.add(first); out.push(...items);
    if(count!=null&&count>0&&out.length>=count) break;
    if(items.length<PAGE_SIZE||next===false||next==='') break;
  }
  return out;
}
function mapTeam(r){
  let abbr=canonicalTeam(getField(r,['abbrName','abbr','abbreviation','teamAbbr','team_abbrev']));
  if(!abbr) abbr=canonicalTeam(getField(r,['nickName','teamName','displayName','name']));
  if(!abbr) return null;
  const base=TEAM_META.find(t=>t.abbr===abbr)||{abbr,city:'',name:abbr,c1:'#333',c2:'#111',espn:'',logo:''};
  const logoId=getField(r,['logoId','logo_id']);
  const capRoom=moneyM(getField(r,['capRoom','salaryCap','capLimit','salaryCapLimit']));
  const capSpent=moneyM(getField(r,['capSpent','salarySpent','totalCapSpent']));
  let capAvailable=moneyM(getField(r,['capAvailable','capSpace','availableCap','salaryCapSpace']));
  if(capAvailable==null&&capRoom!=null&&capSpent!=null) capAvailable=capRoom-capSpent;
  return {...base,id:String(getField(r,['teamId','team_id','id'])??abbr),logo:logoId!=null&&String(logoId)!==''?`https://cdn.neonsportz.com/teamlogos/256/${encodeURIComponent(logoId)}.png`:base.logo,logoId,
    capRoom,capSpent,capAvailable,rosterCount:num(getField(r,['rosterCount','rosterSize','playerCount','players'])),overall:num(getField(r,['teamOvr','overall','ovr'])),rank:num(getField(r,['rank','teamRank'])),needs:[],
    calendarYear:num(getField(r,['calendarYear','seasonYear','year'])),seasonIndex:num(getField(r,['seasonIndex'])),weekIndex:num(getField(r,['weekIndex'])),stageIndex:num(getField(r,['stageIndex']))};
}
function resolvePlayerTeam(r,map){
  let abbr=canonicalTeam(getField(r,['team_abbrev','teamAbbr','abbrName','teamAbbreviation','team']));
  if(!abbr&&typeof r.team==='object') abbr=canonicalTeam(r.team);
  if(abbr) return abbr;
  const id=getField(r,['teamId','team_id']); if(id!=null&&map.has(String(id))) return map.get(String(id));
  const nid=r.team&&typeof r.team==='object'?getField(r.team,['teamId','id']):null; if(nid!=null&&map.has(String(nid))) return map.get(String(nid));
  return null;
}
function mapPlayer(r,i,teamIdMap){
  const name=getField(r,['fullName','playerName','cleanName','name'])||[getField(r,['firstName']),getField(r,['lastName'])].filter(Boolean).join(' ');
  const team=resolvePlayerTeam(r,teamIdMap); if(!name||!team) return null;
  const id=getField(r,['id','playerId','player_id','rosterId','roster_id'])||`${team}-${norm(name)}-${i}`;
  const pageId=getField(r,['rosterId','roster_id','id','playerId','player_id'])||id;
  const capHit=moneyM(getField(r,['capHit','cap_hit']));
  const net=moneyM(getField(r,['capReleaseNetSavings','netSavings','capSavings','releaseNetSavings']));
  const releasePenaltyTotal=moneyM(getField(r,['capReleasePenalty','releasePenalty','totalReleasePenalty']));
  const contractBonus=moneyM(getField(r,['contractBonus','signingBonus','bonus']));
  const contractSalary=moneyM(getField(r,['contractSalary','salary','totalSalary']));
  const contractLength=num(getField(r,['contractLength','length']));
  const yearsLeft=num(getField(r,['contractYearsLeft','yearsLeft','yrsLeft']));
  const portraitId=getField(r,['portraitId','portrait_id']);
  const currentPenalty=net!=null&&capHit!=null?Math.max(0,capHit-net):Math.min(releasePenaltyTotal||0,capHit||0);
  const len=Math.max(1,contractLength||yearsLeft||1); const tradeInCap=Math.max(0,(capHit||0)-((contractBonus||0)/Math.min(len,5)));
  return {id:String(id),pageId:String(pageId),team,name:String(name).trim(),pos:String(getField(r,['position','pos'])||'').toUpperCase(),dev:devLabel(getField(r,['devTrait','dev','developmentTrait','development'])),
    ovr:num(getField(r,['playerBestOvr','overall','ovr','playerSchemeOvr'])),age:num(getField(r,['age'])),height:getField(r,['height']),weight:num(getField(r,['weight'])),jersey:num(getField(r,['jerseyNum','jerseyNumber'])),
    college:getField(r,['college']),draftRound:num(getField(r,['draftRound'])),draftPick:num(getField(r,['draftPick'])),yearsPro:num(getField(r,['yearsPro'])),rookieYear:num(getField(r,['rookieYear'])),
    capHit,net,releasePenaltyTotal,currentPenalty,contractBonus,contractSalary,contractLength,yearsLeft,tradeInCap,value:num(getField(r,['trade_value','tradeValue','value','tradeVal'])),speed:num(getField(r,['speedRating','speed','spd'])),
    tradeBlock:bool(getField(r,['trade_block','tradeBlock','onTradeBlock'])),cantTrade:bool(getField(r,['cant_trade','cantTrade','cannotTrade'])),portraitId,
    headshot:portraitId!=null&&String(portraitId)!==''?`https://ratings-images-prod.pulse.ea.com/madden-nfl-27/portraits/${encodeURIComponent(portraitId)}.png`:null,source:'github-auto-sync'};
}
function deriveMeta(rawTeams){
  const r=rawTeams[0]||{}; const year=num(getField(r,['calendarYear','seasonYear','year'])); const stageIndex=num(getField(r,['stageIndex'])); const weekIndex=num(getField(r,['weekIndex']));
  const stage=stageIndex===0?'Preseason':stageIndex===1?'Regular Season':stageIndex===2?'Post Season':stageIndex===3?'Offseason':'';
  let week=''; if((stageIndex===0||stageIndex===1)&&weekIndex!=null) week=`Week ${weekIndex+1}`; if(stageIndex===2&&weekIndex!=null) week=['Wild Card','Divisional','Conference','Super Bowl'][weekIndex]||`Playoffs ${weekIndex+1}`;
  return {league:'FM2',season:year&&year>2000?year:2026,stage,week,mode:'snapshot',lastSync:new Date().toISOString(),source:'GitHub Actions + NeonSportz public API',apiBase:API};
}

const rawTeams=await fetchAll('/teams/','teams');
if(rawTeams.length<2) throw new Error(`Expected teams, received ${rawTeams.length}`);
const mappedTeams=rawTeams.map(mapTeam).filter(Boolean);
const teamIdMap=new Map();
for(let i=0;i<rawTeams.length;i++){
  const mt=mappedTeams.find(t=>t.abbr===canonicalTeam(getField(rawTeams[i],['abbrName','abbr','abbreviation','teamAbbr','team_abbrev','nickName','teamName','displayName','name'])));
  if(!mt) continue;
  for(const k of ['teamId','team_id','id']){const v=getField(rawTeams[i],[k]); if(v!=null) teamIdMap.set(String(v),mt.abbr);}
}
for(const t of mappedTeams){teamIdMap.set(String(t.id),t.abbr); if(t.logoId!=null) teamIdMap.set(String(t.logoId),t.abbr);}
const rawPlayers=await fetchAll('/players/','players');
if(rawPlayers.length<20) throw new Error(`Expected a full roster, received ${rawPlayers.length} players`);
const players=rawPlayers.map((r,i)=>mapPlayer(r,i,teamIdMap)).filter(Boolean);
if(players.length<20) throw new Error(`Only ${players.length} players could be mapped to teams`);

const teamMap=new Map(TEAM_META.map(t=>[t.abbr,{...t,capAvailable:null,capRoom:null,capSpent:null,rosterCount:0,needs:[]} ]));
for(const t of mappedTeams) teamMap.set(t.abbr,{...teamMap.get(t.abbr),...t});
for(const t of teamMap.values()){
  const count=players.filter(p=>p.team===t.abbr).length;
  if(count||t.rosterCount==null) t.rosterCount=count;
}

const data={meta:deriveMeta(rawTeams),teams:[...teamMap.values()],players};
await mkdir(new URL('../data/',import.meta.url),{recursive:true});
await writeFile(OUT,JSON.stringify(data),{encoding:'utf8'});
console.log(`Wrote ${players.length} players and ${data.teams.length} teams to data/fm2-data.json`);
