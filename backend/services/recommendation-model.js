'use strict';
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');
let worker,sequence=0;
const pending=new Map();
function failure(message,status=503){return Object.assign(new Error(message),{status});}
function rejectPending(error){
  for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(error);}
  pending.clear();
}
function closeWorker(){const child=worker;worker=null;child?.kill();rejectPending(failure('Recommendation worker closed.'));}
function start(){
  const conda=path.join(process.env.USERPROFILE||'', 'anaconda3','python.exe');
  const python=process.env.RECOMMENDATION_PYTHON||(fs.existsSync(conda)?conda:'python');
  const child=spawn(python,['-u',path.join(__dirname,'../../ml-api/recommendation_worker.py')],{
    windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',OMP_NUM_THREADS:'2',LOKY_MAX_CPU_COUNT:process.env.LOKY_MAX_CPU_COUNT||'2'}
  });
  worker=child;
  child.stderr.on('data',data=>process.stderr.write(data));
  child.stdin.on('error',()=>{if(worker===child)closeWorker();});
  readline.createInterface({input:child.stdout}).on('line',line=>{
    let response;try{response=JSON.parse(line);}catch{return;}
    const entry=pending.get(response.id);if(!entry)return;
    pending.delete(response.id);clearTimeout(entry.timer);
    if(response.error)entry.reject(failure(response.error,response.status===400?400:503));else entry.resolve(response.result);
  });
  child.on('error',()=>{if(worker===child){worker=null;rejectPending(failure('Could not start recommendation model. Configure RECOMMENDATION_PYTHON with the required Python packages.'));}});
  child.on('exit',()=>{if(worker===child){worker=null;rejectPending(failure('Recommendation model stopped. Check the server terminal.'));}});
}
function request(action,payload){
  if(pending.size>=4)return Promise.reject(failure('Recommendations are busy. Please retry shortly.',429));
  if(!worker)start();
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{closeWorker();},90000);
    pending.set(id,{resolve,reject,timer});
    worker.stdin.write(JSON.stringify({id,action,payload})+'\n',error=>{
      const entry=pending.get(id);if(error&&entry){clearTimeout(entry.timer);pending.delete(id);entry.reject(failure('Could not send request to recommendation model.'));}
    });
  });
}
process.on('exit',()=>worker?.kill());
module.exports={recommend:payload=>request('recommend',payload),options:()=>request('options'),closeWorker};
