'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
async function check(sessionAvailable){
  const listeners={},dialog={open:false,showModal(){this.open=true;},close(){this.open=false;}},content={innerHTML:'',querySelector:()=>null};
  const context={console,setTimeout,URLSearchParams,
    location:{search:'',pathname:'/',hash:''},history:{replaceState(){}},
    document:{getElementById:id=>id==='auth-dialog'?dialog:id==='auth-content'?content:null,addEventListener(type,callback){(listeners[type]||=[]).push(callback);}},
    fetch:async url=>{if(!sessionAvailable)throw new Error('Accounts offline');return {ok:true,json:async()=>url.endsWith('session')?{user:null}:{google:false,apple:false}};}
  };
  vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/../../frontend/js/auth-ui.js','utf8'),context);
  function exerciseGuestActions(){
    for(const action of ['save','compare','riskAction','priceAction']){
      const button={dataset:{[action]:'test'},matches:()=>true};
      const event={target:{closest:selector=>selector==='button'?button:null},preventDefault(){assert.fail('Guest action blocked');},stopImmediatePropagation(){assert.fail('Guest action intercepted');}};
      for(const callback of listeners.click||[])callback(event);
    }
    for(const form of ['risk-assess-form','listing-link-form','price-form','loan-form']){
      const event={target:{id:form,closest:()=>null},preventDefault(){assert.fail('Guest form blocked');},stopImmediatePropagation(){assert.fail('Guest form intercepted');}};
      for(const callback of listeners.submit||[])callback(event);
    }
    let called=false;context.AuthUI.requireSignIn(()=>{called=true;});assert(called);assert.equal(dialog.open,false);
  }
  exerciseGuestActions();
  await new Promise(resolve=>setImmediate(resolve));
  exerciseGuestActions();
  context.AuthUI.open('login');assert.equal(dialog.open,true);assert(content.innerHTML.includes('Signing in is optional'));
}
(async()=>{await check(true);await check(false);console.log('PASS: guest actions and forms before/after session lookup, offline accounts and optional login');})().catch(error=>{console.error(error);process.exitCode=1;});
