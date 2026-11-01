/* Browser-only price-component contracts, demo behavior and supplied-result comparison. */
(function(root){
  'use strict';
  const VERSION='price-0.1.0',YEAR=2026;
  const MODELS=Object.freeze([{id:'xgboost',name:'XGBoost'},{id:'random_forest',name:'Random Forest'},{id:'lightgbm',name:'LightGBM'}]);
  const featureKeys=['make','model','year','mileage','fuel','transmission','engine','bodyType','condition','location','colour'];
  const normalize=value=>String(value??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  const nameKey=value=>normalize(value).replace(/[^a-z0-9]/g,'');
  const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=1e9;
  function text(value,name,max=150,required=false){
    if(value===undefined||value===null||value===''){if(required)throw Error(`${name} is required.`);return '';}
    if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`${name} must be text within ${max} characters.`);
    return value.trim();
  }
  function prepare(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Supply one vehicle listing.');
    const listing={make:text(value.make,'Make',100,true),model:text(value.model,'Model',100,true)};
    if(!Number.isInteger(value.year)||value.year<1980||value.year>YEAR)throw Error(`Enter a manufacture year between 1980 and ${YEAR}.`);
    if(typeof value.mileage!=='number'||!Number.isFinite(value.mileage)||value.mileage<0||value.mileage>2e6)throw Error('Enter mileage between 0 and 2,000,000 km.');
    if(!positive(value.price))throw Error('Enter the seller\'s listed price between LKR 1 and 1,000,000,000.');
    Object.assign(listing,{year:value.year,mileage:value.mileage,price:value.price});
    for(const key of featureKeys.slice(4))listing[key]=text(value[key],key);
    for(const key of ['id','source','datasetVersion'])if(value[key]!==undefined)listing[key]=text(value[key],key);
    return listing;
  }
  function fingerprint(listing){return JSON.stringify(featureKeys.map(key=>[key,['make','model'].includes(key)?nameKey(listing[key]):typeof listing[key]==='number'?listing[key]:normalize(listing[key])]));}
  function demoReference(listing,catalog){
    const make=nameKey(listing.make),model=nameKey(listing.model);
    return catalog.find(v=>nameKey(v.name.split(' ')[0])===make&&[model,make+model].includes(nameKey(v.name)))||null;
  }
  function compare(price,fairValue,thresholdPercent){
    if(!positive(price)||!positive(fairValue))throw Error('Seller price and fair value must be positive LKR amounts.');
    if(typeof thresholdPercent!=='number'||!Number.isFinite(thresholdPercent)||thresholdPercent<0||thresholdPercent>50)throw Error('Classification tolerance must be between 0% and 50%.');
    const difference=price-fairValue,differencePercent=difference/fairValue*100;
    const classification=differencePercent < -thresholdPercent-1e-9?'UNDERPRICED':differencePercent > thresholdPercent+1e-9?'OVERPRICED':'FAIRLY_PRICED';
    return {sellerPrice:price,fairValue,difference,differencePercent,classification,thresholdPercent,
      band:{lower:fairValue*(1-thresholdPercent/100),upper:fairValue*(1+thresholdPercent/100)}};
  }
  function recommendation(classification,isDemo){
    const prefix=isDemo?'Against the illustrative demo reference, ':'Against the supplied model estimate, ';
    return prefix+{
      UNDERPRICED:'the asking price is below the configured band. Review the vehicle further and verify condition, service records and documents before treating the difference as a bargain.',
      FAIRLY_PRICED:'the asking price is within the configured tolerance. Compare similar vehicles and inspect this vehicle; a price match does not establish its condition or authenticity.',
      OVERPRICED:'the asking price is above the configured band. Ask for evidence supporting the price and compare equivalent vehicles before agreeing to it.'
    }[classification];
  }
  function validateBundle(value){
    if(!value||value.schemaVersion!=='price-model-bundle-1'||value.currency!=='LKR')throw Error('Use a price-model-bundle-1 report with LKR currency.');
    const report={schemaVersion:value.schemaVersion,currency:'LKR',vehicle:prepare(value.vehicle)};
    for(const key of ['datasetVersion','preprocessingVersion','splitId'])report[key]=text(value[key],key,150,true);
    if(['your-dataset-version','your-preprocessing-version','your-validation-split-id'].some(v=>Object.values(report).includes(v)))throw Error('Replace template placeholders with actual dataset, preprocessing and split versions.');
    if(value.evaluationSplit!=='validation')throw Error('Model selection requires validation metrics; keep hold-out test results separate.');
    if(!Number.isInteger(value.sampleSize)||value.sampleSize<1)throw Error('Provide a positive validation sample size.');
    report.evaluationSplit='validation';report.sampleSize=value.sampleSize;
    const threshold=value.threshold;
    if(!threshold||!Number.isFinite(threshold.percent)||threshold.percent<0||threshold.percent>50)throw Error('Provide a classification threshold between 0% and 50%.');
    report.threshold={percent:threshold.percent,evidence:text(threshold.evidence,'Threshold error-analysis evidence',2000,true)};
    if(report.threshold.evidence.startsWith('Replace with evidence'))throw Error('Supply actual validation error-analysis evidence for the threshold.');
    if(!Array.isArray(value.models)||value.models.length!==3||new Set(value.models.map(m=>m?.id)).size!==3)throw Error('Provide one result each for XGBoost, Random Forest and LightGBM.');
    report.models=MODELS.map(model=>{
      const item=value.models.find(m=>m?.id===model.id),m=item?.metrics;
      if(!item||!m||!Number.isFinite(m.r2)||m.r2>1||!Number.isFinite(m.rmse)||m.rmse<0||!Number.isFinite(m.mae)||m.mae<0||m.mae>m.rmse+1e-8)throw Error(`${model.name}: supply valid R², RMSE and MAE from the same validation split (RMSE >= MAE).`);
      if(!positive(item.predictedPrice))throw Error(`${model.name}: supply a positive predicted price in LKR.`);
      for(const key of ['datasetVersion','preprocessingVersion','splitId','evaluationSplit'])if(item[key]!==undefined&&item[key]!==report[key])throw Error(`${model.name}: all models must use the declared shared ${key}.`);
      if(item.modelVersion==='your-trained-model-version')throw Error(`${model.name}: supply an actual model version.`);
      return {id:model.id,name:model.name,modelVersion:text(item.modelVersion,'Model version',150,true),metrics:{r2:m.r2,rmse:m.rmse,mae:m.mae},predictedPrice:item.predictedPrice};
    });
    const ranked=[...report.models].sort((a,b)=>a.metrics.rmse-b.metrics.rmse||a.metrics.mae-b.metrics.mae||b.metrics.r2-a.metrics.r2||a.id.localeCompare(b.id));
    report.selectedModelId=ranked[0].id;
    report.selectionRule='Lowest validation RMSE; ties use lower MAE, then higher R², then model ID.';
    report.tied=ranked.slice(1).some(m=>m.metrics.rmse===ranked[0].metrics.rmse&&m.metrics.mae===ranked[0].metrics.mae&&m.metrics.r2===ranked[0].metrics.r2);
    return report;
  }
  function evaluate(value,{catalog=[],mode='demo',bundle=null,thresholdPercent}={}){
    const start=typeof performance!=='undefined'?performance.now():Date.now();
    const listing=prepare(value),isDemo=mode==='demo';
    if(!['demo','model'].includes(mode))throw Error('Choose demo mode or supplied model outputs.');
    let fairValue,modelVersion,datasetVersion,preprocessingVersion,modelName,reference=null,modelPredictions=[],thresholdEvidence='Illustrative preview tolerance; not calibrated from validation errors.',thresholdStatus='demo_unvalidated',splitId=null;
    const age=Math.max(1,YEAR-listing.year),features={vehicleAge:age,mileagePerYear:listing.mileage/age};
    if(isDemo){
      if(thresholdPercent===undefined)thresholdPercent=5;
      reference=demoReference(listing,catalog);
      if(!reference)throw Error('No demo reference is available for this make/model. Import trained-model results for this vehicle or try a supported sample.');
      const conditionFactors={good:1,excellent:1.08,fair:.87};
      features.yearFactor=Math.pow(1.055,listing.year-reference.year);
      features.mileageFactor=Math.max(.5,Math.min(1.25,1+(reference.km-listing.mileage)/500000));
      features.conditionFactor=conditionFactors[normalize(listing.condition)]??1;
      features.conditionAssumedNeutral=!Object.hasOwn(conditionFactors,normalize(listing.condition));
      fairValue=reference.price*features.yearFactor*features.mileageFactor*features.conditionFactor;
      modelVersion='demo-formula-1';datasetVersion='synthetic-price-references-1';preprocessingVersion='price-features-1';modelName='Demo formula';
    }else{
      const report=validateBundle(bundle);
      if(thresholdPercent===undefined)thresholdPercent=report.threshold.percent;
      if(fingerprint(report.vehicle)!==fingerprint(listing))throw Error('The supplied predictions belong to different vehicle features. Import updated model results after editing the vehicle.');
      const selected=report.models.find(m=>m.id===report.selectedModelId);
      fairValue=selected.predictedPrice;modelVersion=selected.modelVersion;modelName=selected.name;
      datasetVersion=report.datasetVersion;preprocessingVersion=report.preprocessingVersion;modelPredictions=report.models;splitId=report.splitId;
      thresholdEvidence=report.threshold.evidence;thresholdStatus=thresholdPercent===report.threshold.percent?'imported_error_analysis':'custom_unvalidated';
    }
    const comparison=compare(listing.price,fairValue,thresholdPercent);
    const end=typeof performance!=='undefined'?performance.now():Date.now();
    return {schemaVersion:'price-result-1',componentVersion:VERSION,currency:'LKR',listing,isDemo,isTrained:false,
      mode:isDemo?'demo_formula':'supplied_model_outputs',modelName,modelVersion,datasetVersion,preprocessingVersion,splitId,
      ...comparison,thresholdStatus,thresholdEvidence,features,reference:reference?{name:reference.name,year:reference.year,mileage:reference.km,price:reference.price,fuel:reference.fuel}:null,
      modelPredictions,recommendation:recommendation(comparison.classification,isDemo),assessedAt:new Date().toISOString(),latencyMs:Math.round((end-start)*100)/100,
      limitations:isDemo?['Synthetic price reference; not a trained AI prediction or current market valuation.','The demo adjusts year, mileage and selected condition only; fuel, transmission, engine, body and location are recorded for model integration.','The classification band is a configurable tolerance, not a confidence interval.']:
        ['Predictions and validation metrics were supplied externally; no training or inference was run in this browser.','Dataset split quality and reported metrics have not been independently verified.','The classification band is not a prediction or confidence interval.']};
  }
  function template(listing){return {schemaVersion:'price-model-bundle-1',currency:'LKR',vehicle:prepare(listing),datasetVersion:'your-dataset-version',preprocessingVersion:'your-preprocessing-version',splitId:'your-validation-split-id',evaluationSplit:'validation',sampleSize:null,threshold:{percent:5,evidence:'Replace with evidence from validation prediction-error analysis.'},models:MODELS.map(m=>({id:m.id,modelVersion:'your-trained-model-version',metrics:{r2:null,rmse:null,mae:null},predictedPrice:null}))};}
  const api={VERSION,YEAR,MODELS,prepare,fingerprint,demoReference,compare,validateBundle,evaluate,template};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PriceEngine=api;
})(globalThis);
