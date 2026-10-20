const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = {};
const element = id => elements[id] ||= { innerHTML: '', textContent: '', value: '', classList: { toggle() {} }, style: {} };
const context = {window:{addEventListener(){}},document: {getElementById: element, querySelectorAll: () => [], addEventListener() {}}, localStorage: {getItem: () => null}, location: {hash: ''}};
context.location.hash='#overview';
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + '/app.js', 'utf8'), context);
assert(element('vehicle-list').innerHTML.includes('Toyota Aqua'));
vm.runInContext("page='compare';compared=[1,2];render()", context);
assert(element('page-content').innerHTML.includes('Honda Vezel'));
Object.entries({'loan-price': 7850000, deposit: 2355000, income: 450000, interest: 14, term: 60}).forEach(([key,value]) => element(key).value = value);
vm.runInContext('calculateLoan()', context);
const monthly = 5495000 * (14/1200) / (1-Math.pow(1+14/1200,-60));
assert(element('loan-result').innerHTML.includes(Math.round(monthly).toLocaleString('en-LK')));
element('interest').value = 0;
vm.runInContext('calculateLoan()', context);
assert(element('loan-result').innerHTML.includes('91,583'));
element('deposit').value = 9000000;
vm.runInContext('calculateLoan()', context);
assert(element('loan-result').innerHTML.includes('must not exceed'));
console.log('PASS: overview, comparison, repayment, zero interest and invalid down payment');

const risk=require('./risk-engine.js');
require('./risk-data.js');
const samples=globalThis.RiskSamples;
assert.equal(risk.assess(samples[0]).category,'LOW');
assert.equal(risk.assess(samples[1]).category,'HIGH');
assert.equal(risk.assess(samples[2]).category,'MEDIUM');
assert.equal(risk.assess(samples[3]).category,'LOW');
const cheap=risk.assess({...samples[0],price:1000000});
assert.equal(cheap.category,'LOW','A low price by itself must not imply high risk.');
assert.equal(cheap.score,25);
const zeroMileage=risk.assess({...samples[0],mileage:0});
assert.equal(zeroMileage.features.completeness,1,'Zero mileage is present, not missing.');
assert.equal(zeroMileage.features.mileagePerYear,0);
assert.equal(risk.assess({...samples[0],year:2026}).features.vehicleAge,1,'Current-year vehicle must not divide by zero.');
assert.equal(risk.assess({...samples[0],priceStd:undefined}).features.priceZ,null);
assert.equal(risk.assess({...samples[0],priceStd:1000000}).features.priceZ,-.15);
assert.throws(()=>risk.assess({...samples[0],fairValue:0}),/fairValue/);
assert.throws(()=>risk.assess({...samples[0],price:NaN}),/price/);
assert.throws(()=>risk.assess({...samples[0],year:2027}),/year/);
assert.throws(()=>risk.assess({...samples[0],mileage:-1}),/mileage/);
assert.throws(()=>risk.assess({...samples[0],description:{}}),/description/);
assert.throws(()=>risk.assess({...samples[0],label:'unverified'}),/label/);
assert.equal(risk.assess({...samples[0],location:'Galle',sellerType:'Dealer'}).score,risk.assess(samples[0]).score,'Location / seller-type values must not influence points.');
const hidden=risk.assess({...samples[0],phone:'0771234567',sellerName:'Example Person'});
assert(!JSON.stringify(hidden).includes('0771234567'));
assert(!JSON.stringify(hidden).includes('Example Person'));
assert.equal(hidden.modelVersion,'rules-0.2.0');
assert.equal(hidden.datasetVersion,'synthetic-listings-v1');
const metrics=risk.evaluate(samples.map(listing=>({label:listing.label,result:risk.assess(listing)})));
assert.deepEqual([metrics.tp,metrics.fp,metrics.tn,metrics.fn],[2,1,3,0]);
assert.equal(metrics.precision,2/3);
assert.equal(metrics.falsePositiveRate,.25);
assert.equal(risk.evaluate([]).recall,null,'Unavailable metrics must not pretend to be zero.');
assert.equal(risk.evaluate([{label:'unknown',result:hidden}]).sampleSize,0);
console.log('PASS: risk categories, bargain handling, feature engineering, input validation, contextual fairness, privacy and evaluation math');

