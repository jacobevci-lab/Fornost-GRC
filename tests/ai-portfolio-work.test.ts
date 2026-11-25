import test from 'node:test';
import assert from 'node:assert/strict';
import {portfolioGaps,sortPortfolioWork,systemReviewOverdue,aiDisplayStatus,type PortfolioSystem} from '../app/ai-portfolio-work';
const row:PortfolioSystem={id:'one',systemName:'System',modelName:'Model',owner:'owner@test.invalid',status:'approved',riskTier:'Low',reviewDate:'2026-11-11',highRisks:0,criticalIncidents:0,openControls:0,totalControls:2,evidenceCurrent:1,redTeamCurrent:true,transparencyCurrent:true,assuranceCurrent:true,unresolvedExceptions:0,retirementInProgress:false,blockingFindings:0,releaseStatus:'approved',releaseScore:100,actions:[],readiness:100};
test('system review is overdue only before the snapshot day; absent dates are not invented deadlines',()=>{
 assert.equal(systemReviewOverdue(row,'2026-11-11'),false);
 assert.equal(systemReviewOverdue({...row,reviewDate:'2026-11-10'},'2026-11-11'),true);
 assert.equal(systemReviewOverdue({...row,reviewDate:''},'2026-11-11'),false);
});
test('inventory approval and a maximum readiness score do not stand in for release approval',()=>{
 assert.deepEqual(portfolioGaps({...row,releaseStatus:'none'},'en','2026-11-11'),['Review release decision']);
 assert.equal(aiDisplayStatus('none','en'),'Not assessed');
 assert.deepEqual(portfolioGaps(row,'en','2026-11-11'),[]);
});
test('priority ordering uses overdue review then risk severity, not alphabetic risk labels',()=>{
 const rows=[{...row,id:'low'}, {...row,id:'medium',riskTier:'Medium'}, {...row,id:'high',riskTier:'High'}, {...row,id:'critical',riskTier:'Critical'}, {...row,id:'late',reviewDate:'2026-11-10'}];
 assert.deepEqual(sortPortfolioWork(rows,'2026-11-11').map(r=>r.id),['late','critical','high','medium','low']);
 assert.equal(rows[0].id,'low');
});
test('missing control coverage is a gap even when there are zero open controls; recorded blockers are retained',()=>{
 const gaps=portfolioGaps({...row,totalControls:0,blockingAssuranceAlerts:2,blockingRegulatoryObligations:1},'en','2026-11-11');
 assert.deepEqual(gaps,['Review 2 assurance alerts','Review 1 regulatory obligations','Complete control assessment']);
 assert.match(portfolioGaps({...row,reviewDate:'2026-11-10'},'tr','2026-11-11')[0],/incelemesini/);
});
