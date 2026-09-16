import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageData } from '../public/page-data.js';
import { apiCostOfCalls, mergeApiPricing } from '../public/api-pricing.js';
import { codexCreditsOfCalls } from '../public/usage-pricing.js';
import { conversationTitle } from '../public/conversation-title.js';

test('untitled archived sessions show and search by the legacy identifier in every view', () => {
  const session = {id:'node:archived',sourceSessionId:'archived',title:'Conversation sans titre',calls:[{timestamp:'2026-09-15T12:00:00Z',model:'gpt-test',usage:{inputTokens:1,totalTokens:1}}]};
  const expected = conversationTitle(session);
  for (const view of ['overview','conversations','detail','pricing']) {
    const builder = createPageData({}, {view,search:expected,start:'2026-09-15',end:'2026-09-16'});
    builder.add(session);
    const result = builder.finish();
    assert.equal(result.sessions[0].title, expected);
  }
  assert.equal(session.title, 'Conversation sans titre');
});

const calls = Array.from({length:80},(_,i)=>({timestamp:`2026-09-15T${String(i%24).padStart(2,'0')}:00:00.000Z`,model:i%2?'gpt-6-astra':'gpt-5.6-sol',serviceTier:i%3?'default':'priority',effort:'high',usage:{inputTokens:500000+i,cachedInputTokens:400000,outputTokens:1000,totalTokens:501000+i}}));
const sessions = calls.map((call,i)=>({id:`s${i}`,title:`Conversation ${i}`,cwd:`/project${i%4}`,projectName:`Project ${i%4}`,models:[call.model],nodeId:'a',nodeAlias:'A',startedAt:call.timestamp,calls:[call,{...call,timestamp:'2025-01-01T00:00:00Z'}],turns:[{startedAt:call.timestamp,model:call.model,durationMs:1200}]}));
function build(q) { const b=createPageData({sessions,generatedAt:'now'}, {start:'2026-09-15',end:'2026-09-16',...q});sessions.forEach(s=>b.add(s));return b.finish(); }
test('overview summaries match full accounting, including fast and long-context pricing',()=>{
  for(const pricing of [mergeApiPricing(),mergeApiPricing({schemaVersion:2,mode:'custom'})]) {
    const d=build({view:'overview',pricing,buckets:[{start:'2026-09-15',end:'2026-09-16'}]});
    assert.equal(d.sessions.length,6); assert.equal(d.pageData.matched,80);
    assert.equal(d.pageData.totals.count,80); assert.equal(d.pageData.projectCount,4);
    assert.ok(Math.abs(d.pageData.totals.cost.cost-apiCostOfCalls(calls,pricing).cost)<1e-9);
    assert.ok(Math.abs(d.pageData.totals.credits.credits-codexCreditsOfCalls(calls).credits)<1e-9);
    assert.equal(d.pageData.buckets[0].summary.count,80);
    assert.ok(d.sessions.every(s=>s.calls.length===0 && s.turns.length===0));
  }
});
test('conversations filter and sort globally before pagination; details are scoped',()=>{
  const q={view:'conversations',pageSize:7,sortKey:'tokens',sortDirection:'desc'};
  const a=build(q), b=build({...q,page:2});
  assert.equal(a.pageData.total,80);assert.equal(a.sessions.length,7);
  assert.equal(a.sessions[0].id,'s79');assert.equal(b.sessions[0].id,'s72');
  assert.equal(build({...q,page:999}).pageData.page,12);
  assert.equal(build({...q,model:'gpt-6-astra',folders:['/project1']}).pageData.total,20);
  assert.equal(build({...q,search:'Conversation 79'}).pageData.total,1);
  const detail=build({view:'detail',id:'s79'});
  assert.equal(detail.sessions.length,1);assert.equal(detail.sessions[0].calls.length,1);assert.equal(detail.sessions[0].turns.length,1);
  assert.equal(build({view:'detail',id:'s79',node:'other'}).sessions.length,0);
});
test('settings return no sessions; project details and pricing load explicitly',()=>{
  const settings=build({view:'settings'});assert.deepEqual(settings.sessions,[]);assert.deepEqual(settings.weeklyQuotaHistory,[]);
  const projects=build({view:'projects',project:'name:project 1'});
  assert.deepEqual(projects.sessions,[]);
  assert.equal(projects.pageData.projects.find(p=>p.key==='name:project 1').sessions.length,6);
  assert.ok(projects.pageData.projects.filter(p=>p.key!=='name:project 1').every(p=>!p.sessions.length));
  const report=build({view:'pricing'});assert.equal(report.sessions.flatMap(s=>s.calls).length,80);
});


test('custom groups combine accounting, models and paths and can be reverted', () => {
  const projectGroups = [{id:'combined',name:'Combined',members:['name:project 0','name:project 1']}];
  const original = build({view:'projects'}).pageData;
  const grouped = build({view:'projects',projectGroups,project:'group:combined'}).pageData;
  assert.equal(grouped.projectCount,3);
  const stable = value => JSON.parse(JSON.stringify(value, (key, value) => key === "asOf" ? undefined : value));
  assert.deepEqual(stable(grouped.totals),stable(original.totals));
  const group = grouped.projects.find(p=>p.key==='group:combined');
  assert.equal(group.sessionCount,40);
  assert.deepEqual(group.paths.sort(),['/project0','/project1']);
  assert.equal(group.summary.count,40);
  assert.equal(group.models.length,2);
  assert.equal(group.sessions.length,6);
  assert.equal(build({view:'conversations',projectGroups,folders:group.paths}).pageData.total,40);
  assert.ok(build({view:'conversations',projectGroups,folders:group.paths}).sessions.every(s=>s.tableProject==='Combined'));
  assert.deepEqual(stable(build({view:'projects',projectGroups:[]}).pageData),stable(original));
});

test('rejects overlapping or malformed custom groups', () => {
  const group = {id:'one',name:'Combined',members:['name:project 0','name:project 1']};
  assert.throws(()=>build({view:'projects',projectGroups:[group,{...group,id:'two'}]}));
  assert.throws(()=>build({view:'projects',projectGroups:[{...group,name:' '}]}));
  assert.throws(()=>build({view:'projects',projectGroups:[{...group,members:['name:project 0']}]}));
});


test('group editor catalogue ignores call history, dates and grouping preferences', () => {
  const b = createPageData({}, {view:'project-groups',start:'2099-01-01',projectGroups:[{id:'g',name:'Group',members:['name:a','name:b']}]});
  b.add({projectName:'A',get calls() {throw new Error('Must not inspect history');}});
  b.add({projectName:'B'});
  b.add({projectName:'A'});
  const result = b.finish();
  assert.equal(result.pageData.view,'project-groups');
  assert.deepEqual(result.pageData.projectCatalog.map(p=>p.key),['name:a','name:b']);
  assert.deepEqual(result.sessions,[]);
});
