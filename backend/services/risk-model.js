'use strict';
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');
let worker,sequence=0;
const pending=new Map();
function stop(error){
  for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(error);}
  pending.clear();
}
function start(){
  const conda=path.join(process.env.USERPROFILE||'', 'anaconda3','python.exe');
  const python=process.env.RISK_PYTHON||(fs.existsSync(conda)?conda:'python');
  const child=spawn(python,['-u',path.join(__dirname,'../../ml-api/component-3-risk/worker.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  worker=child;
  child.stderr.on('data',data=>process.stderr.write(data));
  readline.createInterface({input:child.stdout}).on('line',line=>{
    let response;try{response=JSON.parse(line);}catch{return;}
    const entry=pending.get(response.id);if(!entry)return;
    pending.delete(response.id);clearTimeout(entry.timer);
    if(response.error)entry.reject(new Error(response.error));else entry.resolve(response.result);
  });
  child.on('error',()=>{if(worker===child){worker=null;stop(new Error('Could not start Python model. Set RISK_PYTHON to Anaconda Python 3.13.'));}});
  child.on('exit',()=>{if(worker===child){worker=null;stop(new Error('Python model stopped. Check the server terminal for details.'));}});
}
function assessRisk(listing){
  if(pending.size>=4)return Promise.reject(new Error('Model is busy. Please retry shortly.'));
  if(!worker)start();
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Model assessment timed out.'));const child=worker;worker=null;child?.kill();stop(new Error('Model worker restarted after timeout.'));},90000);
    pending.set(id,{resolve,reject,timer});
    worker.stdin.write(JSON.stringify({id,listing})+'\n',error=>{if(error){const entry=pending.get(id);if(entry){clearTimeout(entry.timer);pending.delete(id);entry.reject(error);}}});
  });
}
process.on('exit',()=>worker?.kill());
module.exports={assessRisk};
