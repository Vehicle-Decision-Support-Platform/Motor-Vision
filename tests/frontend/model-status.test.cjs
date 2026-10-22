'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
async function check(ready){
  const elements=new Map();
  const rows=['lightgbm','logreg','explanations'].map(key=>({dataset:{modelStatus:key}}));
  const detail={};
  const context={console,setTimeout,clearTimeout,
    localStorage:{getItem:()=>null},
    document:{addEventListener(){},getElementById(id){if(!elements.has(id))elements.set(id,{innerHTML:'',insertAdjacentHTML(){}});return elements.get(id);},querySelectorAll(selector){return selector==='[data-model-status]'?rows:selector==='[data-model-status-detail]'?[detail]:[];}},
    fetch:async url=>{assert.equal(url,'/api/risk/status');return {ok:ready,json:async()=>ready?{ready:true,modelVersion:'test-model',capabilities:{lightgbm:true,logreg:true,explanations:true}}:{ready:false,error:'Python stopped'}};}
  };
  vm.createContext(context);
  for(const file of ['risk-engine.js','risk-data.js','risk-ui.js'])vm.runInContext(fs.readFileSync(__dirname+'/../../frontend/js/'+file,'utf8'),context);
  context.RiskUI.render('model-lab');
  await new Promise(resolve=>setImmediate(resolve));
  for(const row of rows)assert.equal(row.textContent,ready?'CONNECTED':'UNAVAILABLE');
  const html=elements.get('page-content').innerHTML;
  assert(html.includes('Logistic Regression'));
  assert(html.includes('NOT IMPLEMENTED'));
  assert(!html.includes('NOT CONNECTED'));
  assert(detail.textContent.includes(ready?'test-model':'Python stopped'));
}
(async()=>{await check(true);await check(false);console.log('PASS: live model status, explanation status, unavailable worker and unimplemented algorithms');})().catch(error=>{console.error(error);process.exitCode=1;});
