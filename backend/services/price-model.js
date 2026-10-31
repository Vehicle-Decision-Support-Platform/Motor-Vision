'use strict';
// Runs the trained price models (ml-api/price_worker.py) in a persistent Python process.
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
function pythonPath(){
  if(process.env.PRICE_PYTHON)return process.env.PRICE_PYTHON;
  const candidates=[path.join(process.env.USERPROFILE||'','anaconda3','python.exe'),'/opt/anaconda3/bin/python',path.join(process.env.HOME||'','anaconda3','bin','python')];
  return candidates.find(file=>fs.existsSync(file))||'python3';
}
function start(){
  const child=spawn(pythonPath(),['-u',path.join(__dirname,'../../ml-api/price_worker.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  worker=child;
  child.stderr.on('data',data=>process.stderr.write(data));
  readline.createInterface({input:child.stdout}).on('line',line=>{
    let response;try{response=JSON.parse(line);}catch{return;}
    const entry=pending.get(response.id);if(!entry)return;
    pending.delete(response.id);clearTimeout(entry.timer);
    if(response.error)entry.reject(new Error(response.error));else entry.resolve(response.result);
  });
  child.on('error',()=>{if(worker===child){worker=null;stop(new Error('Could not start the Python price model. Set PRICE_PYTHON to a Python with scikit-learn, xgboost and lightgbm installed.'));}});
  child.on('exit',()=>{if(worker===child){worker=null;stop(new Error('Python price model stopped. Check the API terminal for details.'));}});
}
function send(payload){
  if(pending.size>=4)return Promise.reject(new Error('Price model is busy. Please retry shortly.'));
  if(!worker)start();
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Price prediction timed out.'));const child=worker;worker=null;child?.kill();stop(new Error('Price model worker restarted after timeout.'));},90000);
    pending.set(id,{resolve,reject,timer});
    worker.stdin.write(JSON.stringify({id,...payload})+'\n',error=>{if(error){const entry=pending.get(id);if(entry){clearTimeout(entry.timer);pending.delete(id);entry.reject(error);}}});
  });
}
let options;
function priceOptions(){options??=send({action:'options'}).catch(error=>{options=null;throw error;});return options;}
function predictPrice(listing){return send({listing});}
process.on('exit',()=>worker?.kill());
module.exports={predictPrice,priceOptions};
