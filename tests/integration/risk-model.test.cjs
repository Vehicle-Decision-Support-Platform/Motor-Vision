'use strict';
const assert=require('node:assert/strict');
const {createServer}=require('../../backend/server');
(async()=>{
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const listing={make:'Toyota',model:'Aqua',year:2016,mileage:80000,price:10000000,engine:'1500 cc',fuel:'Hybrid',transmission:'Automatic',photoCount:8,description:'Original registration documents and service records available',listingAgeDays:10};
  async function post(data,headers={}){return fetch(base+'/api/risk/assess',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});}
  try{
    const statusResponse=await fetch(base+'/api/risk/status');assert.equal(statusResponse.status,200);
    const status=await statusResponse.json();assert.equal(status.ready,true);
    assert.deepEqual(status.capabilities,{lightgbm:true,logreg:true,explanations:true});
    assert.equal((await fetch(base+'/api/risk/status',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
    assert.equal((await post(listing,{Origin:'https://evil.test'})).status,403);
    assert.equal((await post(listing,{'Content-Type':'text/plain'})).status,415);
    const response=await post(listing);assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.features.engine_cc,1500);
    assert(result.models.lightgbm.probability>=0&&result.models.lightgbm.probability<=1);
    assert.equal(Object.keys(result.models.lightgbm.shap_raw).length,20);
    assert(result.models.lightgbm.lime.length>0);
    assert(Number.isFinite(result.models.lightgbm.lime_fidelity));
    assert(result.market.fair_price_lkr>0);
    assert.match(result.modelVersion,/^lightgbm-/);
    assert.equal(result.modelVersion,status.modelVersion);
    const cheap=await (await post({...listing,engine:'1.5 L',price:3000000})).json();
    assert.equal(cheap.features.engine_cc,1500);
    assert(cheap.models.lightgbm.probability>result.models.lightgbm.probability);
    assert.equal(cheap.final_tier,'High');
    assert.equal((await post({...listing,year:'invalid'})).status,503);
    console.log('PASS: actual trained model, engine units, price sensitivity, SHAP, LIME, validation and origin guards');
  }finally{await new Promise(resolve=>server.close(resolve));}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
