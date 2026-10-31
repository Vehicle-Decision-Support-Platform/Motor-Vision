(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>'LKR '+Math.round(n).toLocaleString('en-LK');
  const signed=n=>(n>0?'+':n<0?'-':'')+money(Math.abs(n));
  const byId=id=>document.getElementById(id);
  const blank=()=>({make:'',model:'',year:'',mileage:'',fuel:'',transmission:'',engine:'',bodyType:'',condition:'',location:'',colour:'',price:'',threshold:'5'});
  const fieldIds={make:'make',model:'model',year:'year',mileage:'mileage',fuel:'fuel',transmission:'transmission',engine:'engine',bodyType:'bodyType',condition:'condition',location:'location',colour:'colour',price:'valuation-asking-price',threshold:'price-threshold'};
  let catalog=[],draft=blank(),imported=null,lastResult=null,bundle=null,aiReport=null,aiOptions=null,optionsError='',busy=false,mode='ai',tab='evaluate',reportText='';
  const statusLabel=v=>({'FAIR PRICE':'Fair price','POTENTIALLY GOOD DEAL':'Potentially good deal','POTENTIALLY OVERPRICED':'Potentially overpriced'}[v]||v);
  const classLabel=value=>({UNDERPRICED:'Underpriced',FAIRLY_PRICED:'Fairly priced',OVERPRICED:'Overpriced'}[value]);
  function listing(){
    const value={...draft};delete value.threshold;
    for(const key of ['year','mileage','price'])value[key]=String(value[key]).trim()===''?undefined:Number(value[key]);
    value.source=imported?.listing.source||'Manual entry';value.id=imported?.listing.id||'PRICE-MANUAL';
    return PriceEngine.prepare(value);
  }
  function readDraft(){
    const form=byId('valuation-form');if(!form?.elements)return;
    for(const [key,id] of Object.entries(fieldIds)){const field=form.elements.namedItem(id);if(field)draft[key]=field.value;}
  }
  function refresh(){root.ListingLinkUI.cancel();navigate('valuation');}
  function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function input(key,label,type='text',attrs=''){
    return `<label class="field">${label}<input id="${fieldIds[key]}" name="${fieldIds[key]}" type="${type}" value="${esc(draft[key])}" ${attrs}></label>`;
  }
  function select(key,label,values){
    const options=[...values];if(draft[key]&&!options.includes(draft[key]))options.push(draft[key]);
    return `<label class="field">${label}<select id="${key}" name="${key}"><option value="">Not supplied</option>${options.map(v=>`<option value="${esc(v)}" ${v===draft[key]?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;
  }
  const AI_FIELDS=[['make','Brand'],['model','Model'],['year','Year of manufacture'],['engine','Engine capacity (cc)'],['transmission','Gear'],['fuel','Fuel Type'],['mileage','Mileage (km)'],['condition','Condition'],['bodyType','Vehicle Type'],['colour','Colour']];
  const AI_CATEGORY={make:'Brand',transmission:'Gear',fuel:'Fuel Type',condition:'Condition',bodyType:'Vehicle Type',colour:'Colour'};
  const upper=v=>String(v??'').trim().toUpperCase();
  async function loadOptions(){
    try{const response=await fetch('/api/price/options');const raw=await response.json().catch(()=>({}));if(!response.ok)throw Error(raw.error||'The price model API is not available.');aiOptions=raw;optionsError='';}
    catch(error){optionsError=error.message||'The price model API is not available. Start it with npm run dev:backend.';}
    if(mode==='ai'&&byId('valuation-form'))refresh();
  }
  function aiSelect(key,label,values){
    const current=upper(draft[key]),options=[...values];if(current&&!options.includes(current))options.push(current);
    return `<label class="field">${label}<select id="${key}" name="${key}" required><option value="">Select…</option>${options.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;
  }
  function aiFields(){
    if(!aiOptions){if(!optionsError)loadOptions();return optionsError?`<p class="form-error">${esc(optionsError)}</p><button type="button" class="secondary" data-price-action="retry-options">Retry</button>`:'<p class="notice">Loading model inputs…</p>';}
    const defaults={year:'2018',engine:'1500',mileage:'75000'};
    for(const [key,value] of Object.entries(defaults))if(String(draft[key]).trim()==='')draft[key]=value;
    const engine=String(draft.engine).match(/\d+(?:\.\d+)?/);if(engine)draft.engine=engine[0];
    return `<div class="form-grid">${AI_FIELDS.map(([key,label])=>key==='model'?aiSelect('model',label,aiOptions.modelsByBrand[upper(draft.make)]||[]):AI_CATEGORY[key]?aiSelect(key,label,aiOptions.categories[AI_CATEGORY[key]]):key==='year'?input('year',label,'number','required min="1950" max="2030" step="1"'):key==='engine'?input('engine',label,'number','required min="1" max="10000" step="1"'):input('mileage',label,'number','required min="0" max="2000000" step="1"')).join('')}</div><p class="notice">Same inputs as the Hybrid Vehicle Price Advisor. Options come from the cleaned dataset (${aiOptions.records.toLocaleString()} records).</p>`;
  }
  function sourceCard(){
    if(!imported)return '';
    return `<section class="link-review price-source"><div class="link-review-top"><div><div class="tag">AD DETAILS IMPORTED · REVIEW THE INPUTS</div><h2>${esc(imported.title||[draft.make,draft.model].join(' '))}</h2><p>The listing's make, model, year, mileage and available vehicle attributes are filled below. Claims have not been independently verified.</p></div><a href="${esc(imported.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open original ad ↗</a></div><button type="button" class="text-button" data-price-action="manual">Clear import / enter a vehicle manually</button></section>`;
  }
  function emptyResult(){return `<div class="price-empty"><span class="price-empty-symbol" aria-hidden="true">◇</span><div class="tag">YOUR PRICE EVALUATION</div><h2>A benchmark for the asking price.</h2><p>Review the listing and select Evaluate price. The result will show the fair-value reference, LKR and percentage differences, a price classification and a buyer recommendation.</p><div class="price-empty-checks"><span>01 · Vehicle inputs</span><span>02 · Independent price reference</span><span>03 · Price comparison</span></div><p class="notice">${mode==='ai'?'AI mode sends the vehicle details to the trained Random Forest, XGBoost and LightGBM models on the Motor Vision API. The asking price is not a model input.':mode==='demo'?'Demo mode uses synthetic reference prices. XGBoost, Random Forest and LightGBM are not trained or connected here.':'Model mode uses the vehicle-specific predictions supplied with your validation report. This browser does not run model inference.'}</p></div>`;}
  function trainedDetails(p,models){
    const s=p.similar||{};
    return `<p>Model predictions: ${models.map(m=>`${esc(m.name)} ${money(m.predictedPrice)}`).join(' · ')}. Best validation model: ${money(p.globalPrice)}.</p><p>${p.fusionApplied?`Blended ${Math.round(p.globalWeight*100)}% model estimate with ${Math.round((1-p.globalWeight)*100)}% similar-vehicle median (${money(s.price)} from ${s.matches} listings).`:s.price?`Similar-vehicle median ${money(s.price)} from ${s.matches} listings was not blended${p.confidenceWarning?' because it disagrees strongly with the model':''}.`:'No matching make/model listings were found, so only the global model estimate is used.'} Similar-vehicle reliability: ${esc(s.reliability||'UNAVAILABLE')}.</p>${p.testMetrics?`<p>Hold-out test performance: MAE ${money(p.testMetrics.MAE)} · RMSE ${money(p.testMetrics.RMSE)} · R² ${p.testMetrics.R2.toFixed(3)}.</p>`:''}`;
  }
  function resultMarkup(r){
    const type=r.classification.toLowerCase();
    return `<article class="price-report"><div class="price-report-heading"><div><span class="tag">${r.isDemo?'DEMO PRICE EVALUATION':r.isTrained?'AI MODEL PRICE EVALUATION':'SUPPLIED MODEL PRICE EVALUATION'}</span><h2>${esc(r.listing.make)} ${esc(r.listing.model)}</h2><p>${r.listing.year} · ${r.listing.mileage.toLocaleString()} km</p></div><span class="price-class ${type}">${r.isTrained?esc(statusLabel(r.features.prediction.status)):classLabel(r.classification)}</span></div><div class="price-fair-value"><small>${r.isDemo?'Illustrative fair-value reference':r.isTrained?'Estimated fair price from trained model':'Fair price from supplied model output'}</small><strong>${money(r.fairValue)}</strong><span>${esc(r.modelName)} · ${esc(r.modelVersion)}</span></div><div class="price-result-grid"><div><small>Seller's listed price</small><strong>${money(r.sellerPrice)}</strong></div><div><small>Difference · seller − fair</small><strong>${signed(r.difference)}</strong></div><div><small>Percentage difference</small><strong>${r.differencePercent>0?'+':''}${r.differencePercent.toFixed(2)}%</strong></div><div><small>Configured tolerance</small><strong>±${r.thresholdPercent}%</strong></div></div><div class="price-band"><span>Classification band</span><strong>${money(r.band.lower)} – ${money(r.band.upper)}</strong><small>Fair price ± tolerance; this is not a confidence interval.</small></div><section class="price-recommendation"><span class="tag">BUYER RECOMMENDATION</span><p>${esc(r.recommendation)}</p></section><details class="price-method"><summary>Price basis, features & reproducibility</summary><div class="price-method-grid"><div><small>Vehicle age used</small><strong>${r.features.vehicleAge} years</strong></div><div><small>Mileage per year</small><strong>${Math.round(r.features.mileagePerYear).toLocaleString()} km</strong></div><div><small>Dataset</small><strong>${esc(r.datasetVersion)}</strong></div><div><small>Preprocessing</small><strong>${esc(r.preprocessingVersion)}</strong></div></div>${r.reference?`<p>Demo reference: ${esc(r.reference.name)} · ${r.reference.year} · ${r.reference.mileage.toLocaleString()} km · ${money(r.reference.price)}.</p><p>Year factor: ${r.features.yearFactor.toFixed(3)} · mileage factor: ${r.features.mileageFactor.toFixed(3)} · condition factor: ${r.features.conditionFactor.toFixed(2)}.${r.features.conditionAssumedNeutral?' The condition label uses a neutral demo factor; physical condition was not inferred.':''}</p>`:r.isTrained?trainedDetails(r.features.prediction,r.modelPredictions):`<p>Selected from supplied validation metrics: lowest RMSE, then lower MAE and higher R². Predictions must match the current vehicle features. The seller's asking price is excluded from prediction matching.</p>`}<p>Threshold basis: ${esc(r.thresholdEvidence)} ${r.thresholdStatus==='custom_unvalidated'?'The tolerance was changed; the custom value has not been validated.':''}</p><ul>${r.limitations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details><div class="price-report-actions"><button class="secondary" type="button" data-price-action="export-result">Export price result ↗</button><button class="text-button" type="button" data-price-action="export-shared" ${r.isDemo?'disabled title="Supply actual model results before using this reference in other components."':''}>Export shared listing ↗</button></div><div class="price-report-meta"><span>${esc(r.componentVersion)}</span><span>Local comparison: ${r.latencyMs.toFixed(2)} ms</span></div></article>`;
  }
  function evaluationView(){
    const reference=PriceEngine.demoReference(draft,catalog);
    return `${root.ListingLinkUI.form('valuation',imported?.sourceUrl||'')}${sourceCard()}<div class="price-layout"><form id="valuation-form" class="panel price-input-panel"><div class="form-section-title"><span>01</span><div><h2>Vehicle & seller price</h2><p>Review the vehicle details from the advertisement.</p></div></div>${mode==='ai'?aiFields():`<div class="form-grid">${input('make','Make / brand','text','required maxlength="100" placeholder="Toyota"')}${input('model','Model','text','required maxlength="100" placeholder="Aqua"')}${input('year','Manufacture year','number','required min="1980" max="2026" placeholder="e.g. 2020"')}${input('mileage','Mileage (km)','number','required min="0" max="2000000" placeholder="Odometer reading"')}${select('fuel','Fuel type',['Petrol','Diesel','Hybrid','Electric','Plug-in hybrid'])}${select('transmission','Transmission',['Automatic','Manual','CVT','Tiptronic'])}${input('engine','Engine capacity','text','maxlength="150" placeholder="e.g. 1500 cc"')}${select('bodyType','Body type',['Hatchback','Sedan','SUV','Wagon','Van','Pickup','Coupe','MPV'])}${select('condition','Listing condition',['Used','Reconditioned','New','Good','Excellent','Fair'])}${input('location','Location','text','maxlength="150" placeholder="e.g. Colombo"')}</div><p class="notice">Condition is a listing claim or your entry, not an inspection result. Leave unavailable optional details blank.</p>`}<div class="form-section-title"><span>02</span><div><h2>Compare the asking price</h2><p>The seller's price never sets its own fair-value reference.</p></div></div><div class="form-grid">${input('price',"Seller's listed price (LKR)",'number','required min="1" max="1000000000" placeholder="Enter the ad asking price"')}${mode==='ai'?'':input('threshold','Classification tolerance (%)','number','required min="0" max="50" step="0.1" aria-describedby="price-threshold-help"')}</div><p class="notice" id="price-threshold-help">${mode==='ai'?'Fixed ±5% fair-price band, the same rule as the Hybrid Vehicle Price Advisor. The asking price is compared only after prediction.':mode==='demo'?'Default ±5% is an illustrative, configurable preview value; it has not been calibrated from prediction errors.':'The imported report supplies an error-analysis threshold. Changing it marks your tolerance as unvalidated.'}</p><div class="price-reference-note">${mode==='ai'?'Predicted with the vehicle_hybrid_system code: best global model (Random Forest) blended with similar vehicles when they agree.':mode==='demo'?(reference?`Demo reference available: <strong>${esc(reference.name)}</strong>. The demo adjusts year, mileage and selected condition only.`:'The demo supports Toyota Aqua, Honda Vezel, Suzuki Swift, Toyota Prius, Nissan X-Trail and Suzuki Wagon R. Select Load a sample to try the complete flow.'):`Using supplied model outputs. Vehicle feature changes require updated predictions.`}</div><div id="valuation-form-error" role="alert"></div><div class="form-actions"><button type="submit" class="primary" ${busy?'disabled':''}>${busy?'Predicting…':'Evaluate price →'}</button><button type="button" class="text-button" data-price-tab="models">View model comparison ↗</button></div><p class="notice">${mode==='ai'?'Estimates are based on historical seller asking prices, not verified completed sale prices.':mode==='demo'?'Demonstration only. Synthetic references are not current market prices or trained AI outputs.':'Supplied predictions and validation metrics are not independently verified in this interface.'}</p></form><div id="valuation-result" class="price-result-host" aria-live="polite">${lastResult?resultMarkup(lastResult):emptyResult()}</div></div>`;
  }
  function modelsView(){
    const bundle=mode==='ai'?aiReport:importedBundle();
    const selected=bundle?.models.find(m=>m.id===bundle.selectedModelId);
    return `<div class="price-model-summary"><section class="panel"><div class="tag">BEST-MODEL SELECTION</div><h2>${selected?esc(selected.name):'Awaiting model evaluation'}</h2><p>${selected?'Selected within the supplied validation report. No training or inference was performed here.':'This frontend view compares XGBoost, Random Forest and LightGBM. Their evaluation metrics and predictions will appear here when actual results are supplied.'}</p><span class="price-status ${bundle?'supplied':''}">${bundle?'IMPORTED REPORT':'FRONTEND PREVIEW · RESULTS PENDING'}</span></section><section class="panel"><div class="tag">COMPARISON POLICY</div><h2>Compare on the same data.</h2><p>Lowest validation RMSE is primary. Ties use lower MAE, then higher R². Hold-out test data stays separate. ${bundle?.tied?'Metrics are tied; model ID breaks the tie deterministically. This does not establish one model is superior.':''}</p><p class="notice">The report uses one dataset version, preprocessing version and validation split for all three models. These metadata claims are supplied by the report, not independently audited.</p></section></div><section class="panel price-model-table"><div class="price-table-heading"><div><h2>XGBoost · Random Forest · LightGBM</h2><p>R² higher is better; RMSE and MAE lower are better. Errors and predictions are in LKR.</p></div><button type="button" class="secondary" data-price-tab="evaluate">Back to price evaluation</button></div><div class="price-table-scroll"><table><thead><tr><th>Regression model</th><th>R²</th><th>RMSE (LKR)</th><th>MAE (LKR)</th><th>Vehicle prediction</th><th>Status</th></tr></thead><tbody>${PriceEngine.MODELS.map(model=>{const row=bundle?.models.find(m=>m.id===model.id);return `<tr class="${bundle?.selectedModelId===model.id?'price-model-selected':''}"><th>${model.name}${row?`<small>${esc(row.modelVersion)}</small>`:''}</th><td>${row?row.metrics.r2.toFixed(3):'—'}</td><td>${row?row.metrics.rmse.toLocaleString('en-LK',{maximumFractionDigits:2}):'—'}</td><td>${row?row.metrics.mae.toLocaleString('en-LK',{maximumFractionDigits:2}):'—'}</td><td>${row?money(row.predictedPrice):'Not supplied'}</td><td><span class="price-status ${bundle?.selectedModelId===model.id?'supplied':''}">${row?(bundle.selectedModelId===model.id?'SELECTED':'COMPARED'):'RESULTS PENDING'}</span></td></tr>`;}).join('')}</tbody></table></div>${bundle?`<p class="notice">Validation records: ${bundle.sampleSize} · Dataset: ${esc(bundle.datasetVersion)} · Split: ${esc(bundle.splitId)} · Preprocessing: ${esc(bundle.preprocessingVersion)}.</p>`:'<p class="notice">No synthetic R², RMSE or MAE values are displayed. Model performance needs actual experiments.</p>'}</section><details class="panel price-report-import"><summary>Optional: preview supplied model results</summary><h2>Use a saved results file.</h2><p>This optional browser-only preview accepts results for the vehicle entered in the form. Download its template, fill in actual results, then import the JSON file. No server connection is required for this preview.</p><button type="button" class="secondary" data-price-action="template">Download template for current vehicle</button><form id="price-model-form"><label class="field">Model-results JSON<textarea id="price-model-json" rows="8" maxlength="1000000" spellcheck="false" placeholder="Paste a completed price-model-bundle-1 response…">${esc(reportText)}</textarea></label><label class="field">Or read a JSON file<input id="price-model-file" type="file" accept=".json,application/json"><small>Up to 1 MB; file content stays in this browser.</small></label><div id="price-model-status" role="status"></div><button class="primary" type="submit">Apply model results →</button></form></details>`;
  }
  function render(data){
    catalog=data;
    return `<div class="price-toolbar"><nav class="price-tabs" aria-label="Price component views"><button type="button" data-price-tab="evaluate" class="${tab==='evaluate'?'active':''}" aria-pressed="${tab==='evaluate'}">Price evaluation</button><button type="button" data-price-tab="models" class="${tab==='models'?'active':''}" aria-pressed="${tab==='models'}">Model comparison</button></nav><div class="price-toolbar-actions"><span class="price-status ${mode!=='demo'?'supplied':''}">${mode==='ai'?'TRAINED AI MODEL':mode==='model'?'SUPPLIED MODEL OUTPUTS':'DEMO PREVIEW'}</span><button type="button" class="secondary" data-price-action="sample">Load a sample</button></div></div><div class="price-mode-row"><label>Price source <select id="price-mode"><option value="ai" ${mode==='ai'?'selected':''}>Trained AI model · Random Forest, XGBoost, LightGBM</option><option value="demo" ${mode==='demo'?'selected':''}>Demo formula · synthetic references</option><option value="model" ${mode==='model'?'selected':''} ${bundle?'':'disabled'}>Selected ML model · ${bundle?'supplied results':'results pending'}</option></select></label><span>${mode==='ai'?'Live inference on the Motor Vision API using your trained models.':mode==='demo'?'Working preview; no trained AI prediction is claimed.':'Imported predictions are used as supplied; live model inference is not connected.'}</span></div>${tab==='evaluate'?evaluationView():modelsView()}`;
  }
  function loadFromLink(preview){
    if(!preview||!root.ListingLinkUI.supported(preview.sourceUrl)||!preview.listing||typeof preview.listing!=='object'||Array.isArray(preview.listing))throw Error('The server returned an invalid listing preview.');
    draft=blank();const l=preview.listing;
    for(const key of ['make','model','fuel','transmission','engine','bodyType','condition','location'])if(typeof l[key]==='string')draft[key]=l[key].slice(0,150);
    for(const [key,source,min,max] of [['year','year',1980,2026],['mileage','mileage',0,2e6],['price','price',1,1e9]])if(typeof l[source]==='number'&&Number.isFinite(l[source])&&l[source]>=min&&l[source]<=max)draft[key]=String(l[source]);
    imported={title:String(preview.title||'').slice(0,200),sourceUrl:preview.sourceUrl,fetchedAt:preview.fetchedAt,listing:{id:typeof l.id==='string'?l.id:'PRICE-LINK',source:typeof l.source==='string'?l.source:'Ad link'}};
    lastResult=null;bundle=null;aiReport=null;if(mode==='model')mode='ai';tab='evaluate';refresh();toast('Ad details imported. Review the inputs before evaluating.');
  }
  function applyReport(raw){
    if(raw.length>1e6)throw Error('The model report must be smaller than 1 MB.');
    const current=listing(),report=PriceEngine.validateBundle(JSON.parse(raw));
    if(PriceEngine.fingerprint(current)!==PriceEngine.fingerprint(report.vehicle))throw Error('The model report does not match the current vehicle features. Download a current template and supply its predictions.');
    bundle=report;draft.threshold=String(report.threshold.percent);mode='model';lastResult=null;reportText=raw;
  }
  function importedBundle(){return bundle;}
  async function requestPrediction(current){
    const response=await fetch('/api/price/predict',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({make:current.make,model:current.model,year:current.year,engine:Number(current.engine),transmission:current.transmission,fuel:current.fuel,mileage:current.mileage,condition:current.condition,bodyType:current.bodyType,colour:current.colour,price:current.price})});
    let raw;try{raw=await response.json();}catch{raw={};}
    if(!response.ok)throw Error(raw.error||'The price model API is not available. Start it with npm run dev:backend.');
    return raw;
  }
  async function evaluateCurrent(){
    const showError=error=>{byId('valuation-result').innerHTML=emptyResult();byId('valuation-form-error').innerHTML=`<p class="form-error">${esc(error.message)}</p>`;};
    const threshold=mode==='ai'?5:draft.threshold.trim()===''?NaN:Number(draft.threshold);
    let prediction=null;
    try{
      const current=listing();
      if(mode==='ai'){
        busy=true;const button=document.querySelector('#valuation-form [type=submit]');if(button){button.disabled=true;button.textContent='Predicting…';}
        try{prediction=await requestPrediction(current);}finally{busy=false;if(button){button.disabled=false;button.textContent='Evaluate price →';}}
        aiReport={models:prediction.models,selectedModelId:prediction.bestModelId,sampleSize:prediction.validationRows,datasetVersion:'Price_Prediction_Cleaned',splitId:'fixed-train-validation-test',preprocessingVersion:'vehicle_hybrid_system core.py',tied:false};
      }
      lastResult=PriceEngine.evaluate(current,{catalog,mode,bundle,prediction,thresholdPercent:threshold});
      if(imported)lastResult.provenance={sourceUrl:imported.sourceUrl,importedAt:imported.fetchedAt};
      byId('valuation-form-error').innerHTML='';byId('valuation-result').innerHTML=resultMarkup(lastResult);
    }catch(error){lastResult=null;if(byId('valuation-result'))showError(error);}
  }
  document.addEventListener('submit',event=>{
    if(event.target.id==='valuation-form'){
      event.preventDefault();readDraft();lastResult=null;if(busy)return;
      evaluateCurrent();
    }
    if(event.target.id==='price-model-form'){
      event.preventDefault();try{applyReport(byId('price-model-json').value);refresh();toast('Validation report applied. Evaluate the current listing with the selected model output.');}catch(error){byId('price-model-status').innerHTML=`<p class="form-error">${esc(error.message)}</p>`;}
    }
  });
  document.addEventListener('input',event=>{
    if(event.target.form?.id==='valuation-form'){readDraft();lastResult=null;byId('valuation-result').innerHTML=emptyResult();byId('valuation-form-error').innerHTML='';}
    if(event.target.id==='price-model-json')reportText=event.target.value;
  });
  document.addEventListener('change',async event=>{
    if(event.target.form?.id==='valuation-form'){readDraft();lastResult=null;if(mode==='ai'&&event.target.id==='make'){draft.model='';refresh();return;}byId('valuation-result').innerHTML=emptyResult();byId('valuation-form-error').innerHTML='';}
    if(event.target.id==='price-mode'){readDraft();if(event.target.value==='model'&&!bundle)return;mode=event.target.value;lastResult=null;refresh();}
    if(event.target.id==='price-model-file'){const file=event.target.files?.[0];if(!file)return;try{if(file.size>1e6)throw Error('File must be smaller than 1 MB.');reportText=await file.text();if(byId('price-model-json'))byId('price-model-json').value=reportText;}catch(error){if(byId('price-model-status'))byId('price-model-status').innerHTML=`<p class="form-error">${esc(error.message)}</p>`;}}
  });
  document.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.priceTab){readDraft();tab=b.dataset.priceTab;refresh();return;}
    const action=b.dataset.priceAction||b.dataset.valuationAction;if(!action)return;
    if(action==='retry-options'){optionsError='';refresh();return;}
    if(['manual','sample'].includes(action)){imported=null;lastResult=null;bundle=null;aiReport=null;if(mode==='model')mode='ai';tab='evaluate';draft=blank();if(action==='sample'){const v=catalog[0];const [make,...model]=v.name.split(' ');Object.assign(draft,{make,model:model.join(' '),year:String(v.year),mileage:String(v.km),price:String(v.price),fuel:v.fuel,transmission:'Automatic',bodyType:v.body,condition:mode==='ai'?'USED':'Good',colour:'WHITE'});}refresh();return;}
    if(action==='template'){try{readDraft();download(PriceEngine.template(listing()),'motor-vision-price-model-template.json');}catch(error){byId('price-model-status').innerHTML=`<p class="form-error">${esc(error.message)}</p>`;}return;}
    if(action==='export-result'&&lastResult)download(lastResult,`motor-vision-${lastResult.isDemo?'demo-':''}price-result.json`);
    if(action==='export-shared'&&lastResult&&!lastResult.isDemo)download({datasetVersion:lastResult.datasetVersion,listings:[{...lastResult.listing,fairValue:lastResult.fairValue,datasetVersion:lastResult.datasetVersion}],priceEvaluation:lastResult},'motor-vision-shared-price-listing.json');
  });
  root.ValuationUI={render,loadFromLink,getLatestResult:()=>lastResult?JSON.parse(JSON.stringify(lastResult)):null};
})(globalThis);
