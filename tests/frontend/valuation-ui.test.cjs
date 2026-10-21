'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseListing}=require('../../backend/services/listing-import');
const Risk=require('../../frontend/js/risk-engine');
const adUrl='https://ikman.lk/en/ad/suzuki-wagon-r-fx-safety-2025-for-sale-colombo-212';
const ad={title:'Suzuki Wagon R FX Safety 2025',properties:Object.entries({brand:'Suzuki',model:'Wagon R',model_year:'2025',mileage:'3,000 km',fuel_type:'Petrol',transmission:'Automatic',engine_capacity:'660 cc',body:'Hatchback',condition:'Reconditioned'}).map(([key,value])=>({key,value})),money:{amount:'Rs 7,650,000'},description:'100,000 km warranty',location:{name:'Colombo'}};
const preview=parseListing(`<script>window.initialData = ${JSON.stringify({adDetail:{data:{ad}}})};</script>`,adUrl);
const elements={},listeners={};
const element=id=>elements[id]||={id,innerHTML:'',textContent:'',value:'',style:{},classList:{toggle(){},contains(){return false;}},focus(){},setAttribute(){},removeAttribute(){},querySelector(){return null;}};
let response={ok:true,headers:{get:()=> 'application/json'},json:async()=>preview},downloadBlob=null,downloadName='';
function TestURL(value,base){return new URL(value,base);}
TestURL.createObjectURL=blob=>{downloadBlob=blob;return 'blob:test';};TestURL.revokeObjectURL=()=>{};
const context={console,URL:TestURL,Blob,AbortController,setTimeout,clearTimeout,location:{hash:'#valuation'},history:{replaceState(){}},localStorage:{getItem:()=>null},addEventListener(){},scrollTo(){},document:{getElementById:element,querySelectorAll:()=>[],addEventListener(type,callback){(listeners[type]||=[]).push(callback);},body:{append(){}},createElement(){return {set download(value){downloadName=value;},click(){},remove(){}};}},fetch:async(url,options)=>{assert.equal(url,'/api/listings/preview');assert.equal(JSON.parse(options.body).url,adUrl);return response;}};
context.window=context;vm.createContext(context);
for(const file of ['listing-link-ui.js','price-engine.js','valuation-ui.js','app.js'])vm.runInContext(fs.readFileSync(__dirname+'/../../frontend/js/'+file,'utf8'),context);
const html=()=>element('page-content').innerHTML;
const ids=['make','model','year','mileage','fuel','transmission','engine','bodyType','condition','location','valuation-asking-price','price-threshold'];
function sync(){
  const page=html();
  if(!page.includes('id="valuation-form"')){delete elements['valuation-form'];return;}
  const form=element('valuation-form');form.elements={namedItem:id=>element(id)};
  for(const id of ids){
    const input=page.match(new RegExp('<input id="'+id+'"[^>]*value="([^"]*)"'));
    const select=page.match(new RegExp('<select id="'+id+'"[^>]*>([\\s\\S]*?)</select>'));
    element(id).value=input?.[1]??select?.[1].match(/<option value="([^"]*)" selected/)?.[1]??'';element(id).form=form;
  }
}
function set(values){for(const [id,v] of Object.entries(values))element(id).value=String(v);}
function click(dataset){const button={dataset,classList:{contains(){return false;}}};listeners.click.forEach(callback=>callback({target:{closest:()=>button}}));sync();}
function submit(id='valuation-form'){listeners.submit.forEach(callback=>callback({target:{id},preventDefault(){}}));}
function changed(id){listeners.input.forEach(callback=>callback({target:element(id)}));}
function linkForm(){const form=element('valuation-link-form'),button=element('fetch-button'),input=element('valuation-link-url');input.value=adUrl;form.elements={namedItem:()=>input};form.querySelector=()=>button;return form;}
async function importUrl(){await listeners.submit[0]({target:linkForm(),preventDefault(){}});sync();}
function bundle(vehicle){return {schemaVersion:'price-model-bundle-1',currency:'LKR',vehicle,datasetVersion:'experiment-data-1',preprocessingVersion:'preprocessing-1',splitId:'validation-a',evaluationSplit:'validation',sampleSize:120,threshold:{percent:5,evidence:'Validation residual analysis supplied by this offline test fixture.'},models:[{id:'xgboost',modelVersion:'xgb-1',metrics:{r2:.84,rmse:600000,mae:450000},predictedPrice:8000000},{id:'random_forest',modelVersion:'rf-1',metrics:{r2:.82,rmse:700000,mae:500000},predictedPrice:8100000},{id:'lightgbm',modelVersion:'lgb-1',metrics:{r2:.86,rmse:550000,mae:420000},predictedPrice:7900000}]};}
(async()=>{
  sync();assert(html().includes('Model comparison'));assert(html().includes('valuation-link-form'));
  assert.equal(element('model').value,'');assert(html().includes('Seller\'s listed price'));
  await importUrl();assert.equal(element('breadcrumb').textContent,'Price evaluation');
  assert.equal(element('make').value,'Suzuki');assert.equal(element('model').value,'Wagon R');assert.equal(element('year').value,'2025');assert.equal(element('mileage').value,'3000');assert.equal(element('valuation-asking-price').value,'7650000');
  assert.equal(element('condition').value,'Reconditioned');assert.equal(element('bodyType').value,'Hatchback');assert.equal(element('fuel').value,'Petrol');
  submit();let result=context.ValuationUI.getLatestResult();assert(result?.isDemo);assert.equal(result.reference.name,'Suzuki Wagon R');assert.equal(result.features.conditionFactor,1);
  assert(element('valuation-result').innerHTML.includes('BUYER RECOMMENDATION'));assert(element('valuation-result').innerHTML.includes('Percentage difference'));
  const demoValue=result.fairValue;set({'valuation-asking-price':40000000});changed('valuation-asking-price');assert.equal(context.ValuationUI.getLatestResult(),null);submit();
  assert.equal(context.ValuationUI.getLatestResult().fairValue,demoValue);assert.equal(context.ValuationUI.getLatestResult().classification,'OVERPRICED');
  click({priceAction:'export-result'});assert(downloadName.includes('demo-price-result'));assert.equal(JSON.parse(await downloadBlob.text()).isDemo,true);
  const previousBlob=downloadBlob;click({priceAction:'export-shared'});assert.equal(downloadBlob,previousBlob,'Demo output must not be sent as a real fair-value reference.');
  set({'valuation-asking-price':7650000});changed('valuation-asking-price');
  click({priceTab:'models'});assert(html().includes('R²'));assert(html().includes('RMSE (LKR)'));assert(html().includes('MAE (LKR)'));assert(html().includes('RESULTS PENDING'));assert(!html().includes('0.840'));
  click({priceAction:'template'});const template=JSON.parse(await downloadBlob.text());assert.equal(template.vehicle.model,'Wagon R');assert.equal(template.models[0].metrics.r2,null);
  const real=bundle(template.vehicle);element('price-model-json').value=JSON.stringify(real);submit('price-model-form');sync();
  assert(html().includes('LightGBM'));assert(html().includes('0.860'));assert(html().includes('IMPORTED REPORT'));assert(html().includes('SELECTED'));
  click({priceTab:'evaluate'});submit();result=context.ValuationUI.getLatestResult();assert.equal(result.isDemo,false);assert.equal(result.fairValue,7900000);assert.equal(result.modelName,'LightGBM');assert.equal(result.datasetVersion,'experiment-data-1');
  assert(result.provenance.sourceUrl===adUrl);assert(element('valuation-result').innerHTML.includes('SUPPLIED MODEL PRICE EVALUATION'));
  click({priceAction:'export-shared'});const shared=JSON.parse(await downloadBlob.text());assert.equal(shared.listings[0].fairValue,7900000);assert.equal(shared.priceEvaluation.modelVersion,'lgb-1');assert.doesNotThrow(()=>Risk.assess(shared.listings[0]));
  const copy=context.ValuationUI.getLatestResult();copy.fairValue=1;assert.equal(context.ValuationUI.getLatestResult().fairValue,7900000,'Consumers must not mutate the stored result.');
  set({'valuation-asking-price':8500000,'price-threshold':2});changed('price-threshold');submit();result=context.ValuationUI.getLatestResult();assert.equal(result.fairValue,7900000);assert.equal(result.thresholdStatus,'custom_unvalidated');assert.equal(result.classification,'OVERPRICED');
  set({year:2024});changed('year');submit();assert.equal(context.ValuationUI.getLatestResult(),null);assert(element('valuation-form-error').innerHTML.includes('different vehicle features'));
  click({priceTab:'models'});element('price-model-json').value='{broken';submit('price-model-form');assert(element('price-model-status').innerHTML.includes('form-error'));assert(html().includes('IMPORTED REPORT'),'A failed import must not overwrite the applied report.');
  click({priceTab:'evaluate'});assert.equal(element('year').value,'2024');
  context.ValuationUI.loadFromLink({...preview,listing:{...preview.listing,make:'Toyota',model:'Land Cruiser'}});sync();submit();assert.equal(context.ValuationUI.getLatestResult(),null);assert(element('valuation-form-error').innerHTML.includes('No demo reference'));
  assert.equal(element('make').value,'Toyota');assert.equal(element('model').value,'Land Cruiser','Unknown models must not be substituted.');
  context.ValuationUI.loadFromLink({...preview,listing:{...preview.listing,year:undefined,mileage:undefined,price:undefined}});sync();assert.equal(element('year').value,'');assert.equal(element('mileage').value,'');assert.equal(element('valuation-asking-price').value,'');
  context.ValuationUI.loadFromLink({...preview,title:'<img src=x onerror=alert(1)>',listing:{...preview.listing,model:'<svg onload=alert(1)>'}});sync();assert(html().includes('&lt;img'));assert(!html().includes('<img src=x'));assert(!html().includes('<svg onload'));
  assert.throws(()=>context.ValuationUI.loadFromLink({...preview,sourceUrl:'javascript:alert(1)'}),/invalid listing preview/);
  click({priceAction:'manual'});assert.equal(element('model').value,'');assert(!html().includes('AD DETAILS IMPORTED'));
  click({priceAction:'sample'});assert.equal(element('make').value,'Toyota');assert.equal(element('model').value,'Aqua');submit();assert.equal(context.ValuationUI.getLatestResult().classification,'FAIRLY_PRICED');
  response={ok:false,headers:{get:()=> 'application/json'},json:async()=>({error:'The site blocked this request.'})};await importUrl();assert(element('valuation-link-status').innerHTML.includes('blocked'));assert(element('valuation-link-status').innerHTML.includes('data-valuation-action="manual"'));assert(!element('valuation-link-status').innerHTML.includes('data-page="assess"'));
  let finish;context.fetch=()=>new Promise(resolve=>{finish=resolve;});const pending=listeners.submit[0]({target:linkForm(),preventDefault(){}});context.navigate('overview');delete elements['valuation-link-form'];finish({ok:true,headers:{get:()=> 'application/json'},json:async()=>preview});await pending;assert.equal(element('breadcrumb').textContent,'Overview');
  console.log('PASS: proposal input fields/ad import, complete price report, model results/metrics/selection, configurable tolerance, shared export, stale-data/unknown-model/error/privacy safeguards');
})().catch(error=>{console.error(error);process.exitCode=1;});
