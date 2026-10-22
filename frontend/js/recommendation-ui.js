/* Component 02: stated preferences -> actual model API -> explainable top-N. */
window.RecommendationUI = (() => {
  let catalogue, optionsRequest, generation=0, latest=null, controller;
  let preferences={},topN=5;
  const byId=id=>document.getElementById(id);
  const esc=value=>String(value??'Not supplied').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=name=>name;
  const number=value=>Number(value).toLocaleString('en',{maximumFractionDigits:1});
  async function api(url,config={}){
    const response=await fetch(url,config);
    let result;try{result=await response.json();}catch{throw new Error('The server returned an unreadable response. Please retry.');}
    if(!response.ok)throw new Error(result.error||'Recommendations could not be loaded.');
    return result;
  }
  function render(){
    return `<div class="recommendation-page"><p class="rec-model-caption">LightGBM Regressor + SHAP | Estimated feature-match scores, not probability or accuracy</p><p id="rec-instructions">Choose your preferences. Select Any for features you do not care about.</p>
      <form id="recommendation-form" class="rec-form" aria-describedby="rec-instructions"><fieldset id="rec-fields" disabled><legend class="rec-sr-only">Vehicle preferences</legend><div id="rec-preferences" class="rec-fields-grid"><p role="status">Loading available preferences?</p></div><div class="rec-form-actions"><button class="primary" type="submit" id="rec-submit">Find Vehicles</button></div></fieldset><p id="rec-status" role="status" aria-live="polite"></p><div id="rec-error" role="alert"></div></form>
      <dialog id="rec-count-dialog" class="rec-count-dialog" aria-labelledby="rec-count-title"><form id="rec-count-form"><h2 id="rec-count-title">How many vehicles do you want?</h2><label class="field">Number of recommendations<input id="rec-top-n" name="topN" type="number" min="1" max="100" step="1" value="${topN}" required></label><div class="rec-form-actions"><button class="primary" type="submit">Show Recommendations</button><button class="secondary" type="button" data-rec-action="cancel-count">Cancel</button></div></form></dialog>
      <section id="rec-results" class="rec-results" aria-live="polite" aria-busy="false"></section></div>`;
  }
  function fieldHTML(field){
    return `<label class="field">${esc(field.name)}<select name="${esc(field.name)}" data-rec-preference="${esc(field.name)}"><option value="Any">Any</option>${field.values.map(value=>`<option value="${esc(value)}" ${String(preferences[field.name])===String(value)?'selected':''}>${esc(value)}</option>`).join('')}</select></label>`;
  }
  function fields(){
    byId('rec-preferences').innerHTML=catalogue.fields.map(fieldHTML).join('');
  }
  async function mount(){
    const host=byId('rec-preferences');if(!host)return;
    const ticket=++generation;
    try{
      if(!catalogue){optionsRequest ||= api('/api/recommendations/options').catch(error=>{optionsRequest=null;throw error;});catalogue=await optionsRequest;}
      if(ticket!==generation||byId('rec-preferences')!==host)return;
      fields();byId('rec-fields').disabled=false;
      byId('rec-top-n').max=Math.min(100,catalogue.rowCount);
      if(latest)showResults(latest);
    }catch(error){if(ticket===generation&&byId('rec-preferences')===host){byId('rec-error').innerHTML=`<p>${esc(error.message)}</p><button class="secondary" type="button" data-rec-action="retry">Retry loading catalogue</button>`;}}
  }
  function invalidate(){
    generation++;controller?.abort();controller=null;latest=null;
    if(byId('rec-count-dialog')?.open)byId('rec-count-dialog').close();
    if(byId('rec-results')){byId('rec-results').setAttribute('aria-busy','false');byId('rec-results').innerHTML='';}
    if(byId('rec-status'))byId('rec-status').textContent='';
    if(byId('rec-error'))byId('rec-error').textContent='';
    if(byId('rec-submit')){byId('rec-submit').disabled=false;byId('rec-submit').textContent='Find Vehicles';}
  }
  function explanation(result,method){
    const influences=method==='model'?[...result.explanation].sort((a,b)=>Math.abs(b.shapContribution)-Math.abs(a.shapContribution)).slice(0,4):[];
    return `${influences.length?`<div class="rec-influences"><h4>Strongest model influences</h4><p>Contributions to the raw model score, not probabilities. Features set to Any enter the model as a neutral match value of 0.5 and can still influence its output.</p>${influences.map(item=>`<div class="rec-influence"><span>${esc(label(item.feature))}</span><div class="rec-bar-track"><span class="${item.shapContribution<0?'negative':'positive'}" style="width:${Math.min(100,Math.abs(item.shapContribution)/Math.max(...influences.map(x=>Math.abs(x.shapContribution)),0.00001)*100)}%"></span></div><strong>${item.shapContribution>0?'+':''}${item.shapContribution.toFixed(4)}</strong></div>`).join('')}</div>`:''}<details class="rec-details"><summary>All vehicle details${method==='model'?' & SHAP values':''}</summary><div class="rec-table-wrap" tabindex="0" role="region" aria-label="Vehicle ${result.rank} feature comparison"><table><caption>Vehicle attributes compared with your preferences</caption><thead><tr><th scope="col">Feature</th><th scope="col">Vehicle</th><th scope="col">Your preference</th><th scope="col">Feature match</th>${method==='model'?'<th scope="col">SHAP</th>':''}</tr></thead><tbody>${result.explanation.map(item=>`<tr><th scope="row">${esc(label(item.feature))}</th><td>${esc(item.vehicleValue)}</td><td>${esc(item.preference)}</td><td>${item.selected?number(item.featureMatch*100)+'%':'Neutral (Any)'}</td>${method==='model'?`<td>${item.shapContribution>0?'+':''}${item.shapContribution.toFixed(5)}</td>`:''}</tr>`).join('')}</tbody></table></div>${method==='model'?`<p class="rec-additivity">SHAP base ${result.shapBaseValue.toFixed(5)} + all contributions = raw score ${result.rawScore.toFixed(5)}. The displayed match is the raw score clipped to 0–1, then multiplied by 100.</p>`:''}</details>`;
  }
  function showResults(response){
    byId('rec-results').innerHTML=`<div class="rec-results-heading"><div><div class="tag">YOUR FEATURE-MATCH SHORTLIST</div><h2 id="rec-results-title" tabindex="-1">Top ${response.returnedCount} recommended vehicles</h2><p>${response.mode==='model'?'Trained LightGBM + SHAP':'Weighted feature-match baseline'} · ${number(response.candidateCount)} catalogue rows considered · ${number(response.latencyMs)} ms analysis time</p></div></div><p class="rec-results-note">Ranked by estimated feature match. Identical records are removed; variants can still share a make, model and year. Scores do not establish real-world recommendation quality.</p><div class="rec-result-grid">${response.results.map(result=>`<article class="rec-result"><div class="rec-result-top"><span class="rec-rank">${String(result.rank).padStart(2,'0')}</span><span class="rec-pill">${esc(result.vehicle['Vehicle Style']||'Vehicle')}</span></div><h3>${esc(result.vehicle.Make)} ${esc(result.vehicle.Model)}</h3><p class="rec-vehicle-meta">${esc(result.vehicle.Year)} · ${esc(result.vehicle['Vehicle Size'])} · ${esc(result.vehicle['Transmission Type'])}</p><div class="rec-match"><div><span>Estimated feature match</span><strong>${number(result.matchPercent)}<small>%</small></strong></div><meter min="0" max="100" value="${result.matchPercent}" aria-label="Estimated feature match for vehicle ${result.rank}">${number(result.matchPercent)}%</meter></div><div class="rec-reasons"><h4>Why this vehicle?</h4><p><strong>Matches:</strong> ${result.matches.length?esc(result.matches.map(label).join(', ')):'No selected features reach a strong match.'}</p><p><strong>Differences:</strong> ${result.differences.length?esc(result.differences.map(label).join(', ')):'No selected features fall below a 50% feature match.'}</p></div>${explanation(result,response.mode)}</article>`).join('')}</div>`;
  }
  function prepare(form){
    preferences={};
    for(const field of catalogue.fields){const value=form.elements.namedItem(field.name).value;preferences[field.name]=value==='Any'?'Any':field.numeric?Number(value):value;}
    invalidate();
    if(Object.values(preferences).every(value=>value==='Any')){byId('rec-error').textContent='Please select at least one preference for meaningful recommendations.';return;}
    byId('rec-top-n').value=String(topN);
    byId('rec-count-dialog').showModal();
  }
  async function submit(form){
    if(!form.reportValidity())return;
    topN=Number(form.elements.namedItem('topN').value);
    if(!Number.isInteger(topN)||topN<1||topN>Math.min(100,catalogue.rowCount))return;
    const payload={preferences:{...preferences},topN,mode:'model'};
    byId('rec-count-dialog').close();
    const host=byId('rec-results'),ticket=++generation;
    controller=new AbortController();byId('rec-submit').disabled=true;byId('rec-submit').textContent='Finding your vehicles…';
    host.setAttribute('aria-busy','true');byId('rec-status').textContent='Ranking the catalogue and preparing your explanations. The first request may take longer while the model loads.';
    try{
      const response=await api('/api/recommendations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      if(ticket!==generation||byId('rec-results')!==host)return;
      latest=response;showResults(response);byId('rec-status').textContent=`${response.returnedCount} vehicles found.`;
      byId('rec-results-title').focus({preventScroll:true});
      host.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    }catch(error){if(ticket===generation&&byId('rec-results')===host){byId('rec-status').textContent='';byId('rec-error').textContent=error.name==='AbortError'?'Request cancelled.':error.message;}}
    finally{if(ticket===generation&&byId('rec-results')===host){host.setAttribute('aria-busy','false');byId('rec-submit').disabled=false;byId('rec-submit').textContent='Find Vehicles';controller=null;}}
  }
  document.addEventListener('submit',event=>{
    if(event.target.id==='recommendation-form'){event.preventDefault();if(catalogue)prepare(event.target);}
    if(event.target.id==='rec-count-form'){event.preventDefault();submit(event.target);}
  });
  document.addEventListener('change',event=>{
    if(!event.target.closest('#recommendation-form'))return;
    const name=event.target.dataset.recPreference;
    if(name){const field=catalogue.fields.find(item=>item.name===name);const value=event.target.value;preferences[name]=value==='Any'?'Any':field.numeric?Number(value):value;}
    invalidate();
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-rec-action]');if(!button)return;
    if(button.dataset.recAction==='retry'){byId('rec-error').textContent='';mount();}
    if(button.dataset.recAction==='cancel-count')byId('rec-count-dialog').close();
  });
  return {render,mount,getLatestResult:()=>latest?JSON.parse(JSON.stringify(latest)):null};
})();
