'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const {once}=require('node:events');
async function freePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const apiPort=await freePort(),frontendPort=await freePort();
  const env={...process.env,API_PORT:String(apiPort),FRONTEND_PORT:String(frontendPort),API_URL:`http://127.0.0.1:${apiPort}`};
  const launch=()=>spawn(process.execPath,[path.join(__dirname,'../../scripts/run.js')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const child=launch();let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  try{
    for(let i=0;i<100&&!output.includes('(Ctrl+C stops both servers)');i++){if(child.exitCode!==null)throw new Error(output);await delay(100);}
    assert(output.includes('(Ctrl+C stops both servers)'),output);
    const home=await fetch(`http://127.0.0.1:${frontendPort}/`);assert.equal(home.status,200);
    const health=await (await fetch(`http://127.0.0.1:${frontendPort}/api/health`)).json();assert.equal(health.ok,true);
    const duplicate=launch();let error='';duplicate.stderr.on('data',chunk=>error+=chunk);duplicate.stdout.resume();
    const [code]=await once(duplicate,'exit');assert.equal(code,1);assert.match(error,/already in use/);
    assert.equal((await fetch(`http://127.0.0.1:${frontendPort}/`)).status,200);
  }finally{if(child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}}
  for(const port of [apiPort,frontendPort]){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});await new Promise(resolve=>server.close(resolve));}
  console.log('PASS: combined website/API startup, proxy, duplicate-port error and both ports released on shutdown');
})().catch(error=>{console.error(error);process.exitCode=1;});
