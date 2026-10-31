'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs').promises;
const path=require('node:path');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);

class AuthError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const emailPattern=/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const publicUser=user=>({id:user.id,name:user.name,email:user.email,avatarUrl:user.avatarUrl||'',providers:user.oauthProviders||[],profile:{phone:user.profile?.phone||'',district:user.profile?.district||'',bio:user.profile?.bio||''}});
const sha=value=>crypto.createHash('sha256').update(String(value??'')).digest('hex');
function cookie(req,name){const raw=req.headers.cookie||'';for(const part of raw.split(';')){const [key,...rest]=part.trim().split('=');if(key===name)return decodeURIComponent(rest.join('='));}return '';}
function safeEqual(a,b){const left=Buffer.from(String(a)),right=Buffer.from(String(b));return left.length===right.length&&crypto.timingSafeEqual(left,right);}
function normalizeEmail(value){const email=String(value||'').trim().toLowerCase();if(email.length>254||!emailPattern.test(email))throw new AuthError('Enter a valid email address.');return email;}
function validName(value){const name=String(value||'').trim().replace(/\s+/g,' ');if(name.length<2||name.length>80)throw new AuthError('Name must contain 2 to 80 characters.');return name;}
function validPassword(value){const password=String(value||'');if(password.length<8||password.length>128)throw new AuthError('Password must contain 8 to 128 characters.');return password;}
async function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');const result=await scrypt(password,salt,64);return `scrypt$${salt}$${result.toString('hex')}`;}
async function verifyPassword(password,stored){const [,salt,expected]=String(stored||'').split('$');if(!salt||!expected)return false;const actual=(await scrypt(password,salt,64)).toString('hex');return safeEqual(actual,expected);}
function json(res,status,value,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(value));}
function readJson(req,maxBytes=16384){return new Promise((resolve,reject)=>{let size=0,text='';req.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){reject(new AuthError('Request is too large.',413));req.destroy();return;}text+=chunk;});req.on('end',()=>{try{const value=JSON.parse(text||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw Error();resolve(value);}catch{reject(new AuthError('Send a valid JSON object.'));}});req.on('error',reject);});}
function readForm(req,maxBytes=32768){return new Promise((resolve,reject)=>{let size=0,text='';req.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){reject(new AuthError('Request is too large.',413));req.destroy();return;}text+=chunk;});req.on('end',()=>{try{resolve(Object.fromEntries(new URLSearchParams(text)));}catch{reject(new AuthError('Invalid provider response.'));}});req.on('error',reject);});}
function sameOrigin(req){if(req.headers['sec-fetch-site']==='cross-site')return false;const origin=req.headers.origin;if(!origin)return true;try{return new URL(origin).host===req.headers.host;}catch{return false;}}

const duplicate=()=>new AuthError('An account already exists for this email.',409);
function createFileStore(usersFile){
  async function load(){try{const value=JSON.parse(await fs.readFile(usersFile,'utf8'));return Array.isArray(value)?value:[];}catch(error){if(error.code==='ENOENT')return [];throw error;}}
  async function save(users){await fs.mkdir(path.dirname(usersFile),{recursive:true});const temporary=`${usersFile}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`;await fs.writeFile(temporary,JSON.stringify(users,null,2),{mode:0o600});await fs.rename(temporary,usersFile);}
  return {
    name:'local JSON file',
    connect:async()=>{},
    all:load,
    findByEmail:async email=>(await load()).find(user=>user.email===email)||null,
    findById:async id=>(await load()).find(user=>user.id===id)||null,
    async insert(user){const users=await load();if(users.some(item=>item.email===user.email))throw duplicate();users.push(user);await save(users);},
    async replace(user){const users=await load(),index=users.findIndex(item=>item.id===user.id);if(index<0)throw new AuthError('Account not found.',404);users[index]=user;await save(users);}
  };
}
function createMongoStore(url,{importFile}={}){
  const {MongoClient}=require('mongodb');
  const client=new MongoClient(url,{serverSelectionTimeoutMS:10000});
  const dbName=(url.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/)||[])[1]||'motor_vision';
  const clean=doc=>{if(!doc)return null;const {_id,...user}=doc;return user;};
  let ready=null;
  // Connects once, creates indexes and copies accounts from the old JSON file into an empty collection.
  function users(){return ready||=(async()=>{
    await client.connect();const collection=client.db(dbName).collection('users');
    await collection.createIndex({email:1},{unique:true});await collection.createIndex({id:1},{unique:true});
    if(importFile&&!await collection.countDocuments({},{limit:1})){const local=await createFileStore(importFile).all();if(local.length){await collection.insertMany(local.map(user=>({...user})));console.log(`Imported ${local.length} account(s) from ${path.basename(importFile)} into MongoDB.`);}}
    return collection;
  })().catch(error=>{ready=null;throw error;});}
  return {
    name:`MongoDB (${dbName})`,
    connect:()=>users().then(()=>{}),
    findByEmail:async email=>clean(await (await users()).findOne({email})),
    findById:async id=>clean(await (await users()).findOne({id})),
    async insert(user){try{await (await users()).insertOne({...user});}catch(error){if(error.code===11000)throw duplicate();throw error;}},
    async replace(user){await (await users()).replaceOne({id:user.id},{...user});},
    close:()=>client.close()
  };
}
function createUserStore(env=process.env,usersFile=path.join(__dirname,'..','data','users.json')){const url=(env.DATABASE_URL||'').trim();return url?createMongoStore(url,{importFile:usersFile}):createFileStore(usersFile);}

