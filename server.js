'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {previewListing,ListingError} = require('./listing-import');
const publicFiles=new Set(['index.html','style.css','risk.css','app.js','risk-engine.js','risk-data.js','risk-ui.js','listing-link-ui.js','listing-link.css','valuation-ui.js','price-engine.js','valuation.css']);
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
function readBody(req){return new Promise((resolve,reject)=>{
  let size=0,text='';req.on('data',chunk=>{size+=chunk.length;if(size>4096){reject(new ListingError('Request is too large.',413));return;}text+=chunk;});
  req.on('end',()=>{try{resolve(JSON.parse(text));}catch{reject(new ListingError('Send a JSON object containing the advertisement URL.',400));}});req.on('error',reject);
});}
function createServer({preview=previewListing}={}){
  let active=0;const requests=new Map();
  return http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end('Invalid URL');}
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
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
    const name=pathname==='/'?'index.html':pathname.slice(1);
    if(!publicFiles.has(name)){res.writeHead(404);return res.end('Not found');}
    fs.readFile(path.join(__dirname,name),(err,data)=>{
      if(err){res.writeHead(404);return res.end('Not found');}
      res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'})[path.extname(name)]);
      res.end(req.method==='HEAD'?undefined:data);
    });
  });
}
const server=createServer();
if(require.main===module)server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(`Motor Vision: http://localhost:${server.address().port}/?v=price-proposal-1#risk`));
module.exports=server;
module.exports.createServer=createServer;
