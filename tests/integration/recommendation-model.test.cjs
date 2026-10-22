'use strict';
const assert=require('node:assert/strict');
const {createServer}=require('../../backend/server');
const model=require('../../backend/services/recommendation-model');
const auth={userFromRequest:async req=>req.headers.cookie==='test-session=valid'?{id:'integration-user'}:null};
(async()=>{
  const server=createServer({auth});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const input={preferences:{Make:'Toyota','Transmission Type':'AUTOMATIC'},topN:5,mode:'model'};
  const post=(payload,headers={})=>fetch(base+'/api/recommendations',{
    method:'POST',headers:{'Content-Type':'application/json',Cookie:'test-session=valid',...headers},body:JSON.stringify(payload)
  });
  try{
    assert.equal((await post(input,{Cookie:''})).status,401,'Unauthenticated requests are rejected');
    assert.equal((await post(input,{Origin:'https://foreign.example'})).status,403);
    assert.equal((await post(input,{'Content-Type':'text/plain'})).status,415);
    assert.equal((await fetch(base+'/api/recommendations')).status,405);
    assert.equal((await fetch(base+'/api/recommendations/options',{method:'POST'})).status,405);
    for(const file of ['/css/recommendation.css','/js/recommendation-ui.js'])assert.equal((await fetch(base+file)).status,200);
    assert.equal((await fetch(base+'/ai-models/component-2-recommendation/models/lightgbm_relevance.joblib')).status,404);
    const optionsResponse=await fetch(base+'/api/recommendations/options');
    assert.equal(optionsResponse.status,200);
    const options=await optionsResponse.json();
    assert.equal(options.fields.length,12);
    assert.equal(options.rowCount,11914);assert.equal(options.uniqueVehicleCount,6420);
    assert(options.modelsByMake.Toyota.includes('Corolla'));
    const response=await post(input);assert.equal(response.status,200,await response.clone().text());
    const result=await response.json();
    assert.equal(result.results.length,5);assert.equal(result.mode,'model');
    assert.equal(result.modelVersion,options.modelVersion);assert.match(result.modelVersion,/^lightgbm-relevance-[a-f0-9]{12}$/);
    assert.equal(result.datasetVersion,options.datasetVersion);
    assert.equal(result.trainingLabels,'synthetic_weighted_feature_match');
    assert.equal(result.results[0].vehicle.Make,'Toyota');
    const records=new Set();
    result.results.forEach((item,i)=>{
      assert.equal(item.rank,i+1);assert(item.matchPercent>=0&&item.matchPercent<=100);
      if(i)assert(item.matchPercent<=result.results[i-1].matchPercent);
      assert.equal(item.explanation.length,12);
      const raw=item.shapBaseValue+item.explanation.reduce((sum,f)=>sum+f.shapContribution,0);
      assert(Math.abs(raw-item.rawScore)<1e-6,'SHAP explains the actual raw model prediction');
      assert(Math.abs(item.matchPercent-Math.min(1,Math.max(0,item.rawScore))*100)<1e-9);
      const record=JSON.stringify(item.vehicle);assert(!records.has(record));records.add(record);
      assert(item.explanation.filter(f=>!f.selected).every(f=>f.featureMatch===0.5));
    });
    const repeated=await (await post(input)).json();
    assert.deepEqual(repeated.results,result.results,'Stable deterministic ranking');
    const baseline=await (await post({...input,mode:'baseline',topN:3})).json();
    assert.equal(baseline.results.length,3);assert.equal(baseline.mode,'baseline');
    assert.equal(baseline.rankingVersion,'weighted-match-baseline-1');
    assert(baseline.results.every(v=>v.shapBaseValue===null&&v.explanation.every(f=>f.shapContribution===null)));
    assert(Math.abs(baseline.results[0].matchPercent-61)<1e-7,'Original weighted rule: 0.5 + 0.5*(0.08 + 0.14)');
    for(const invalid of [
      {preferences:{}}, {preferences:{Make:'Not a make'}}, {preferences:{Year:'2015'}},
      {preferences:{Make:true}},
      {...input,topN:0}, {...input,topN:101}, {...input,topN:2.5}, {...input,topN:true},
      {...input,mode:'hybrid'}, {...input,preferences:{budget:1000000}}, {...input,extra:'ignored?'},
      [],null
    ])assert.equal((await post(invalid)).status,400,JSON.stringify(invalid));
    assert.equal((await post({preferences:{Make:'Toyota',Model:'Civic'},topN:1})).status,200,'Independent soft preferences match the supplied form');
    const honda=await (await post({preferences:{Make:'Honda',Model:'Civic',Year:2015},topN:3})).json();
    assert.notDeepEqual(honda.results.map(v=>v.id),result.results.slice(0,3).map(v=>v.id));
    assert(honda.results.every(v=>!('price' in v.vehicle)),'No invented prices');
    assert.equal((await fetch(base+'/api/recommendations',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'test-session=valid'},body:'{'})).status,400);
    console.log('PASS: actual trained model via API, authentication, origin/method guards, 12 preferences, Top-N, stable deduplication, SHAP additivity, baseline, versions and invalid-input handling');
  }finally{model.closeWorker();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
