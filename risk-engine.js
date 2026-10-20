/* Deterministic frontend baseline. These are prototype rules, not a trained model. */
(function (root) {
  'use strict';
  const MODEL_VERSION = 'rules-0.2.0';
  const CONFIG = Object.freeze({medium: 30, high: 60, currentYear: 2026});
  const required = ['make','model','year','mileage','price','fuel','transmission','engine','location','sellerType','description'];
  const present = value => value !== null && value !== undefined && String(value).trim() !== '';
  function validate(listing) {
    const errors = [];
    if (!listing || typeof listing !== 'object' || Array.isArray(listing)) return ['Each listing must be a JSON object.'];
    for (const key of ['make','model']) if (!present(listing[key]) || typeof listing[key] !== 'string') errors.push(`${key} is required.`);
    for (const key of ['price','fairValue']) if (typeof listing[key] !== 'number' || !Number.isFinite(listing[key]) || listing[key] <= 0 || listing[key] > 1e9) errors.push(`${key} must be a number between 1 and 1,000,000,000.`);
    if (!Number.isInteger(listing.year) || listing.year < 1980 || listing.year > CONFIG.currentYear) errors.push(`year must be between 1980 and ${CONFIG.currentYear}.`);
    if (typeof listing.mileage !== 'number' || !Number.isFinite(listing.mileage) || listing.mileage < 0 || listing.mileage > 2e6) errors.push('mileage must be between 0 and 2,000,000 km.');
    for (const key of ['photoCount','listingAgeDays']) if (present(listing[key]) && (!Number.isInteger(listing[key]) || listing[key] < 0 || listing[key] > 100000)) errors.push(`${key} must be a non-negative integer.`);
    for (const key of ['priceStd','cohortMileageMean','cohortMileageStd']) if (present(listing[key]) && (typeof listing[key] !== 'number' || !Number.isFinite(listing[key]) || listing[key] <= 0)) errors.push(`${key} must be a positive number when provided.`);
    for (const key of ['fuel','transmission','engine','location','sellerType','description','source','datasetVersion']) if (present(listing[key]) && (typeof listing[key] !== 'string' || listing[key].length > (key === 'description' ? 5000 : 150))) errors.push(`${key} must be text within the allowed length.`);
    for (const key of ['make','model']) if (typeof listing[key] === 'string' && listing[key].length > 100) errors.push(`${key} is too long.`);
    if (present(listing.label) && !['ordinary','risky'].includes(listing.label)) errors.push('label must be ordinary or risky when supplied.');
    return errors;
  }
  function assess(listing, now = new Date()) {
    const errors = validate(listing);
    if (errors.length) throw new Error(errors.join(' '));
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const age = Math.max(1, CONFIG.currentYear - listing.year);
    const deviation = (listing.price - listing.fairValue) / listing.fairValue;
    const perYear = listing.mileage / age;
    const completeness = required.filter(key => present(listing[key])).length / required.length;
    const text = String(listing.description || '').toLowerCase();
    const textFlags = [];
    if (/\b(urgent|quick sale|must sell|need cash)\b/i.test(text)) textFlags.push('Urgency language');
    if (/\b(no (?:book|documents|papers)|(?:book|documents|papers) (?:missing|lost|unavailable)|without (?:book|documents|papers))\b/i.test(text)) textFlags.push('Missing-document wording');
    if (/\b(deposit first|advance payment|pay before viewing|off[- ]platform|telegram only|whatsapp only)\b/i.test(text)) textFlags.push('Payment / off-platform cue');
    const reasons = [];
    const add = (feature,points,title,detail,action) => reasons.push({feature,points,title,detail,action});
    if (Math.abs(deviation) > .15) add('priceDeviation',Math.abs(deviation) > .35 ? 25 : 15,'Price differs from its reference',`The asking price is ${(Math.abs(deviation)*100).toFixed(1)}% ${deviation < 0 ? 'below' : 'above'} the supplied cohort fair value. A low price alone does not establish risk.`,'Verify condition and compare similar listings.');
    else add('priceDeviation',0,'Price is near its reference','The asking price is within 15% of the supplied fair value.','Confirm the reference reflects the same model, year and condition.');
    if (perYear < 2500 && age >= 4) add('mileagePerYear',15,'Unusually low annual mileage',`${Math.round(perYear).toLocaleString()} km/year is below the demo threshold for a vehicle of this age.`,'Check service records and odometer history.');
    else if (perYear > 35000) add('mileagePerYear',15,'High annual mileage',`${Math.round(perYear).toLocaleString()} km/year exceeds the demo threshold.`,'Arrange an independent mechanical inspection.');
    else add('mileagePerYear',0,'Annual mileage is within the demo range',`${Math.round(perYear).toLocaleString()} km/year based on the manufacture year.`,'Verify mileage against maintenance records.');
    if (completeness < 1) add('completeness',completeness < .75 ? 20 : 8,'Listing details are incomplete',`${required.filter(key=>!present(listing[key])).join(', ')} ${required.filter(key=>!present(listing[key])).length===1?'is':'are'} missing.`,'Ask for the missing information before making a decision.');
    else add('completeness',0,'Core listing fields are present','All 11 structured and description fields are supplied. Presence does not verify accuracy.','Confirm the details with the vehicle documents.');
    if (!Number.isInteger(listing.photoCount) || listing.photoCount < 3) add('photoCount',10,'Limited photo evidence',present(listing.photoCount)?`Only ${listing.photoCount} photo(s) reported.`:'Photo count has not been supplied.','Request clear exterior, interior, engine and document photos.');
    else add('photoCount',0,'Photo coverage is reported',`${listing.photoCount} photos reported; image contents have not been inspected.`,'Check the photos and see the vehicle in person.');
    if (textFlags.includes('Missing-document wording')) add('documentFlag',25,'Description mentions missing documents','The supplied description contains a missing-document phrase. This is a text match, not a verified document finding.','Verify registration and ownership documents before proceeding.');
    if (textFlags.includes('Payment / off-platform cue')) add('paymentFlag',20,'Payment or off-platform wording','The description includes a payment-first or restricted-contact phrase. Context may change its meaning.','Verify the seller and inspect the vehicle before payment.');
    if (textFlags.includes('Urgency language')) add('urgencyFlag',5,'Urgency language detected','Urgency wording is a weak contextual signal; genuine distressed sales can use the same language.','Take time to verify the other listing details.');
    if (Number.isInteger(listing.listingAgeDays) && listing.listingAgeDays > 120) add('listingAge',5,'Listing has been available for a while',`The supplied listing age is ${listing.listingAgeDays} days.`,'Check whether the listing and asking price are current.');
    const score = Math.min(100,reasons.reduce((sum,reason)=>sum+reason.points,0));
    const category = score >= CONFIG.high ? 'HIGH' : score >= CONFIG.medium ? 'MEDIUM' : 'LOW';
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
    return {
      listingId: present(listing.id) ? String(listing.id).slice(0,100) : 'manual-listing',
      score, category, scoreType:'uncalibrated_rule_points', mode:'rule_based_baseline', modelVersion:MODEL_VERSION,
      datasetVersion:listing.datasetVersion || 'manual-unversioned', preprocessingVersion:'features-0.2.0',
      assessedAt:now.toISOString(),latencyMs:Math.round(elapsed*100)/100,
      features:{priceDeviation:deviation,mileagePerYear:perYear,vehicleAge:age,priceZ:listing.priceStd?(listing.price-listing.fairValue)/listing.priceStd:null,mileageZ:listing.cohortMileageMean&&listing.cohortMileageStd?(listing.mileage-listing.cohortMileageMean)/listing.cohortMileageStd:null,completeness,photoCount:listing.photoCount??null,listingAgeDays:listing.listingAgeDays??null,textFlags},
      reasons:reasons.sort((a,b)=>b.points-a.points),
      thresholds:{medium:CONFIG.medium,high:CONFIG.high},
      limitations:['Prototype rule points, not a calibrated probability or trained AI prediction.','Description matches can be false alarms; seller statements are unverified.','Location and seller-type values are not risk predictors; missing fields affect completeness.','No SHAP, LIME, live scraping or vehicle inspection has been performed.']
    };
  }
  function evaluate(pairs) {
    let tp=0,fp=0,tn=0,fn=0;
    for (const pair of pairs) {
      const positive=pair.result.category!=='LOW';
      if (pair.label === 'risky') { if(positive) tp++; else fn++; }
      if (pair.label === 'ordinary') { if(positive) fp++; else tn++; }
    }
    const ratio=(a,b)=>b?a/b:null;
    return {tp,fp,tn,fn,precision:ratio(tp,tp+fp),recall:ratio(tp,tp+fn),falsePositiveRate:ratio(fp,fp+tn),missedRiskRate:ratio(fn,tp+fn),sampleSize:tp+fp+tn+fn};
  }
  const api={assess,validate,evaluate,MODEL_VERSION,CONFIG};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.RiskEngine=api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
