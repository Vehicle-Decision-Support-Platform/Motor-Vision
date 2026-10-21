const assert=require('node:assert/strict');
const P=require('../../frontend/js/price-engine');
const listing={make:'Toyota',model:'Aqua',year:2018,mileage:42500,price:7850000,fuel:'Hybrid',transmission:'Automatic',engine:'1500 cc',bodyType:'Hatchback',condition:'Good',location:'Colombo'};
const catalog=[{id:1,name:'Toyota Aqua',year:2018,km:42500,price:7850000,fuel:'Hybrid'}];
function report(vehicle=listing){return {schemaVersion:'price-model-bundle-1',currency:'LKR',vehicle,datasetVersion:'vehicles-v3',preprocessingVersion:'features-v2',splitId:'validation-split-a',evaluationSplit:'validation',sampleSize:200,threshold:{percent:5,evidence:'Tolerance chosen from validation residual analysis; supplied test fixture only.'},models:[{id:'xgboost',modelVersion:'xgb-1',metrics:{r2:.88,rmse:600000,mae:420000},predictedPrice:8000000},{id:'random_forest',modelVersion:'rf-1',metrics:{r2:.85,rmse:750000,mae:500000},predictedPrice:8200000},{id:'lightgbm',modelVersion:'lgb-1',metrics:{r2:.89,rmse:550000,mae:390000},predictedPrice:7900000}]};}
let r=P.compare(7000000,8000000,5);assert.equal(r.difference,-1000000);assert.equal(r.differencePercent,-12.5);assert.equal(r.classification,'UNDERPRICED');
for(const price of [7600000,8000000,8400000])assert.equal(P.compare(price,8000000,5).classification,'FAIRLY_PRICED');
assert.equal(P.compare(8400001,8000000,5).classification,'OVERPRICED');assert.equal(P.compare(7599999,8000000,5).classification,'UNDERPRICED');
assert.equal(P.compare(8000001,8000000,0).classification,'OVERPRICED');assert.equal(P.compare(8000000,8000000,0).classification,'FAIRLY_PRICED');
for(const t of [-1,51,NaN,Infinity,'5'])assert.throws(()=>P.compare(8000000,8000000,t),/tolerance/);
for(const price of [0,-1,Infinity,NaN,'8000000'])assert.throws(()=>P.compare(price,8000000,5),/positive/);
const demo=P.evaluate(listing,{catalog});assert.equal(demo.fairValue,7850000);assert.equal(demo.isDemo,true);assert.equal(demo.classification,'FAIRLY_PRICED');assert(demo.recommendation.includes('demo reference'));
assert.equal(P.evaluate({...listing,price:10000000},{catalog}).fairValue,demo.fairValue,'Seller price must not influence its own fair value.');
assert.equal(P.evaluate({...listing,year:2026,mileage:0,condition:'Reconditioned'},{catalog}).features.conditionFactor,1);
assert(P.evaluate({...listing,condition:''},{catalog}).features.conditionAssumedNeutral);
assert.throws(()=>P.evaluate({...listing,model:'Vitz'},{catalog}),/No demo reference/);
assert.throws(()=>P.prepare({...listing,mileage:''}),/mileage/);assert.throws(()=>P.prepare({...listing,year:2027}),/year/);
assert.throws(()=>P.prepare({...listing,bodyType:{}}),/bodyType/);
const clean=P.prepare({...listing,phone:'0771234567',sellerName:'PRIVATE NAME'});assert(!JSON.stringify(clean).includes('0771234567'));assert(!Object.hasOwn(clean,'sellerName'));
const b=report();assert.equal(P.validateBundle(b).selectedModelId,'lightgbm');
r=P.evaluate({...listing,price:8400000},{mode:'model',bundle:b});assert.equal(r.fairValue,7900000);assert.equal(r.modelName,'LightGBM');assert.equal(r.isDemo,false);assert.equal(r.thresholdStatus,'imported_error_analysis');assert.equal(r.classification,'OVERPRICED');assert.equal(r.datasetVersion,'vehicles-v3');
assert.equal(P.evaluate({...listing,price:1000000},{mode:'model',bundle:b}).fairValue,7900000);
assert.throws(()=>P.evaluate({...listing,year:2019},{mode:'model',bundle:b}),/different vehicle features/);
assert.throws(()=>P.evaluate({...listing,fuel:'Petrol'},{mode:'model',bundle:b}),/different vehicle features/);
assert.equal(P.evaluate(listing,{mode:'model',bundle:b,thresholdPercent:7}).thresholdStatus,'custom_unvalidated');
const seven=report();seven.threshold.percent=7;assert.equal(P.evaluate(listing,{mode:'model',bundle:seven}).thresholdPercent,7);
const tied=report();tied.models[0].metrics={...tied.models[2].metrics};assert.equal(P.validateBundle(tied).tied,true);
const tieMae=report();tieMae.models[0].metrics={...tieMae.models[2].metrics,mae:380000};assert.equal(P.validateBundle(tieMae).selectedModelId,'xgboost');
const negativeR2=report();negativeR2.models[0].metrics.r2=-.5;assert.doesNotThrow(()=>P.validateBundle(negativeR2));
const mutations=[
 x=>x.currency='USD',x=>x.evaluationSplit='test',x=>x.sampleSize=0,x=>x.models.pop(),x=>x.models[0].id='lightgbm',
 x=>x.models[0].metrics.r2=1.1,x=>x.models[0].metrics.rmse=NaN,x=>x.models[0].metrics.mae=900000,
 x=>x.models[0].predictedPrice=0,x=>x.models[0].modelVersion='',x=>x.models[0].datasetVersion='different-data',
 x=>x.threshold.percent=51,x=>x.threshold.evidence='',x=>x.splitId='your-validation-split-id'
];
for(const mutate of mutations){const bad=report();mutate(bad);assert.throws(()=>P.validateBundle(bad));}
assert.throws(()=>P.validateBundle(P.template(listing)),'A template must never be accepted as real experiments.');
const unknown={...listing,make:'Toyota',model:'Land Cruiser'};assert.equal(P.evaluate(unknown,{mode:'model',bundle:report(unknown)}).fairValue,7900000,'Externally supplied model outputs are not limited to demo models.');
assert.equal(P.fingerprint(listing),P.fingerprint({...listing,price:1,make:' toyota ',model:'AQUA'}));
console.log('PASS: price differences/threshold boundaries, independent demo estimate, features/privacy, model comparison/selection, versioned report validation and prediction scope');
