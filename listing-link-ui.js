(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let controller=null;
  function supported(value){
    try{const u=new URL(value),h=u.hostname.replace(/^www\./,'');return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
      (h==='ikman.lk'&&/^\/(en|si|ta)\/ad\/[a-z0-9][a-z0-9-]+\/?$/i.test(u.pathname)||h==='riyasewana.com'&&/^\/buy\/[a-z0-9][a-z0-9-]+-\d+\/?$/i.test(u.pathname));}catch{return false;}
  }
  function form(context='risk',value=''){
    const valuation=context==='valuation',prefix=valuation?'valuation-link':'listing-link';
    return `<form id="${prefix}-form" class="listing-link-form ${valuation?'valuation-link-form':''}"><div class="link-form-heading"><span aria-hidden="true">↗</span><div><h3>${valuation?'Import an ad for price evaluation':'Analyze an ad link'}</h3><p>${valuation?'Fetch the listing and match its vehicle model.':'Bring a vehicle listing into your review.'}</p></div></div><label for="${prefix}-url">Vehicle advertisement URL</label>${valuation?'<div class="listing-link-entry">':''}<input id="${prefix}-url" name="url" type="url" required maxlength="1500" value="${esc(value)}" placeholder="https://ikman.lk/en/ad/…" autocomplete="off" spellcheck="false" aria-describedby="${prefix}-help"><button type="submit" class="primary">Fetch ad details <span aria-hidden="true">→</span></button>${valuation?'</div>':''}<p id="${prefix}-help" class="link-form-help">Ikman · Riyasewana<br>${valuation?'Fetch details → review model & condition → evaluate price':'Fetch details → review → assess risk'}</p><div id="${prefix}-status" role="status" aria-live="polite"></div></form>`;
  }
  async function submit(event){
    const form=event.target;if(!['listing-link-form','valuation-link-form'].includes(form.id))return;event.preventDefault();
    const valuation=form.id==='valuation-link-form',prefix=valuation?'valuation-link':'listing-link';
    const status=document.getElementById(prefix+'-status'),button=form.querySelector('button[type="submit"]'),input=form.elements.namedItem('url');
    if(button.disabled)return;
    const value=input.value.trim();
    if(!supported(value)){status.innerHTML='<p class="form-error">Paste a full HTTPS vehicle ad link from Ikman or Riyasewana.</p>';input.focus();return;}
    controller?.abort();const request=new AbortController();controller=request;
    const timeout=setTimeout(()=>request.abort(),18000);
    button.disabled=true;button.textContent='Reading advertisement…';form.setAttribute('aria-busy','true');
    status.innerHTML=`<p class="link-progress">Reading the vehicle details. You can review them before ${valuation?'price evaluation':'scoring'}.</p>`;
    try{
      const response=await fetch('/api/listings/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:value}),signal:request.signal});
      const contentType=response.headers.get('content-type')||'';
      if(!contentType.includes('application/json'))throw new Error('Restart the Motor Vision dev server to enable ad-link import.');
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not read this advertisement.');
      if(document.getElementById(form.id)!==form)return;
      if(valuation)root.ValuationUI.loadFromLink(data);else root.RiskUI.loadFromLink(data);
    }catch(error){
      if(document.getElementById(form.id)!==form)return;
      const message=error.name==='AbortError'?'The request timed out. Retry or enter the advertisement details manually.':error.message||'Could not reach the server. Please retry.';
      status.innerHTML=`<p class="form-error">${esc(message)}</p><button type="button" class="text-button" ${valuation?'data-valuation-action="manual"':'data-page="assess"'}>Enter details manually →</button>`;
    }finally{
      clearTimeout(timeout);if(controller===request)controller=null;
      if(document.getElementById(form.id)===form){button.disabled=false;button.innerHTML='Fetch ad details <span aria-hidden="true">→</span>';form.removeAttribute('aria-busy');}
    }
  }
  document.addEventListener('submit',submit);
  root.ListingLinkUI={form,supported,cancel(){controller?.abort();controller=null;}};
})(globalThis);