// Render all frontend routes and exercise import/manual-assessment handlers in a DOM stand-in.
// This checks integration and generated content, not browser layout or visual appearance.
const uiElements={},listeners={},storage=new Map();
const uiElement=id=>uiElements[id]||=(
  {id,innerHTML:'',textContent:'',value:'',style:{},classList:{toggle(){},add(){},contains(){return false;}},setAttribute(){},removeAttribute(){},querySelector(){return null;},scrollIntoView(){}}
);
const uiContext={
  console,setTimeout(){return 1;},clearTimeout(){},
  document:{getElementById:uiElement,querySelectorAll:()=>[],addEventListener(type,callback){(listeners[type]||=[]).push(callback);}},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  location:{hash:''},history:{replaceState(){}},
  addEventListener(){},scrollTo(){},
  FormData:class{constructor(form){this.values=form.values;}[Symbol.iterator](){return Object.entries(this.values)[Symbol.iterator]();}}
};
uiContext.window=uiContext;
vm.createContext(uiContext);
for(const filename of ['risk-engine.js','risk-data.js','risk-ui.js','app.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+filename,'utf8'),uiContext);
assert.equal(uiElement('breadcrumb').textContent,'Risk dashboard');
assert(uiElement('risk-report-host').innerHTML.includes('Exact rule contributions'));
assert(uiElement('risk-report-host').innerHTML.includes('HIGH RISK'));
for(const route of ['assess','risk-history','model-lab','risk-data','explore','valuation','compare','affordability','saved']){
  vm.runInContext(`page=${JSON.stringify(route)};render()`,uiContext);
  assert(uiElement('page-content').innerHTML.length>100,route+' must render');
}
assert.throws(()=>uiContext.RiskUI.importRecords('{'),error=>error.name==='SyntaxError');
assert.throws(()=>uiContext.RiskUI.importRecords('[]'),/1 and 50/);
const previousCount=uiContext.RiskUI.getResults().length;
assert.throws(()=>uiContext.RiskUI.importRecords(JSON.stringify([samples[0],{...samples[1],price:0}])),/Record 2/);
assert.equal(uiContext.RiskUI.getResults().length,previousCount,'Invalid batches must not partially replace the queue.');
const imported={...samples[0],make:'<img src=x onerror=alert(1)>',phone:'0771234567'};
assert.equal(uiContext.RiskUI.importRecords(JSON.stringify({datasetVersion:'import-test-v2',listings:[imported]})),1);
assert.equal(uiContext.RiskUI.getResults()[0].datasetVersion,'import-test-v2');
vm.runInContext("page='risk';render()",uiContext);
assert(uiElement('risk-report-host').innerHTML.includes('&lt;img'));
assert(!uiElement('risk-report-host').innerHTML.includes('<img src=x'));
assert(!storage.get('mv-risk-history').includes('0771234567'));
vm.runInContext("page='assess';render()",uiContext);
const form={id:'risk-assess-form',values:Object.fromEntries(Object.entries(samples[0]).map(([k,v])=>[k,String(v)]))};
const submit={target:form,preventDefault(){}};
listeners.submit.forEach(callback=>callback(submit));
assert(uiElement('manual-result').innerHTML.includes('LOW RISK'));
assert.equal(uiContext.RiskUI.getResults().length,2);
const entries=JSON.parse(storage.get('mv-risk-history'));
assert(entries[0].result.datasetVersion.startsWith('manual-'));
assert(!Object.hasOwn(entries[0],'description'));
console.log('PASS: all routes, atomic JSON import, version handoff, escaping, local history and manual-assessment submission');
