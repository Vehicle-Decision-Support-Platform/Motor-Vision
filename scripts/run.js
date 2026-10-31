'use strict';
// One process owns both listeners; Node watch restarts them together.
const backend=require('../backend/server');
const frontend=require('../frontend/server');
const apiPort=Number(process.env.API_PORT||4000);
const frontendPort=Number(process.env.FRONTEND_PORT||3000);
let stopping=false;
function stop(code=0){
  if(stopping)return;
  stopping=true;
  const timeout=setTimeout(()=>process.exit(code),2000);
  Promise.all([backend,frontend].map(server=>new Promise(resolve=>{
    server.close(()=>resolve());
    server.closeAllConnections();
  }))).then(()=>{clearTimeout(timeout);process.exit(code);});
}
for(const server of [backend,frontend])server.on('error',error=>{
  console.error(error.code==='EADDRINUSE'
    ? `Port ${error.port} is already in use. Stop the old frontend/backend terminal with Ctrl+C, then run npm run dev once.`
    : `Could not start Motor Vision: ${error.message}`);
  stop(1);
});
process.on('SIGINT',()=>stop());
process.on('SIGTERM',()=>stop());
backend.listen(apiPort,'127.0.0.1',()=>{
  if(stopping)return;
  console.log(`Motor Vision API: http://localhost:${backend.address().port}/api/health`);
  frontend.listen(frontendPort,'127.0.0.1',()=>console.log(`Motor Vision: http://localhost:${frontend.address().port}/  (Ctrl+C stops both servers)`));
});
