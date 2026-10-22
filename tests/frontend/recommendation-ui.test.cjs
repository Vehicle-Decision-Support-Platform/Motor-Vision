'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const listeners={},elements=new Map();
function element(id){
  if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',value:'',disabled:false,
    classList:{toggle(){}},setAttribute(){},removeAttribute(){},focus(){},scrollIntoView(){},showModal(){this.open=true;},close(){this.open=false;}});
  return elements.get(id);
}
const names=['Make','Model','Year','Engine Fuel Type','Engine HP','Engine Cylinders','Transmission Type','Driven_Wheels','Number of Doors','Market Category','Vehicle Size','Vehicle Style'];
const numeric=new Set(['Year','Engine HP','Engine Cylinders','Number of Doors']);
const options={uniqueVehicleCount:2,modelsByMake:{Toyota:['Corolla'],Honda:['Civic']},fields:names.map(name=>({name,numeric:numeric.has(name),values:name==='Make'?['Toyota','Honda']:name==='Model'?['Corolla','Civic']:numeric.has(name)?[2015]:['AUTOMATIC']}))};
const requests=[];let fail=false;
const context={
  console,AbortController,setTimeout,clearTimeout,
  document:{getElementById:element,querySelectorAll:()=>[],addEventListener(type,callback){(listeners[type]||=[]).push(callback);}},
  localStorage:{getItem:()=>null},history:{replaceState(){}},location:{hash:'#recommendations'},
  addEventListener(){},scrollTo(){},matchMedia:()=>({matches:true}),
  fetch:async(url,config={})=>{
    requests.push({url,config});
    if(url.endsWith('/options'))return {ok:true,json:async()=>options};
    if(fail)return {ok:false,json:async()=>({error:'Model unavailable. Please retry.'})};
    const payload=JSON.parse(config.body);
    return {ok:true,json:async()=>({mode:payload.mode,returnedCount:1,candidateCount:2,latencyMs:12,
      modelVersion:'fixture',rankingVersion:'fixture',datasetVersion:'fixture',preprocessingVersion:'fixture',limitations:['Synthetic labels'],
      results:[{rank:1,id:'catalogue-1',vehicle:{Make:'Toyota',Model:'<script>unsafe</script>',Year:2015,'Vehicle Size':'Compact','Transmission Type':'AUTOMATIC','Vehicle Style':'Sedan'},
        matchPercent:80,rawScore:.8,shapBaseValue:.5,matches:['Make'],differences:[],explanation:[{feature:'Make',vehicleValue:'Toyota',preference:'Toyota',selected:true,featureMatch:1,shapContribution:payload.mode==='model'?.3:null}]}]})};
  }
};
context.window=context;
vm.createContext(context);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function emit(type,target){for(const listener of listeners[type]||[])listener({target,preventDefault(){}});await tick();}
(async()=>{
  for(const file of ['recommendation-ui.js','app.js'])vm.runInContext(fs.readFileSync(path.join(root,'frontend/js',file),'utf8'),context);
  await tick();await tick();
  assert.equal(context.document.title,'Vehicle recommendations | Motor Vision');
  assert(element('page-content').innerHTML.includes('recommendation-form'));
  assert.equal((element('rec-preferences').innerHTML.match(/data-rec-preference=/g)||[]).length,12);
  assert.equal(element('rec-fields').disabled,false);
  const controls=Object.fromEntries(names.map(name=>[name,{value:'Any'}]));controls.topN={value:'7'};
  const form={id:'recommendation-form',elements:{namedItem:name=>controls[name]}};
  await emit('submit',form);
  assert(element('rec-error').textContent.includes('at least one preference'));
  assert.equal(requests.filter(r=>r.url==='/api/recommendations').length,0);
  assert(!element('page-content').innerHTML.includes('Ranking method'));
  assert(!element('page-content').innerHTML.includes('Export results'));
  const countForm={id:'rec-count-form',reportValidity:()=>true,elements:{namedItem:name=>controls[name]}};
  controls.Make.value='Toyota';
  await emit('submit',form);
  assert.equal(element('rec-count-dialog').open,true);
  assert.equal(requests.filter(r=>r.url==='/api/recommendations').length,0);
  await emit('submit',countForm);
  assert.equal(JSON.parse(requests.at(-1).config.body).topN,7);
  assert.equal(JSON.parse(requests.at(-1).config.body).mode,'model');
  assert(element('rec-results').innerHTML.includes('Top 1 recommended vehicles'));
  assert(element('rec-results').innerHTML.includes('SHAP values'));
  assert(!element('rec-results').innerHTML.includes('<script>unsafe'));
  assert(element('rec-results').innerHTML.includes('&lt;script&gt;unsafe'));
  const snapshot=context.RecommendationUI.getLatestResult();snapshot.results[0].vehicle.Make='mutated';
  assert.equal(context.RecommendationUI.getLatestResult().results[0].vehicle.Make,'Toyota');
  await emit('change',{name:'Make',value:'Honda',dataset:{recPreference:'Make'},closest:()=>form});
  assert.equal(context.RecommendationUI.getLatestResult(),null);
  assert(element('rec-preferences').innerHTML.includes('Civic'));
  assert(element('rec-preferences').innerHTML.includes('value="Corolla"'),'Model choices remain independent, as in the original app');
  assert.equal(element('rec-results').innerHTML,'');
  fail=true;await emit('submit',form);await emit('submit',countForm);
  assert(element('rec-error').textContent.includes('Model unavailable'));
  assert.equal(element('rec-submit').disabled,false);
  const html=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8');
  assert.equal((html.match(/data-page="recommendations"/g)||[]).length,2);
  assert(html.indexOf('js/recommendation-ui.js')<html.indexOf('js/app.js'));
  console.log('PASS: direct route, 12-field onboarding, all-Any guard, API results, safe text, original independent dataset options, Top-N dialog, stale-result invalidation and recoverable error');
})().catch(error=>{console.error(error);process.exitCode=1;});