function createAuthService({
  usersFile=path.join(__dirname,'..','data','users.json'),
  store=createFileStore(usersFile),
  sessionSecret=process.env.SESSION_SECRET||crypto.randomBytes(32).toString('hex'),
  sendResetEmail=async()=>{throw new Error('Email service is not configured.');},
  now=()=>Date.now(),
  appUrl=(process.env.APP_URL||'http://localhost:3000').replace(/\/$/,''),
  oauth={
    google:{clientId:process.env.GOOGLE_CLIENT_ID||'',clientSecret:process.env.GOOGLE_CLIENT_SECRET||''},
    apple:{clientId:process.env.APPLE_CLIENT_ID||'',clientSecret:process.env.APPLE_CLIENT_SECRET||''}
  }
}={}){
  let queue=Promise.resolve();
  const attempts=new Map();
  const oauthStates=new Map();
  function locked(task){const run=queue.then(task,task);queue=run.catch(()=>{});return run;}
  const otpHash=(email,otp)=>crypto.createHmac('sha256',sessionSecret).update(`${email}:${otp}`).digest('hex');
  function passwordVersion(user){return sha(user.passwordHash||`${user.id}:${user.createdAt}`).slice(0,16);}
  function signSession(user){const payload=Buffer.from(JSON.stringify({id:user.id,pv:passwordVersion(user),exp:now()+7*24*60*60*1000})).toString('base64url');const signature=crypto.createHmac('sha256',sessionSecret).update(payload).digest('base64url');return `${payload}.${signature}`;}
  function sessionData(token){const [payload,signature]=String(token||'').split('.');if(!payload||!signature)return null;const expected=crypto.createHmac('sha256',sessionSecret).update(payload).digest('base64url');if(!safeEqual(signature,expected))return null;try{const value=JSON.parse(Buffer.from(payload,'base64url').toString());return value.exp>now()&&typeof value.id==='string'&&typeof value.pv==='string'?value:null;}catch{return null;}}
  function sessionHeader(req,token,maxAge=7*24*60*60){const secure=req.socket.encrypted||req.headers['x-forwarded-proto']==='https'||process.env.COOKIE_SECURE==='true';return `mv_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`;}
  function limited(req,scope,max=10){const key=`${scope}:${req.socket.remoteAddress||'unknown'}`,time=now();const recent=(attempts.get(key)||[]).filter(value=>time-value<15*60*1000);recent.push(time);attempts.set(key,recent);return recent.length>max;}
  async function userFromRequest(req){const session=sessionData(cookie(req,'mv_session'));if(!session)return null;const user=await store.findById(session.id);return user&&safeEqual(session.pv,passwordVersion(user))?publicUser(user):null;}
  async function userRecordFromRequest(req){const session=sessionData(cookie(req,'mv_session'));if(!session)return null;const user=await store.findById(session.id);return user&&safeEqual(session.pv,passwordVersion(user))?user:null;}
  async function register(body){const email=normalizeEmail(body.email),name=validName(body.name),password=validPassword(body.password);return locked(async()=>{if(await store.findByEmail(email))throw duplicate();const user={id:crypto.randomUUID(),name,email,passwordHash:await hashPassword(password),createdAt:new Date(now()).toISOString()};await store.insert(user);return user;});}
  async function login(body){const email=normalizeEmail(body.email),password=String(body.password||'');const user=await store.findByEmail(email);if(!user||!await verifyPassword(password,user.passwordHash))throw new AuthError('Email or password is incorrect.',401);return user;}
  async function forgot(body){const email=normalizeEmail(body.email);let delivery=null;await locked(async()=>{const user=await store.findByEmail(email);if(!user)throw new AuthError('No account found for this email. Check the address or create an account.',404);const otp=String(crypto.randomInt(0,1000000)).padStart(6,'0');user.resetOtpHash=otpHash(email,otp);user.resetExpiresAt=now()+10*60*1000;user.resetAttempts=0;delete user.resetTokenHash;await store.replace(user);delivery={to:email,name:user.name,otp};});try{await sendResetEmail(delivery);}catch(error){console.error('Password reset email failed:',error.message);throw new AuthError('Could not send the reset code. Please try again shortly.',502);}return {message:`A 6-digit reset code has been sent to ${email}.`};}
  async function reset(body){const email=normalizeEmail(body.email),otp=String(body.otp||'').trim();if(!/^\d{6}$/.test(otp))throw new AuthError('Enter the 6-digit code from your email.');const password=validPassword(body.password);return locked(async()=>{const user=await store.findByEmail(email);const invalid=new AuthError('This code is invalid or expired. Request a new code.');if(!user||!user.resetOtpHash||user.resetExpiresAt<now())throw invalid;if(!safeEqual(otpHash(email,otp),user.resetOtpHash)){user.resetAttempts=(user.resetAttempts||0)+1;if(user.resetAttempts>=5){delete user.resetOtpHash;delete user.resetExpiresAt;delete user.resetAttempts;await store.replace(user);throw new AuthError('Too many incorrect codes. Request a new code.');}await store.replace(user);throw invalid;}user.passwordHash=await hashPassword(password);delete user.resetOtpHash;delete user.resetExpiresAt;delete user.resetAttempts;user.passwordChangedAt=new Date(now()).toISOString();await store.replace(user);return user;});}
  function oauthReady(provider){const config=oauth[provider]||{};return Boolean(config.clientId&&config.clientSecret);}
  function redirect(res,location,headers={}){res.writeHead(303,{Location:location,'Cache-Control':'no-store',...headers});res.end();}
  function callbackUrl(provider){return `${appUrl}/api/auth/oauth/${provider}/callback`;}
  function oauthFailure(res,message='Social sign-in could not be completed.'){redirect(res,`${appUrl}/?auth=error&message=${encodeURIComponent(message)}#overview`);}
  function createOauthState(provider){for(const [key,value] of oauthStates)if(value.expiresAt<now())oauthStates.delete(key);const state=crypto.randomBytes(24).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url'),nonce=crypto.randomBytes(24).toString('base64url');oauthStates.set(state,{provider,verifier,nonce,expiresAt:now()+10*60*1000});return {state,verifier,nonce};}
  function consumeOauthState(state,provider){const value=oauthStates.get(String(state||''));oauthStates.delete(String(state||''));if(!value||value.provider!==provider||value.expiresAt<now())throw new AuthError('This sign-in request expired. Please try again.',400);return value;}
  async function tokenRequest(url,values){const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values)});const data=await response.json().catch(()=>({}));if(!response.ok||data.error)throw new AuthError('The identity provider rejected this sign-in request.',401);return data;}
  async function verifyIdToken(token,{jwksUrl,audience,issuer,nonce}){const [encodedHeader,encodedPayload,signature]=String(token||'').split('.');if(!encodedHeader||!encodedPayload||!signature)throw new AuthError('The identity provider returned an invalid identity token.',401);let header,payload;try{header=JSON.parse(Buffer.from(encodedHeader,'base64url'));payload=JSON.parse(Buffer.from(encodedPayload,'base64url'));}catch{throw new AuthError('The identity provider returned an invalid identity token.',401);}if(header.alg!=='RS256'||!header.kid)throw new AuthError('The identity token uses an unsupported signature.',401);const response=await fetch(jwksUrl);if(!response.ok)throw new AuthError('Could not verify the identity provider.',502);const keys=(await response.json()).keys||[],jwk=keys.find(key=>key.kid===header.kid);if(!jwk)throw new AuthError('Could not verify the identity token key.',401);const valid=crypto.verify('RSA-SHA256',Buffer.from(`${encodedHeader}.${encodedPayload}`),crypto.createPublicKey({key:jwk,format:'jwk'}),Buffer.from(signature,'base64url'));const audiences=Array.isArray(payload.aud)?payload.aud:[payload.aud];const issuers=Array.isArray(issuer)?issuer:[issuer];if(!valid||!audiences.includes(audience)||!issuers.includes(payload.iss)||Number(payload.exp||0)*1000<now()||nonce&&payload.nonce!==nonce)throw new AuthError('The identity token could not be verified.',401);return payload;}
  async function oauthIdentity(provider,code,state,providerUser=''){
    const config=oauth[provider],redirectUri=callbackUrl(provider);
    if(provider==='google'){
      const tokens=await tokenRequest('https://oauth2.googleapis.com/token',{code,client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code',code_verifier:state.verifier});
      const claims=await verifyIdToken(tokens.id_token,{jwksUrl:'https://www.googleapis.com/oauth2/v3/certs',audience:config.clientId,issuer:['https://accounts.google.com','accounts.google.com'],nonce:state.nonce});
      if(!claims.email||claims.email_verified===false)throw new AuthError('Google did not provide a verified email address.',401);
      return {email:claims.email,name:claims.name||claims.email.split('@')[0],avatarUrl:claims.picture||''};
    }
    const tokens=await tokenRequest('https://appleid.apple.com/auth/token',{code,client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code'});
    const claims=await verifyIdToken(tokens.id_token,{jwksUrl:'https://appleid.apple.com/auth/keys',audience:config.clientId,issuer:'https://appleid.apple.com',nonce:state.nonce});
    let supplied={};try{supplied=JSON.parse(providerUser||'{}');}catch{}
    const appleName=[supplied.name?.firstName,supplied.name?.lastName].filter(Boolean).join(' ');
    if(!claims.email)throw new AuthError('Apple did not provide an email address.',401);
    return {email:claims.email,name:appleName||claims.email.split('@')[0],avatarUrl:''};
  }
  async function oauthUser(provider,identity){return locked(async()=>{const email=normalizeEmail(identity.email);let user=await store.findByEmail(email);if(user){user.oauthProviders=[...new Set([...(user.oauthProviders||[]),provider])];if(!user.avatarUrl&&identity.avatarUrl)user.avatarUrl=identity.avatarUrl;await store.replace(user);return user;}user={id:crypto.randomUUID(),name:validName(identity.name),email,avatarUrl:identity.avatarUrl||'',oauthProviders:[provider],createdAt:new Date(now()).toISOString()};await store.insert(user);return user;});}
  async function updateProfile(req,body){const user=await userRecordFromRequest(req);if(!user)throw new AuthError('Sign in to update your profile.',401);const name=validName(body.name);const phone=String(body.phone||'').trim(),district=String(body.district||'').trim().replace(/\s+/g,' '),bio=String(body.bio||'').trim();if(phone&&!/^[+0-9 ()-]{7,20}$/.test(phone))throw new AuthError('Enter a valid phone number or leave it blank.');if(district.length>60)throw new AuthError('Location must contain 60 characters or fewer.');if(bio.length>180)throw new AuthError('Bio must contain 180 characters or fewer.');user.name=name;user.profile={phone,district,bio};await store.replace(user);return user;}
  async function startOauth(req,res,provider){if(!oauthReady(provider))return oauthFailure(res,`${provider[0].toUpperCase()+provider.slice(1)} sign-in needs provider credentials in .env.`);const {state,verifier,nonce}=createOauthState(provider);if(provider==='google'){const params=new URLSearchParams({client_id:oauth.google.clientId,redirect_uri:callbackUrl(provider),response_type:'code',scope:'openid email profile',state,nonce,code_challenge:sha(verifier),code_challenge_method:'S256',prompt:'select_account'});/* SHA-256 PKCE must be base64url, not hex. */params.set('code_challenge',crypto.createHash('sha256').update(verifier).digest('base64url'));return redirect(res,`https://accounts.google.com/o/oauth2/v2/auth?${params}`);}const params=new URLSearchParams({client_id:oauth.apple.clientId,redirect_uri:callbackUrl(provider),response_type:'code id_token',response_mode:'form_post',scope:'name email',state,nonce});return redirect(res,`https://appleid.apple.com/auth/authorize?${params}`);}
  async function finishOauth(req,res,provider){try{const values=req.method==='POST'?await readForm(req):Object.fromEntries(new URL(req.url,'http://localhost').searchParams);if(values.error)return oauthFailure(res,'Sign-in was cancelled or denied.');const state=consumeOauthState(values.state,provider);if(!values.code)throw new AuthError('The identity provider did not return an authorization code.');const identity=await oauthIdentity(provider,values.code,state,values.user);const user=await oauthUser(provider,identity);return redirect(res,`${appUrl}/?auth=success#overview`,{'Set-Cookie':sessionHeader(req,signSession(user))});}catch(error){console.error(`${provider} OAuth failed:`,error.message);return oauthFailure(res,error instanceof AuthError?error.message:'Social sign-in could not be completed.');}}
  async function handle(req,res,pathname){
    if(pathname==='/api/auth/oauth-config'&&req.method==='GET')return json(res,200,{google:oauthReady('google'),apple:oauthReady('apple')});
    const oauthMatch=pathname.match(/^\/api\/auth\/oauth\/(google|apple)(\/callback)?$/);if(oauthMatch){const [,provider,isCallback]=oauthMatch;if(isCallback)return finishOauth(req,res,provider);if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});return startOauth(req,res,provider);}
    if(pathname==='/api/auth/session'&&req.method==='GET'){const user=await userFromRequest(req);return json(res,200,{user});}
    if(req.method!=='POST'){res.setHeader('Allow',pathname==='/api/auth/session'?'GET':'POST');return json(res,405,{error:'Method not allowed.'});}
    if(!sameOrigin(req))return json(res,403,{error:'Open this feature from the Motor Vision application.'});
    if(limited(req,pathname))return json(res,429,{error:'Too many attempts. Please wait before trying again.'});
    try{
      const body=await readJson(req);
      if(pathname==='/api/auth/register'){const user=await register(body);return json(res,201,{user:publicUser(user)},{'Set-Cookie':sessionHeader(req,signSession(user))});}
      if(pathname==='/api/auth/login'){const user=await login(body);return json(res,200,{user:publicUser(user)},{'Set-Cookie':sessionHeader(req,signSession(user))});}
      if(pathname==='/api/auth/logout')return json(res,200,{ok:true},{'Set-Cookie':sessionHeader(req,'',0)});
      if(pathname==='/api/auth/profile'){const user=await updateProfile(req,body);return json(res,200,{user:publicUser(user)});}
      if(pathname==='/api/auth/forgot-password')return json(res,200,await forgot(body));
      if(pathname==='/api/auth/reset-password'){await reset(body);return json(res,200,{message:'Password updated. You can now sign in.'},{'Set-Cookie':sessionHeader(req,'',0)});}
      return json(res,404,{error:'Not found.'});
    }catch(error){if(!(error instanceof AuthError))console.error('Auth request failed:',error.message);return json(res,error instanceof AuthError?error.status:500,{error:error instanceof AuthError?error.message:'Authentication request failed.'});}
  }
  return {handle,userFromRequest,register,login,forgot,reset,store};
}

module.exports={AuthError,createAuthService,createFileStore,createMongoStore,createUserStore,hashPassword,verifyPassword};
