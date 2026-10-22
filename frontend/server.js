'use strict';
// Frontend web server: serves the static site and forwards /api/* to the separate backend API.
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({path:path.join(__dirname,'..','.env'),quiet:true});

const root=__dirname;
const apiUrl=new URL(process.env.API_URL||`http://localhost:${process.env.API_PORT||4000}`);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
const hidden=new Set(['server.js','package.json','package-lock.json','node_modules']);

function proxy(req,res){
  const target=new URL(req.url,apiUrl);
  // Keep the browser's Host so the API's same-origin checks and cookies behave as if it were one site.
  const headers={...req.headers,'x-forwarded-for':req.socket.remoteAddress||'','x-forwarded-proto':'http','x-forwarded-host':req.headers.host||''};
  const upstream=(target.protocol==='https:'?https:http).request(target,{method:req.method,headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
  upstream.on('error',()=>{
    if(res.headersSent)return res.destroy();
    res.writeHead(502,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({error:`The Motor Vision API is not reachable at ${apiUrl.origin}. Start it with npm run dev:backend.`}));
  });
  req.pipe(upstream);
}

function createServer(){
  return http.createServer((req,res)=>{
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end('Invalid URL');}
    if(pathname.startsWith('/api/'))return proxy(req,res);
    res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
    const name=pathname==='/'?'index.html':pathname==='/favicon.ico'?'assets/images/favicon.png':pathname.slice(1);
    const file=path.resolve(root,name),type=types[path.extname(file).toLowerCase()];
    if(!file.startsWith(root+path.sep)||!type||hidden.has(name)||hidden.has(name.split('/')[0])||name.split('/').some(part=>part.startsWith('.'))){res.writeHead(404);return res.end('Not found');}
    fs.readFile(file,(err,data)=>{
      if(err){res.writeHead(404);return res.end('Not found');}
      res.setHeader('Content-Type',type);res.end(req.method==='HEAD'?undefined:data);
    });
  });
}
const server=createServer();
if(require.main===module)server.listen(Number(process.env.FRONTEND_PORT||3000),'127.0.0.1',()=>console.log(`Motor Vision website: http://localhost:${server.address().port}/  (API → ${apiUrl.origin})`));
module.exports=server;
module.exports.createServer=createServer;
