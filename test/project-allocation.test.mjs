import assert from "node:assert/strict";
import test from "node:test";
import { createPageData } from "../public/page-data.js";
import { normalizeSubscriptionAmounts, subscriptionPlan, weeklySubscriptionAmount, weeklyAllocationWindow, projectWeeklyAllocation } from "../public/project-allocation.js";

const now = new Date("2026-10-11T12:00:00Z");
const quota = { startsAt:"2026-10-08T12:00:00Z", resetsAt:"2026-10-15T12:00:00Z", observedAt:now.toISOString(), usedPercent:10, planType:"pro", windowMinutes:10080 };
const call = (count, timestamp = "2026-10-10T12:00:00Z", model = "gpt-6.1-sol") => ({timestamp, model, usage:{inputTokens:count*10000, cachedInputTokens:0, outputTokens:0, totalTokens:count*10000}});
const fixtures = [
  {id:"a",projectName:"Alpha",calls:[call(6),call(40,"2026-10-01T12:00:00Z")]},
  {id:"b",projectName:"Beta",calls:[call(4)]},
];
function build(sessions = fixtures, query = {}, metadata = {weeklyQuota:quota}) {
  const builder = createPageData(metadata, {view:"projects", ...query}, now);
  for (const session of sessions) { builder.add(session); builder.addWeekly(session); }
  return builder.finish().pageData;
}
const near = (actual, expected) => assert.ok(Math.abs(actual-expected)<1e-9, `${actual} != ${expected}`);

test("60/40 of 10% weekly allocates 6/4% and $3.09/$2.06 from a $223 monthly subscription", () => {
  const data = build(fixtures, {start:quota.startsAt});
  const allocation = data.weeklyAllocation;
  for (const [key, percent, cost, rounded] of [["name:alpha",6,13.38*12/52,3.09],["name:beta",4,8.92*12/52,2.06]]) {
    const result = projectWeeklyAllocation(allocation,key,normalizeSubscriptionAmounts(null),now);
    near(result.weeklyPercent,percent); near(result.subscriptionCost,cost);
    assert.equal(Number(result.subscriptionCost.toFixed(2)),rounded);
    const group = data.projects.find(p=>p.key===key);
    near(group.cost.cost / data.totals.cost.cost * quota.usedPercent,percent);
  }
});

test("weekly weights ignore the page period, filters and top-five truncation", () => {
  const all = build();
  const current = build(fixtures, {start:quota.startsAt,node:"other",model:"other",search:"Beta"});
  assert.deepEqual(all.weeklyAllocation,current.weeklyAllocation);
  const today = build(fixtures, {start:"2026-10-11T00:00:00Z"});
  assert.equal(today.projects.length,0);
  assert.deepEqual(today.weeklyAllocation,current.weeklyAllocation);
  const sessions = Array.from({length:8},(_,i)=>({id:String(i),projectName:`Project ${i}`,calls:[call(1)]}));
  const overview = build(sessions, {view:"overview"});
  assert.equal(overview.projects.length,5);
  near(projectWeeklyAllocation(overview.weeklyAllocation,overview.projects[0].key,{pro:223},now).weeklyPercent,1.25);
});

test("grouped projects, cross-machine sessions and SQL aggregates keep full allocation", () => {
  const projectGroups = [{id:"combined",name:"Combined",members:["name:alpha","name:beta"]}];
  const grouped = build(fixtures,{projectGroups}).weeklyAllocation;
  near(projectWeeklyAllocation(grouped,"group:combined",{pro:223},now).weeklyPercent,10);
  const raw = Array.from({length:10},(_,i)=>({id:String(i),nodeId:i%2?"a":"b",projectName:i<6?"Alpha":"Beta",calls:[call(1)]}));
  const aggregated = fixtures.map((s,i)=>({...s,calls:[{...call(1),_count:i===0?6:4,_totals:call(i===0?6:4).usage}]}));
  const rawAllocation = build(raw).weeklyAllocation, aggregateAllocation = build(aggregated).weeklyAllocation;
  near(rawAllocation.totalCost,aggregateAllocation.totalCost);
  for (const key of Object.keys(rawAllocation.projects)) near(rawAllocation.projects[key],aggregateAllocation.projects[key]);
  assert.equal(rawAllocation.unratedCalls,aggregateAllocation.unratedCalls);
});

test("missing, expired, theoretical, unrated and empty consumption never invent allocations", () => {
  for (const weeklyQuota of [null,{...quota,usedPercent:null},{...quota,theoretical:true},{...quota,resetsAt:"2026-10-09T00:00:00Z"}]) {
    assert.equal(weeklyAllocationWindow({weeklyQuota},now),null);
    assert.equal(build(fixtures,{}, {weeklyQuota}).weeklyAllocation,null);
  }
  assert.equal(projectWeeklyAllocation(build([]).weeklyAllocation,"name:alpha",{pro:223},now),null);
  const unknown = build([...fixtures,{id:"unknown",projectName:"Unknown",calls:[call(1,undefined,"unrated-model")]}]);
  assert.equal(projectWeeklyAllocation(unknown.weeklyAllocation,"name:alpha",{pro:223},now),null);
  const zero = build([],{}, {weeklyQuota:{...quota,usedPercent:0}}).weeklyAllocation;
  assert.deepEqual(projectWeeklyAllocation(zero,"name:alpha",{pro:0},now),{weeklyPercent:0,subscriptionCost:0});
  assert.equal(projectWeeklyAllocation(build().weeklyAllocation,"name:alpha",{pro:223},new Date(quota.resetsAt)),null);
});

test("saved monthly amounts persist per tier and convert to weekly bases", () => {
  const amounts = normalizeSubscriptionAmounts(JSON.parse(JSON.stringify({pro:223,plus:25,unknown:null})));
  const allocation = build().weeklyAllocation;
  near(projectWeeklyAllocation({...allocation,plan:"plus"},"name:beta",amounts,now).subscriptionCost,12/52);
  assert.equal(projectWeeklyAllocation({...allocation,plan:"business"},"name:beta",amounts,now).subscriptionCost,null);
  assert.equal(normalizeSubscriptionAmounts({pro:null}).pro,null);
  assert.equal(normalizeSubscriptionAmounts({pro:-1}).pro,223);
  assert.equal(normalizeSubscriptionAmounts({pro:"223"}).pro,223);
  assert.equal(subscriptionPlan({planType:" Pro "}),"pro");
  assert.equal(subscriptionPlan({planTypes:["pro","plus"]}),"unknown");
});

test("52 fully consumed weeks allocate exactly 12 monthly subscription payments", () => {
  for (const monthly of [0,25,223,250]) {
    const allocation = {...build().weeklyAllocation,usedPercent:100,projects:{single:1},totalCost:1};
    const result = projectWeeklyAllocation(allocation,"single",{pro:monthly},now);
    near(result.subscriptionCost*52,monthly*12);
    near(weeklySubscriptionAmount(monthly),result.subscriptionCost);
  }
  for (const invalid of [null,undefined,-1,"223",NaN,Infinity]) assert.equal(weeklySubscriptionAmount(invalid),null);
});
