'use strict';
// Backend API server. The website is served separately by frontend/server.js.
const http = require('node:http');
const path = require('node:path');
require('dotenv').config({path:path.join(__dirname,'..','.env'),quiet:true});
const {previewListing,ListingError} = require('./services/listing-import');
const {createAuthService,createUserStore} = require('./services/auth');
const {createMailer} = require('./services/mailer');
const defaultAuth=createAuthService({store:createUserStore(),sendResetEmail:createMailer()});
const {assessRisk}=require('./services/risk-model');
<<<<<<< HEAD
const recommendationModel=require('./services/recommendation-model');
const frontendRoot=path.join(__dirname,'..','frontend');
const publicFiles=new Set([
  'index.html','css/about.css','js/about.js','css/recommendation.css','js/recommendation-ui.js',
  'css/style.css','css/risk.css','css/listing-link.css','css/valuation.css','css/auth.css',
  'js/app.js','js/risk-engine.js','js/risk-data.js','js/risk-ui.js',
  'js/listing-link-ui.js','js/valuation-ui.js','js/price-engine.js','js/auth-ui.js',
  ...['logo.svg','logo-light.svg','logo-mark.svg','logo-mark-light.svg','wordmark-light.svg','favicon.svg','favicon.png','favicon-192.png','apple-touch-icon.png'].map(file=>'assets/images/'+file)
]);
=======
>>>>>>> 974c5c1186c8d412dc56a9f9b41890d904011d40
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
function readBody(req,maxSize=4096){return new Promise((resolve,reject)=>{
  let size=0,text='';req.on('data',chunk=>{size+=chunk.length;if(size>maxSize){reject(new ListingError('Request is too large.',413));return;}text+=chunk;});
  req.on('end',()=>{try{resolve(JSON.parse(text));}catch{reject(new ListingError('Send a JSON object containing the advertisement URL.',400));}});req.on('error',reject);
});}
function createServer({preview=previewListing,auth=defaultAuth,recommendations=recommendationModel}={}){
  let active=0;const requests=new Map();
  return http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end('Invalid URL');}
    if(pathname.startsWith('/api/auth/')){try{return await auth.handle(req,res,pathname);}catch{return json(res,500,{error:'Authentication service is unavailable.'});}}
    if(pathname==='/api/recommendations/options'||pathname==='/api/recommendations'){
      const isOptions=pathname.endsWith('/options'),method=isOptions?'GET':'POST';
      if(req.method!==method){res.setHeader('Allow',method);return json(res,405,{error:`Use ${method}.`});}
      const host=req.headers.host;
      if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host||'')||req.headers.origin&&req.headers.origin!==`http://${host}`||req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'Use the local Motor Vision application.'});
      if(!isOptions){
        try{if(!await auth.userFromRequest(req))return json(res,401,{error:'Sign in to generate vehicle recommendations.'});}catch{return json(res,500,{error:'Authentication service is unavailable.'});}
        if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(res,415,{error:'Send application/json.'});
      }
      try{
        const payload=isOptions?null:await readBody(req,16384);
        if(!isOptions&&(!payload||Array.isArray(payload)||typeof payload!=='object'))return json(res,400,{error:'Send preferences, topN and mode.'});
        return json(res,200,isOptions?await recommendations.options():await recommendations.recommend(payload));
      }catch(error){return json(res,error instanceof ListingError?error.status:[400,429].includes(error.status)?error.status:503,{error:error.message});}
    }
    if(pathname==='/api/risk/assess'){
      if(req.method!=='POST')return json(res,405,{error:'Use POST.'});
      if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(res,415,{error:'Send application/json.'});
      const host=req.headers.host;
      if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host||'')||req.headers.origin&&req.headers.origin!==`http://${host}`||req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'Use the local Motor Vision application.'});
      try{const listing=await readBody(req,16384);if(!listing||Array.isArray(listing)||typeof listing!=='object')return json(res,400,{error:'Send vehicle details.'});return json(res,200,await assessRisk(listing));}
      catch(error){return json(res,error instanceof ListingError?error.status:503,{error:error.message});}
    }
    if(pathname==='/api/listings/preview'){
      if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{error:'Use POST to preview a listing.'});}
      if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(res,415,{error:'Send application/json.'});
      const host=req.headers.host;
      if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host||'')||req.headers.origin&&req.headers.origin!==`http://${host}`||req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'Open this feature from the local Motor Vision application.'});
      const now=Date.now(),ip=req.socket.remoteAddress;
      for(const [key,entry] of requests)if(now-entry.since>60000)requests.delete(key);
      const rate=requests.get(ip)||{since:now,count:0};requests.set(ip,rate);rate.count++;
      if(rate.count>30||active>=4)return json(res,429,{error:'Too many requests. Please wait a moment and retry.'});
      active++;
      try{const body=await readBody(req);const result=await preview(body?.url);json(res,200,result);}
      catch(error){json(res,error instanceof ListingError?error.status:500,{error:error instanceof ListingError?error.message:'Could not import this listing. Try again or enter the details manually.'});}
      finally{active--;}
      return;
    }
    if(pathname==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,service:'motor-vision-api',accounts:auth.store?.name||null});
    return json(res,404,{error:pathname.startsWith('/api/')?'Not found.':'This is the Motor Vision API. Open the website from the frontend server instead.'});
  });
}
const server=createServer();
if(require.main===module)server.listen(Number(process.env.API_PORT||4000),'127.0.0.1',()=>{console.log(`Motor Vision API: http://localhost:${server.address().port}/api/health`);defaultAuth.store.connect().then(()=>console.log(`Accounts: ${defaultAuth.store.name}`)).catch(error=>console.error(`Accounts database connection failed (${defaultAuth.store.name}):`,error.message));});
module.exports=server;
module.exports.createServer=createServer;
