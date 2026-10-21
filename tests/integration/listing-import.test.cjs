'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const fs=require('node:fs');
const vm=require('node:vm');
const {validateListingUrl,isPublicIPv4,fetchHtml,parseListing,ListingError}=require('../../backend/services/listing-import');
const {createServer}=require('../../backend/server');
const adUrl='https://ikman.lk/en/ad/suzuki-wagon-r-fx-safety-2025-for-sale-colombo-212';
const riyaUrl='https://riyasewana.com/buy/toyota-aqua-sale-kandy-9871747';
// Invented fixture with the same published field shape; no live seller/contact data.
function ikman(overrides={}){
  const ad={title:'Suzuki Wagon R FX Safety 2025',properties:Object.entries({brand:'Suzuki',model:'Wagon R',model_year:'2025',mileage:'3,000 km',fuel_type:'Petrol',transmission:'Automatic',engine_capacity:'660 cc'}).map(([key,value])=>({key,value})),money:{amount:'Rs 7,650,000'},description:'100,000 km warranty. Call 0771234567 or example@test.invalid. See https://example.invalid',images:{meta:[{src:'one'},{src:'two'}]},location:{name:'Colombo'},adDate:'2026-10-20T12:00:00Z',account:{name:'PRIVATE SELLER NAME'},isMember:true,...overrides};
  return `<script>window.initialData = ${JSON.stringify({adDetail:{data:{ad}},safetyTips:'Pay outside platform, no documents'})};</script><footer>Send a deposit first</footer>`;
}
const preview=parseListing(ikman(),adUrl,new Date('2026-10-21T12:00:00Z'));
assert.equal(preview.listing.mileage,3000);assert.equal(preview.listing.price,7650000);assert.equal(preview.listing.year,2025);
assert.equal(preview.listing.listingAgeDays,1);assert.equal(preview.listing.photoCount,2);
assert.equal(preview.listing.fairValue,undefined);assert.equal(preview.listing.sellerType,undefined);
assert(!JSON.stringify(preview).includes('0771234567'));assert(!JSON.stringify(preview).includes('example@test.invalid'));
assert(!JSON.stringify(preview).includes('PRIVATE SELLER NAME'));assert(!preview.listing.description.includes('deposit first'));
const missing=parseListing(ikman({properties:[{key:'brand',value:'Suzuki'},{key:'model',value:'Wagon R'}]}),adUrl);
assert.equal(missing.listing.mileage,undefined,'Warranty km must never be treated as odometer mileage.');
assert(missing.missingFields.includes('mileage'));
assert.throws(()=>parseListing('<script>window.initialData = alert(1)</script>',adUrl),/readable vehicle details/);
assert.throws(()=>parseListing(ikman({category:{id:999,parentId:998}}),adUrl),/vehicle advertisement/);
assert.throws(()=>parseListing(ikman({type:'to_buy'}),adUrl),/for-sale/);
assert.equal(parseListing(ikman({money:{amount:'Rs 7.65 million'}}),adUrl).listing.price,undefined,'Ambiguous price units must require review.');
assert.equal(parseListing(ikman({money:{amount:'Rs -5000'}}),adUrl).listing.price,undefined);
const zero=parseListing(ikman({properties:[{key:'mileage',value:'0 km'}]}),adUrl);assert.equal(zero.listing.mileage,0);
const riya=parseListing('<h1>Toyota Aqua for Sale in Kandy</h1><table><tr><td>Contact</td><td>PRIVATE NAME</td><td>Price</td><td>Rs. 7,600,000</td></tr><tr><td>Make</td><td>Toyota</td><td>Model</td><td>Aqua</td></tr><tr><td>YOM</td><td>2013</td><td>Mileage (km)</td><td>130000</td></tr><tr><td>Gear</td><td>Automatic</td><td>Fuel Type</td><td>Hybrid</td></tr><tr><td>Engine (cc)</td><td>1490</td></tr><tr><td>Details</td><td>Good condition &amp; service records</td></tr></table>',riyaUrl);
assert.equal(riya.listing.make,'Toyota');assert.equal(riya.listing.year,2013);assert.equal(riya.listing.mileage,130000);assert.equal(riya.listing.location,'Kandy');
assert(!JSON.stringify(riya).includes('PRIVATE NAME'));assert.equal(riya.listing.photoCount,undefined);
for(const bad of ['http://ikman.lk/en/ad/car-1','https://ikman.lk.evil.test/en/ad/car-1','https://evil.test','https://127.0.0.1/en/ad/car-1','https://user:pass@ikman.lk/en/ad/car-1','https://ikman.lk:444/en/ad/car-1','https://ikman.lk/en/ads/cars','https://riyasewana.com','file:///etc/passwd','https://ikman.lk/en/ad/car%2F..%2Fsecret'])assert.throws(()=>validateListingUrl(bad),bad);
assert.equal(validateListingUrl(adUrl+'?tracking=1#x').href,adUrl);
for(const ip of ['127.0.0.1','10.0.0.1','192.168.0.2','172.16.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','::1'])assert(!isPublicIPv4(ip),ip);
assert(isPublicIPv4('104.20.46.87'));
function transport({status=200,headers={'content-type':'text/html'},body=ikman(),hang=false}={}){
  return (url,options,callback)=>{
    assert.equal(url.protocol,'https:');assert.equal(options.headers['Accept-Encoding'],'identity');assert.notEqual(options.rejectUnauthorized,false);
    const req=new EventEmitter();req.end=()=>{queueMicrotask(()=>{const response=new PassThrough();response.statusCode=status;response.headers=headers;callback(response);if(!hang)response.end(body);});};
    req.destroy=error=>{req.emit('error',error);req.emit('close');};
    // Simulate Node's response lifecycle so timers are also tested.
    const original=callback;callback=response=>{response.on('end',()=>req.emit('close'));original(response);};
    return req;
  };
}
async function backend(){
  const lookup=async()=>[{address:'104.20.46.87',family:4}];
  assert.equal((await fetchHtml(adUrl,{lookup,request:transport()})).url,adUrl);
  await assert.rejects(fetchHtml(adUrl,{lookup:async()=>[{address:'127.0.0.1'}],request:()=>{throw Error('must not request');}}),/cannot be fetched/);
  await assert.rejects(fetchHtml(adUrl,{lookup,request:transport({status:302,headers:{location:'https://evil.test/ad'}})}),/individual vehicle ad/);
  await assert.rejects(fetchHtml(adUrl,{lookup,request:transport({status:403})}),/blocked/);
  await assert.rejects(fetchHtml(adUrl,{lookup,request:transport({headers:{'content-type':'application/json'}})}),/advertisement page/);
  await assert.rejects(fetchHtml(adUrl,{lookup,request:transport({body:'x'.repeat(200)}),maxBytes:100}),/too large/);
  await assert.rejects(fetchHtml(adUrl,{lookup,request:transport({hang:true}),timeoutMs:25}),/too long/);
  const server=createServer({preview:async value=>{validateListingUrl(value);return preview;}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const post=(body,headers={})=>fetch(base+'/api/listings/preview',{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
  try{
    assert.equal((await fetch(base)).status,200);
    assert.equal((await fetch(base+'/js/valuation-ui.js')).status,200);
    assert.equal((await fetch(base+'/css/valuation.css')).status,200);
    for(const file of ['.git/config','backend/server.js','backend/services/listing-import.js','package.json','node_modules/x','%E0%A4%A'])assert([400,404].includes((await fetch(base+'/'+file)).status));
    assert.equal((await fetch(base+'/api/listings/preview')).status,405);
    const response=await post(JSON.stringify({url:adUrl}));assert.equal(response.status,200);assert.equal((await response.json()).listing.mileage,3000);
    assert.equal((await post('{')).status,400);assert.equal((await post(JSON.stringify({url:'https://evil.test'}))).status,400);
    assert.equal((await post(JSON.stringify({url:adUrl}),{Origin:'https://evil.test'})).status,403);
    assert.equal((await post('x'.repeat(5000))).status,413);
    assert.equal((await post('{}',{'Content-Type':'text/plain'})).status,415);
  }finally{await new Promise(resolve=>server.close(resolve));}
  console.log('PASS: listing parsing, missing mileage, contact filtering, URL/DNS/redirect guards, fetch limits and HTTP preview API');
}
async function frontend(){
  const elements={},listeners={},storage=new Map();
  const element=id=>elements[id]||={id,innerHTML:'',textContent:'',value:'',classList:{add(){},remove(){},toggle(){}},setAttribute(){},removeAttribute(){},scrollIntoView(){},querySelector(){return null;},closest(){return {classList:{add(){},remove(){}}};},focus(){},elements:{namedItem:key=>element('field-'+key)}};
  const document={getElementById:element,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(type,handler){(listeners[type]||=[]).push(handler);}};
  let response={ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>preview};
  const context={console,document,URL,AbortController,setTimeout,clearTimeout,location:{hash:''},history:{replaceState(){}},addEventListener(){},scrollTo(){},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},FormData:class{constructor(form){this.values=form.values;}[Symbol.iterator](){return Object.entries(this.values)[Symbol.iterator]();}},fetch:async(_url,options)=>{assert.equal(JSON.parse(options.body).url,adUrl);return response;}};
  context.window=context;vm.createContext(context);
  for(const file of ['risk-engine.js','risk-data.js','listing-link-ui.js','risk-ui.js','price-engine.js','valuation-ui.js','app.js'])vm.runInContext(fs.readFileSync(__dirname+'/../../frontend/js/'+file,'utf8'),context);
  assert(element('page-content').innerHTML.includes('listing-link-form'));
  const form=element('listing-link-form'),button=element('fetch-button');form.querySelector=()=>button;form.elements.namedItem=()=>({value:adUrl,focus(){}});
  await listeners.submit[0]({target:form,preventDefault(){}});
  assert(element('page-content').innerHTML.includes('REVIEW BEFORE SCORING'));
  const fairValueInput=element('page-content').innerHTML.match(/<input name="fairValue"[^>]*>/)[0];
  assert(!/\brequired\b/.test(fairValueInput),'An unknown fair value must not trigger the browser required-field popup.');
  assert(fairValueInput.includes('Leave blank if unknown'));
  assert.equal(element('field-mileage').value,'3000');assert.equal(element('field-price').value,'7650000');assert.equal(element('field-fairValue').value,'');
  const assessment={id:'risk-assess-form',values:{...preview.listing,fairValue:'8000000'}};
  listeners.submit[1]({target:assessment,preventDefault(){}});
  assert(element('manual-result').innerHTML.includes('View source ad'));
  const result=context.RiskUI.getResults()[0];assert.equal(result.provenance.sourceUrl,adUrl);assert.equal(result.mode,'rule_based_baseline');assert.equal(result.datasetVersion,'url-import-2026-10-21');
  assert.equal(result.assessmentStatus,'complete');
  listeners.submit[1]({target:{...assessment,values:{...assessment.values,fairValue:'',priceStd:'650000'}},preventDefault(){}});
  const partial=context.RiskUI.getResults()[0];
  assert.equal(partial.assessmentStatus,'partial');assert.equal(partial.features.priceDeviation,null);assert.equal(partial.features.priceZ,null);
  assert(element('manual-result').innerHTML.includes('Partial assessment: price not checked'));
  assert(element('manual-result').innerHTML.includes('Not assessed'));
  assert(!element('manual-result').innerHTML.includes('Price is near its reference'));
  assert(!element('manual-result').innerHTML.includes('NaN'));
  assert.equal(JSON.parse(storage.get('mv-risk-history'))[0].result.assessmentStatus,'partial');
  listeners.click[0]({target:{closest:()=>({dataset:{riskTab:'features',reportContext:'manual'}})}});
  assert(element('manual-result').innerHTML.includes('Reference fair value: <strong>Not supplied</strong>'));
  assert(!element('manual-result').innerHTML.includes('NaN'));
  context.navigate('risk');assert(element('risk-items').innerHTML.includes('PARTIAL'));
  context.navigate('risk-history');assert(element('page-content').innerHTML.includes('PARTIAL'));
  assert(!storage.get('mv-risk-history').includes('0771234567'));
  assert.throws(()=>context.RiskUI.loadFromLink({...preview,sourceUrl:'javascript:alert(1)'}),/invalid listing preview/);
  response={ok:false,headers:{get:()=> 'application/json'},json:async()=>({error:'The listing site blocked this request.'})};
  await listeners.submit[0]({target:form,preventDefault(){}});
  assert(element('listing-link-status').innerHTML.includes('blocked'));assert(element('listing-link-status').innerHTML.includes('Enter details manually'));assert.equal(button.disabled,false);
  response={headers:{get:()=> 'text/html'}};
  await listeners.submit[0]({target:form,preventDefault(){}});assert(element('listing-link-status').innerHTML.includes('Restart'));
  const count=context.RiskUI.getResults().length;
  listeners.reset[0]({target:{id:'risk-assess-form'}});
  listeners.submit[1]({target:{...assessment,values:{...assessment.values,fairValue:'0'}},preventDefault(){}});
  assert.equal(context.RiskUI.getResults().length,count);assert(element('risk-form-error').innerHTML.includes('fairValue'));
  // A late response must not pull the user back after they leave the queue.
  let finish;context.fetch=()=>new Promise(resolve=>{finish=resolve;});
  let loaded=0;context.RiskUI.loadFromLink=()=>{loaded++;};
  const pending=listeners.submit[0]({target:form,preventDefault(){}});
  elements['listing-link-form']={id:'different-form'};
  finish({ok:true,headers:{get:()=> 'application/json'},json:async()=>preview});await pending;
  assert.equal(loaded,0);
  console.log('PASS: fetch/review/form prefilling, optional fair value, partial report/features/queue/history, reset and error/manual fallback');
}
(async()=>{await backend();await frontend();})().catch(error=>{console.error(error);process.exitCode=1;});
