const { createHash }=require('node:crypto');
module.exports=function migratePurposes({db,nowISO,addAudit}) {
  const marker='purchase_purposes_v2';
  const rename=value=>value==='个人使用' ? '公用' : value==='项目使用' ? '私用/项目用（出库需采购人审批）' : value;
  return db.transaction(()=>{
    if(db.prepare('SELECT value FROM platform_settings WHERE key=?').get(marker))return {replayed:true,changed:0};
    const rows=db.prepare('SELECT * FROM records').all().map(row=>({...row,data:JSON.parse(row.data_json)}));
    const batches=new Map(rows.filter(row=>row.collection==='lab_material_batches').map(row=>[String(row.id),row.data]));
    const purchases=rows.filter(row=>row.collection==='lab_purchase_requests');
    const purchaseFor=batch=>purchases.find(row=>String(row.id)===String(batch.related_purchase_record_id) || (batch.related_purchase_id && row.public_id===batch.related_purchase_id))?.data;
    const signature=(batch,purpose,owner)=>createHash('sha256').update(JSON.stringify([batch.material_id,batch.material_name,batch.spec,batch.unit,purpose,owner])).digest('hex');
    const when=nowISO(),changed=[];
    for(const row of rows){
      const before=row.data,after={...before};
      if(Object.hasOwn(before,'purchase_purpose'))after.purchase_purpose=rename(before.purchase_purpose);
      if(row.collection==='lab_stock_out_requests' && before.batch_signature){
        const batch=batches.get(String(before.batch_id));
        if(batch){const purchase=purchaseFor(batch),oldPurpose=batch.purchase_purpose || purchase?.purchase_purpose || '',owner=batch.purchaser_username || purchase?.applicant_username || batch.created_by_username;
          if(before.batch_signature===signature(batch,oldPurpose,owner))after.batch_signature=signature(batch,rename(oldPurpose),owner);
        }
      }
      if(JSON.stringify(after)===JSON.stringify(before))continue;
      after.updated_at=when;
      db.prepare('UPDATE records SET data_json=?,updated_at=? WHERE id=?').run(JSON.stringify(after),when,row.id);
      addAudit({headers:{},ip:'local migration'},{username:'系统维护',account_type:'system'},'renamePurchasePurposes',row.collection,String(row.id),before,after);changed.push(String(row.id));
    }
    db.prepare('INSERT INTO platform_settings(key,value,updated_at) VALUES(?,?,?)').run(marker,JSON.stringify({changed:changed.length}),when);
    addAudit({headers:{},ip:'local migration'},{username:'系统维护',account_type:'system'},'renamePurchasePurposes','platform_settings',marker,null,{changed:changed.length,mapping:{个人使用:'公用',项目使用:'私用/项目用（出库需采购人审批）'},stock_quantities_preserved:true});
    return {changed:changed.length};
  }).immediate();
};
