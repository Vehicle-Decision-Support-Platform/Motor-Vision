'use strict';
const assert=require('node:assert/strict');
const {createServer}=require('../../backend/server');
const PriceEngine=require('../../frontend/js/price-engine.js');
(async()=>{
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  // Same inputs as the Hybrid Vehicle Price Advisor (vehicle_hybrid_system/app.py).
  const listing={make:'TOYOTA',model:'AQUA',year:2018,engine:1500,transmission:'AUTOMATIC',fuel:'HYBRID',mileage:60000,condition:'USED',bodyType:'HATCHBACK',colour:'WHITE',price:11650000};
  async function post(data,headers={}){return fetch(base+'/api/price/predict',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});}
  try{
    assert.equal((await post(listing,{Origin:'https://evil.test'})).status,403);
    assert.equal((await post(listing,{'Content-Type':'text/plain'})).status,415);
    const options=await (await fetch(base+'/api/price/options')).json();
    assert(options.categories.Brand.includes('TOYOTA'));assert(options.modelsByBrand.TOYOTA.includes('AQUA'));
    assert.deepEqual(options.categories.Gear,['AUTOMATIC','CVT','MANUAL','TIPTRONIC']);
    const response=await post(listing);assert.equal(response.status,200);
    const prediction=await response.json();
    // Reference values produced by vehicle_hybrid_system core.predict_vehicle for these inputs.
    assert.equal(Math.round(prediction.final_price),16264123);assert.equal(prediction.status,'POTENTIALLY GOOD DEAL');
    const alto=await (await post({...listing,make:'SUZUKI',model:'ALTO',year:2010,engine:800,transmission:'MANUAL',fuel:'PETROL',mileage:165000,price:2600000})).json();
    assert.equal(Math.round(alto.final_price),4196046);
    assert.equal((await (await post({...listing,make:'Toyota',model:'Aqua',transmission:'Automatic'})).json()).final_price,prediction.final_price);
    assert.deepEqual(prediction.models.map(m=>m.id).sort(),['lightgbm','random_forest','xgboost']);
    const result=PriceEngine.evaluate({...listing,engine:'1500'},{mode:'ai',prediction});
    assert.equal(result.fairValue,prediction.final_price);assert.equal(result.classification,'UNDERPRICED');assert.equal(result.recommendation,prediction.explanation);
    assert.equal((await post({...listing,colour:''})).status,503);
    console.log('PASS: site prediction matches vehicle_hybrid_system core.py, dropdown options, status mapping and origin guards');
  }finally{await new Promise(resolve=>server.close(resolve));}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
