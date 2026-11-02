import assert from 'node:assert/strict';
import test from 'node:test';
import {mergeWeeklyQuotaObservations} from '../src/quota-history.mjs';
import {normalizeQuotaPeriods} from '../public/quota-periods.js';
import {buildQuotaForecast, measuredHistoricalQuotaPace} from '../public/quota-forecast.js';
import {createQuotaDetail} from '../public/quota-data.js';
import {normalizeSubscriptionAmounts,subscriptionPlan} from '../public/project-allocation.js';
import {toPublicUsage} from '../src/public-usage.mjs';
import {validateSyncPayload} from '../src/mesh-protocol.mjs';

const resetsAt='2026-11-05T19:02:05.000Z', startsAt='2026-10-29T19:02:05.000Z';
const before='2026-11-02T09:28:14.692Z', changedAt='2026-11-02T09:33:43.898Z';
function history(oldPlan='pro',newPlan='prolite',oldUsed=33,newUsed=66) {
  return mergeWeeklyQuotaObservations([
    {resetsAt,windowMinutes:10080,observedAt:before,usedPercent:oldUsed,planType:oldPlan},
    {resetsAt,windowMinutes:10080,observedAt:changedAt,usedPercent:newUsed,planType:newPlan},
    {resetsAt,windowMinutes:10080,observedAt:'2026-11-02T11:33:43.898Z',usedPercent:newUsed+2,planType:newPlan},
  ]);
}

for (const [a,b,x,y] of [['pro','prolite',33,66],['prolite','pro',66,33]]) {
  test(`${a} to ${b} retains capacity boundaries through account, public and hub merges`,()=>{
    const periods=history(a,b,x,y), merged=mergeWeeklyQuotaObservations(periods);
    assert.equal(merged.length,1); assert.equal(merged[0].resetsAt,resetsAt);
    assert.deepEqual(merged[0].planTypes,[a,b]);
    assert.deepEqual(merged[0].planChanges,periods[0].planChanges);
    const data=toPublicUsage({sessions:[],weeklyQuota:merged[0],weeklyQuotaHistory:merged});
    const hub=normalizeQuotaPeriods(data);
    assert.deepEqual(hub[0].planChanges,periods[0].planChanges);
    assert.equal(subscriptionPlan(hub[0]),b);
    const forecast=buildQuotaForecast({...hub[0],rangeStart:startsAt,rangeEnd:resetsAt,asOf:hub[0].observedAt,quotaPeriods:hub});
    assert.equal(forecast.forecasts.current.percentPerHour,1,'Only two points consumed after the capacity adjustment');
    assert.equal(forecast.planChange.startsAt,changedAt); assert.equal(forecast.provisional,true);
    assert.ok(forecast.actual.some(point=>point.percent===x));
    assert.equal(createQuotaDetail(data,null,new Date(hub[0].observedAt)).calibrationWindows[0].start,Date.parse(changedAt));
    const payload={kind:'sync',snapshotVersion:1,generatedAt:hub[0].observedAt,privacy:{projectMode:'hash',includeTitles:false},quota:hub[0],quotaHistory:hub,upserts:[],removals:[]};
    assert.doesNotThrow(()=>validateSyncPayload(payload));
    assert.throws(()=>validateSyncPayload({...payload,quota:{...hub[0],planChanges:[{...hub[0].planChanges[0],prompt:'private'}]}}),/Quota/);
  });
}

test('no capacity or rate is inferred from the jump itself',()=>{
  const period=history()[0];period.observedAt=changedAt;period.usedPercent=66;period.observations=period.observations.slice(0,2);
  const forecast=buildQuotaForecast({...period,rangeStart:startsAt,rangeEnd:resetsAt,asOf:changedAt,quotaPeriods:[period]});
  assert.equal(forecast.forecasts.current,null);assert.equal(forecast.forecasts.historical,null);
  assert.equal(forecast.provisional,true);
  assert.equal(measuredHistoricalQuotaPace([period],Date.parse(startsAt),Date.parse(changedAt),'prolite'),null);
});

test('old mixed-plan summaries remain mixed until dated measurements are recovered',()=>{
  const mixed={resetsAt,startsAt,windowMinutes:10080,observedAt:changedAt,usedPercent:66,planType:'prolite',planTypes:['pro','prolite']};
  const merged=mergeWeeklyQuotaObservations([mixed]);
  assert.deepEqual(merged[0].planTypes,['pro','prolite']);
  const result=buildQuotaForecast({...merged[0],rangeStart:startsAt,rangeEnd:resetsAt,asOf:changedAt});
  assert.equal(result.forecasts.current,null);
});

test('subscription amounts stay independent across tiers',()=>{
  const amounts=normalizeSubscriptionAmounts({pro:223});
  assert.equal(amounts.pro,223);assert.equal(amounts.prolite,100);
  assert.equal(normalizeSubscriptionAmounts({prolite:112}).prolite,112);
});

test('returning to an earlier plan preserves the full ordered transition history',()=>{
  const current=history()[0];
  const merged=mergeWeeklyQuotaObservations([current,{resetsAt,windowMinutes:10080,observedAt:'2026-11-02T13:33:43.898Z',usedPercent:34,planType:'pro'}]);
  assert.deepEqual(merged[0].planTypes,['pro','prolite','pro']);
  assert.deepEqual(normalizeQuotaPeriods({weeklyQuota:merged[0],weeklyQuotaHistory:merged})[0].planTypes,['pro','prolite','pro']);
  assert.deepEqual(mergeWeeklyQuotaObservations(merged)[0].planTypes,['pro','prolite','pro']);
});
