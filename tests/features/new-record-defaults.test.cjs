const test=require('node:test'),assert=require('node:assert/strict');

test('every new business draft leaves editable fields empty, including one-choice repair unit and accounting inputs',async()=>{
 const {newWorkDraft,newPurchaseDraft,newMaterialDraft,newStockDraft}=await import('../../src/shared/lib/new-record-defaults.js');
 for(const type of ['测试','加工','维修']){const {request_type,...editable}=newWorkDraft(type);assert.equal(request_type,type);assert(Object.values(editable).every(value=>value===''),'No user-editable work field is preselected');}
 const {repeat_purchase_confirmed,...purchase}=newPurchaseDraft();assert.equal(repeat_purchase_confirmed,false);assert(Object.values(purchase).every(value=>value===''));
 assert(Object.values(newMaterialDraft()).every(value=>value===''));
 const {entry_key,...stock}=newStockDraft('synthetic-entry-id');assert.equal(entry_key,'synthetic-entry-id');assert(Object.values(stock).every(value=>value===''),'Out/return type and quantity require an explicit choice');
});
test('new draft factories reset successful entries without sharing or retaining the previous user input',async()=>{
 const {newWorkDraft,newPurchaseDraft,newMaterialDraft,newStockDraft}=await import('../../src/shared/lib/new-record-defaults.js');
 for(const factory of [()=>newWorkDraft('测试'),newPurchaseDraft,newMaterialDraft,()=>newStockDraft('next-entry')]){const before=factory(),changed=factory();for(const key of Object.keys(changed))changed[key]='user input';assert.deepEqual(factory(),before);assert.notStrictEqual(factory(),before);}
});
test('explicitly choosing a material still fills the latest saved purchase, preserving real zero values and final selected fields',async()=>{
 const {newPurchaseDraft}=await import('../../src/shared/lib/new-record-defaults.js'),{latestMaterialPurchase,purchaseFormFromHistory}=await import('../../src/features/purchases/purchase-autofill.js');
 const old={_id:1,material_name:'示例材料',created_at:'2026-10-01',quantity:1,specification:'旧规格'},latest={_id:2,material_name:'示例材料',created_at:'2026-10-20',quantity:4,unit:'瓶',specification:'示例规格',preferred_supplier:'示例供应商',purchase_purpose:'公用',estimated_price:0,safety_notes:'示例安全事项',remark:'示例备注',review_teacher_username:'old-reviewer',status:'已完成'};
 const found=latestMaterialPurchase('示例材料',[old,latest]);assert.equal(found,latest);
 const form=purchaseFormFromHistory(newPurchaseDraft(),'示例材料',found);for(const key of ['quantity','unit','specification','preferred_supplier','purchase_purpose','estimated_price','safety_notes','remark'])assert.equal(form[key],latest[key]);assert.equal(form.review_teacher_username,'');assert.equal(form.repeat_purchase_confirmed,false);assert(!Object.hasOwn(form,'status'));
});
test('choosing a material without history does not invent quantities, units, prices or a no-specification selection',async()=>{
 const {newPurchaseDraft}=await import('../../src/shared/lib/new-record-defaults.js'),{purchaseFormFromHistory}=await import('../../src/features/purchases/purchase-autofill.js');
 const blank=newPurchaseDraft(),selected=purchaseFormFromHistory(blank,'新示例材料',null);assert.equal(selected.material_name,'新示例材料');for(const key of ['specification','quantity','unit','preferred_supplier','purchase_purpose','estimated_price'])assert.equal(selected[key],'');
 const legacy=purchaseFormFromHistory(blank,'旧示例材料',{quantity:2,unit:'件'});assert.equal(legacy.quantity,2);assert.equal(legacy.unit,'件');assert.equal(legacy.specification,'','Missing historical specification needs a choice rather than a fabricated value');assert.equal(blank.material_name,'');
});
