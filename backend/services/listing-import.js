'use strict';
const https = require('node:https');
const dns = require('node:dns').promises;
const {createHash} = require('node:crypto');
class ListingError extends Error {
  constructor(message, status=422) { super(message); this.status=status; }
}
function validateListingUrl(value) {
  if(typeof value!=='string'||value.length>1500)throw new ListingError('Paste a supported vehicle advertisement URL.',400);
  let url;try{url=new URL(value.trim());}catch{throw new ListingError('Enter a full HTTPS advertisement URL.',400);}
  const host=url.hostname.toLowerCase().replace(/^www\./,'');
  if(url.protocol!=='https:'||url.username||url.password||url.port||
    !(host==='ikman.lk'&&/^\/(en|si|ta)\/ad\/[a-z0-9][a-z0-9-]+\/?$/i.test(url.pathname)||
      host==='riyasewana.com'&&/^\/buy\/[a-z0-9][a-z0-9-]+-\d+\/?$/i.test(url.pathname)))
    throw new ListingError('Use an individual vehicle ad from ikman.lk or riyasewana.com (HTTPS).',400);
  url.search='';url.hash='';return url;
}
function isPublicIPv4(address) {
  if(!/^(\d{1,3}\.){3}\d{1,3}$/.test(address))return false;
  const [a,b,c,...rest]=address.split('.').map(Number);
  if([a,b,c,...rest].some(n=>n>255))return false;
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||
    a===100&&b>=64&&b<=127||a===192&&(b===168||b===0)||
    a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
// Pin a validated public address; recheck every redirect before making another request.
async function fetchHtml(value, {lookup=dns.lookup, request=https.request, timeoutMs=12000, maxBytes=3*1024*1024}={}) {
  const deadline=Date.now()+timeoutMs;let url=validateListingUrl(value);
  for(let redirect=0;redirect<=3;redirect++) {
    let timer;const remaining=deadline-Date.now();
    if(remaining<=0)throw new ListingError('The listing site took too long to respond. Try again or enter the details manually.',504);
    const addresses=await Promise.race([lookup(url.hostname,{family:4,all:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new ListingError('Could not reach the listing site in time.',504)),remaining);})]).finally(()=>clearTimeout(timer));
    if(!addresses.length||addresses.some(x=>!isPublicIPv4(x.address)))throw new ListingError('This listing address cannot be fetched.',400);
    const result=await new Promise((resolve,reject)=>{
      const req=request(url,{
        method:'GET',headers:{'User-Agent':'MotorVision/1.0 (vehicle listing preview)','Accept':'text/html,application/xhtml+xml','Accept-Encoding':'identity'},
        lookup:(_host,options,callback)=>options.all?callback(null,[{address:addresses[0].address,family:4}]):callback(null,addresses[0].address,4)
      },res=>{
        res.on('error',reject);
        if([301,302,303,307,308].includes(res.statusCode)){res.resume();resolve({redirect:res.headers.location});return;}
        if(res.statusCode!==200){res.resume();reject(new ListingError(res.statusCode===404?'This advertisement was not found or has expired.':res.statusCode===403||res.statusCode===429?'The listing site blocked this request. Open the ad and enter its details manually.':'The listing site could not return this advertisement.',res.statusCode===404?404:502));return;}
        if(!/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(res.headers['content-type']||'')){res.resume();reject(new ListingError('The link did not return an advertisement page.'));return;}
        let size=0;const chunks=[];
        res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes)req.destroy(new ListingError('The advertisement page is too large to import.'));else chunks.push(chunk);});
        res.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8')}));
      });
      const timer=setTimeout(()=>req.destroy(new ListingError('The listing site took too long to respond. Try again or enter details manually.',504)),Math.max(1,deadline-Date.now()));
      req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end();
    });
    if(Object.hasOwn(result,'redirect')){
      if(!result.redirect||redirect===3)throw new ListingError('The listing site redirected too many times.');
      url=validateListingUrl(new URL(result.redirect,url).href);continue;
    }
    return {html:result.html,url:url.href};
  }
}
function decode(value) {
  return String(value??'').replace(/&#(x[\da-f]+|\d+);?/gi,(_,code)=>{
    const n=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';
  }).replace(/&(amp|quot|apos|lt|gt|nbsp);/g,(_,key)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[key]));
}
function text(value) {
  return decode(String(value??'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<\/?(?:p|div|br|li)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,' ')).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
}
function description(value) {
  return text(value).replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[contact removed]')
    .replace(/(?:\+?94[\s().-]*|0)[1-9](?:[\s().-]*\d){8}\b/g,'[contact removed]').slice(0,5000);
}
function number(value) {
  const match=text(value).replace(/,/g,'').match(/^(?:(?:LKR|Rs\.?)\s*)?(-?\d+(?:\.\d+)?)\s*(?:km|cc)?$/i);
  return match?Number(match[1]):undefined;
}
function parseIkman(html) {
  // Parse only the site's JSON state, never executable scripts or unrelated page text.
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const state=match[1].trim().match(/^window\.initialData\s*=\s*([\s\S]*?);?$/);if(!state)continue;
    let ad;try{ad=JSON.parse(state[1]).adDetail?.data?.ad;}catch{continue;}
    if(!ad||!Array.isArray(ad.properties))continue;
    if(ad.category&&ad.category.id!==392&&ad.category.parentId!==391&&ad.category.parent?.id!==391)
      throw new ListingError('Use a vehicle advertisement, rather than a listing in another category.');
    if(ad.type&&ad.type!=='for_sale')throw new ListingError('Use a vehicle for-sale advertisement.');
    const props=Object.fromEntries(ad.properties.filter(p=>p&&typeof p.key==='string').map(p=>[p.key,p.value]));
    const listing={make:text(props.brand),model:text(props.model),year:number(props.model_year),mileage:number(props.mileage),price:number(ad.money?.amount),fuel:text(props.fuel_type),transmission:text(props.transmission),engine:text(props.engine_capacity),condition:text(props.condition),bodyType:text(props.body),location:[ad.location?.name,ad.area?.name].filter(Boolean).map(text).join(', '),description:description(ad.description)};
    if(Array.isArray(ad.images?.meta))listing.photoCount=ad.images.meta.filter(x=>x?.src).length;
    // Membership or a verified badge alone does not establish dealer status.
    if(ad.isAuthDealer===true)listing.sellerType='Dealer';
    return {listing,title:text(ad.title),publishedAt:ad.adDate};
  }
  throw new ListingError('This Ikman page did not expose readable vehicle details. Open the advertisement and enter the details manually.');
}
function parseRiyasewana(html) {
  const fields={},labels={make:'make',model:'model',yom:'year','mileage(km)':'mileage',gear:'transmission','fueltype':'fuel','engine(cc)':'engine',condition:'condition',bodytype:'bodyType',price:'price',details:'description'};
  // Vehicle facts are published in labeled table cells; contact cells are never copied.
  for(const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>text(m[1]));
    for(let i=0;i<cells.length-1;i++){const label=cells[i].replace(/[\s:]/g,'').toLowerCase();if(Object.hasOwn(labels,label))fields[labels[label]]=cells[++i];}
  }
  if(!fields.make||!fields.model)throw new ListingError('This Riyasewana page did not expose readable vehicle details. Open the advertisement and enter the details manually.');
  for(const key of ['year','mileage','price'])if(fields[key]!==undefined)fields[key]=number(fields[key]);
  if(fields.description)fields.description=description(fields.description);
  const heading=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i),title=heading?text(heading[1]):`${fields.make} ${fields.model}`;
  const city=title.match(/\bfor Sale in\s+(.+)$/i);if(city)fields.location=city[1].slice(0,150);
  return {listing:fields,title};
}
function parseListing(html, value, now=new Date()) {
  const url=validateListingUrl(value),source=url.hostname.replace(/^www\./,'')==='ikman.lk'?'Ikman':'Riyasewana';
  const parsed=source==='Ikman'?parseIkman(html):parseRiyasewana(html);
  const listing=Object.fromEntries(Object.entries(parsed.listing).filter(([,v])=>v!==undefined&&v!==''));
  for(const key of ['make','model'])if(typeof listing[key]==='string')listing[key]=listing[key].slice(0,100);
  for(const key of ['engine','location','fuel','transmission','condition','bodyType','sellerType'])if(typeof listing[key]==='string')listing[key]=listing[key].slice(0,150);
  if(parsed.publishedAt&&/^\d{4}-\d{2}-\d{2}T/.test(parsed.publishedAt)){
    const age=(now-new Date(parsed.publishedAt))/86400000;if(Number.isFinite(age)&&age>=0)listing.listingAgeDays=Math.floor(age);
  }
  const bounds={year:[1980,2026],mileage:[0,2000000],price:[1,1000000000],photoCount:[0,100000],listingAgeDays:[0,100000]};
  for(const [key,[min,max]] of Object.entries(bounds))if(listing[key]!==undefined&&(!Number.isFinite(listing[key])||listing[key]<min||listing[key]>max))delete listing[key];
  if(listing.year!==undefined&&!Number.isInteger(listing.year))delete listing.year;
  listing.id='LINK-'+createHash('sha256').update(url.href).digest('hex').slice(0,12);listing.source=source+' (ad link)';listing.datasetVersion='url-import-'+now.toISOString().slice(0,10);
  const missingFields=['make','model','year','mileage','price'].filter(key=>listing[key]===undefined);
  const warnings=['Review the imported fields against the advertisement. Listing claims have not been verified.','Fair value is optional. Add an independent reference to include the price comparison, or leave it blank for a partial assessment.'];
  if(missingFields.length)warnings.push('Some required vehicle details could not be read. Complete the highlighted fields.');
  if(!listing.description)warnings.push('No listing description was available.');
  if(listing.photoCount===undefined)warnings.push('Photo count was not available; confirm it from the ad.');
  return {listing,title:parsed.title.slice(0,200),sourceUrl:url.href,fetchedAt:now.toISOString(),missingFields,warnings};
}
async function previewListing(value) {
  try{const page=await fetchHtml(value);return parseListing(page.html,page.url);}
  catch(error){if(error instanceof ListingError)throw error;throw new ListingError('Could not reach the advertisement. Check your connection, retry, or enter its details manually.',502);}
}
module.exports={ListingError,validateListingUrl,isPublicIPv4,fetchHtml,parseListing,previewListing};
