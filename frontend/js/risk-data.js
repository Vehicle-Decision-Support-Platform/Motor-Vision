(function(root){
 const base={fuel:'Hybrid',transmission:'Automatic',engine:'1500 cc',location:'Colombo',sellerType:'Individual',source:'Synthetic fixture',datasetVersion:'synthetic-listings-v1',photoCount:8,listingAgeDays:14,priceStd:650000,cohortMileageMean:65000,cohortMileageStd:20000};
 root.RiskSamples=[
  {...base,id:'MV-001',make:'Toyota',model:'Aqua',year:2018,mileage:42500,price:7850000,fairValue:8000000,description:'Regularly serviced. Original registration documents available. Inspection welcome.',label:'ordinary'},
  {...base,id:'MV-002',make:'Honda',model:'Vezel',year:2017,mileage:12500,price:7200000,fairValue:12450000,photoCount:2,listingAgeDays:4,description:'Urgent sale. No book. Deposit first to reserve. WhatsApp only.',label:'risky'},
  {...base,id:'MV-003',make:'Suzuki',model:'Swift',year:2019,mileage:31200,price:8500000,fairValue:6950000,fuel:'Petrol',photoCount:1,engine:'',description:'Quick sale. Excellent condition.',label:'ordinary'},
  {...base,id:'MV-004',make:'Toyota',model:'Prius',year:2016,mileage:76500,price:6500000,fairValue:9200000,photoCount:12,description:'Urgent sale due to relocation. Full service history and ownership documents available. Independent inspection welcome.',label:'ordinary'},
  {...base,id:'MV-005',make:'Nissan',model:'X-Trail',year:2018,mileage:340000,price:13800000,fairValue:13800000,fuel:'Petrol',photoCount:2,engine:'',description:'Papers missing. Advance payment required before viewing.',label:'risky'},
  {...base,id:'MV-006',make:'Suzuki',model:'Wagon R',year:2020,mileage:28500,price:6200000,fairValue:6200000,description:'Service records available. Registration documents supplied. Viewings by appointment.',label:'ordinary'}
 ];
})(globalThis);
