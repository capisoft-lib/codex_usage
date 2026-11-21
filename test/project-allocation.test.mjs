import assert from "node:assert/strict";
import test from "node:test";
import { createPageData } from "../public/page-data.js";
import { normalizeSubscriptionAmounts, subscriptionPlan, weeklySubscriptionAmount, projectQuotaWindow, projectSubscriptionCost } from "../public/project-allocation.js";

const now = new Date("2026-11-21T20:00:00Z");
const day = "2026-11-21";
const at = time => `${day}T${time}:00Z`;
const point = (time, usedPercent) => ({ observedAt:at(time), usedPercent });
const observations = [point("12:33",75), point("17:45",75), point("18:44",75), point("19:03",76)];
const quota = { startsAt:"2026-11-17T12:00:00Z", resetsAt:"2026-11-24T12:00:00Z",
  ...observations.at(-1), planType:"pro", windowMinutes:10080, observations };
const call = (time, model = "gpt-6.2-sol") => ({ timestamp:at(time), model, usage:{ inputTokens:100, totalTokens:100 } });
const alpha = { id:"a", projectName:"Alpha", calls:[call("17:31"), call("18:32")] };
const beta = { id:"b", projectName:"Beta", calls:[call("18:55","unknown-model")] };

function build(sessions = [alpha, beta], query = {}, weeklyQuota = quota, clock = now) {
  const builder = createPageData({ weeklyQuota }, { view:"projects", start:at("00:00"), ...query }, clock);
  for (const session of sessions) { builder.add(session); builder.addWeekly(session); }
  return builder.finish().pageData;
}

test("unchanged integer account readings around activity stay below the reporting resolution", () => {
  const result = build();
  assert.deepEqual(result.projectQuota.projects["name:alpha"], {
    beforeAt:Date.parse(at("12:33")), afterAt:Date.parse(at("18:44")),
    beforePercent:75, afterPercent:75, delta:0, attributedPercent:null, belowResolution:true,
  });
  assert.equal(result.projectQuota.projects["name:beta"].delta,1);
  assert.equal(result.projectQuota.projects["name:beta"].belowResolution,false);
  assert.equal(result.projects.find(p => p.key === "name:beta").summary.credits.unratedCalls,1);
});

test("selected dates, project grouping and compact SQL bounds determine the activity interval", () => {
  const grouped = build([alpha,beta], {projectGroups:[{id:"combined",name:"Combined",members:["name:alpha","name:beta"]}]}).projectQuota.projects;
  assert.deepEqual(Object.keys(grouped),["group:combined"]);
  assert.equal(grouped["group:combined"].delta,1);
  const filtered = build([alpha,beta], {start:at("18:00"), end:at("18:45")}).projectQuota.projects;
  assert.deepEqual(Object.keys(filtered),["name:alpha"]);
  assert.equal(filtered["name:alpha"].beforeAt,Date.parse(at("17:45")));
  const compact = {...alpha, _callTimes:[Date.parse(at("17:31")),Date.parse(at("18:32"))]};
  assert.deepEqual(build([compact]).projectQuota,build([alpha]).projectQuota);
});

test("a ten-point reading is attributed only when the rise is isolated to the selected project", () => {
  const later = point("18:44",85);
  const metered = {...quota,...later,observations:[point("17:00",75),later]};
  const exclusive = build([alpha],{},metered).projectQuota.projects["name:alpha"];
  assert.equal(exclusive.attributedPercent,10);
  assert.equal(projectSubscriptionCost(exclusive,100).toFixed(2),"2.31");
  const competitor = {...beta,calls:[call("17:10")]};
  const shared = build([alpha,competitor],{start:at("17:30")},metered).projectQuota.projects["name:alpha"];
  assert.equal(shared.delta,10);
  assert.equal(shared.attributedPercent,null);
  assert.equal(projectSubscriptionCost(shared,100),null);
});

test("unbracketed, saturated, decreasing and ambiguous readings never claim a sub-percent result", () => {
  const later = {...alpha,calls:[...alpha.calls,call("19:30")]};
  assert.deepEqual(build([later]).projectQuota.projects,{});
  const withPoints = points => ({...quota,observations:points,...points.at(-1)});
  const lowerAfterAdjustment = withPoints([point("12:33",75),point("17:45",74),point("18:44",75)]);
  assert.deepEqual(build([alpha],{},lowerAfterAdjustment).projectQuota.projects,{});
  const saturated = withPoints([point("12:33",100),point("18:44",100)]);
  assert.deepEqual(build([alpha],{},saturated).projectQuota.projects,{});
  const precise = withPoints([point("12:33",75.5),point("18:44",75.5)]);
  assert.equal(build([alpha],{},precise).projectQuota.projects["name:alpha"].belowResolution,false);
  for (const invalid of [null,{...quota,observations:[]},{...quota,planTypes:["plus","pro"]},{...quota,theoretical:true}]) {
    assert.equal(projectQuotaWindow({ weeklyQuota:invalid },-Infinity,Infinity,now),null);
  }
  assert.equal(build([alpha],{},quota,new Date(quota.resetsAt)).projectQuota,null);
});

test("monthly subscription settings retain their independent weekly conversion", () => {
  assert.equal(normalizeSubscriptionAmounts({pro:null}).pro,null);
  assert.equal(normalizeSubscriptionAmounts({pro:-1}).pro,223);
  assert.equal(normalizeSubscriptionAmounts({pro:"223"}).pro,223);
  assert.equal(subscriptionPlan({planType:" Pro "}),"pro");
  assert.equal(subscriptionPlan({planTypes:["pro","plus"]}),"unknown");
  for (const amount of [0,25,223,250]) assert.ok(Math.abs(weeklySubscriptionAmount(amount)*52-amount*12)<1e-9);
  for (const invalid of [null,undefined,-1,"223",NaN,Infinity]) assert.equal(weeklySubscriptionAmount(invalid),null);
});
