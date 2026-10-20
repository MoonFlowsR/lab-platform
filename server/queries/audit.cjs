const { send } = require('../services/sync-response.cjs');
const { auditClientType } = require('../security/audit-client.cjs');
module.exports = function createAuditQuery({db,listRecords,requireAdmin}) {
  return async function listAudit(req,res,payload,account) {
    requireAdmin(account);
    const [{createAdminRecordFilter},{recordMatchesSearch},{actionName,auditObject,clientName}]=await Promise.all([
      import('../../src/shared/lib/admin-record-filter.js'),import('../../src/shared/lib/teacher-filter.js'),import('../../src/shared/lib/audit-labels.js')]);
    const auditLogs=db.prepare('SELECT * FROM audit_logs ORDER BY id DESC').all().map(row=>{const type=auditClientType(row);return {...row,client_type:type,client_label:clientName(type)};});
    const collections=Object.fromEntries(['lab_work_requests','lab_purchase_requests','lab_materials','lab_material_batches','lab_stock_transactions','lab_stock_out_requests','lab_review_logs','lab_attachments'].map(name=>[name,listRecords(name)]));
    const accounts=db.prepare('SELECT id,username FROM accounts').all();
    const filter=createAdminRecordFilter({accounts,auditLogs,collections},{student:String(payload.student||''),teacher:String(payload.teacher||''),range:payload.range||{}});
    const query=String(payload.query||'').slice(0,500);
    const matching=auditLogs.filter(row=>filter.auditMatches(row)&&recordMatchesSearch({...row,_search_text:actionName(row.action)+' '+auditObject(row)+' '+row.client_label},query));
    const limit=payload.all===true?matching.length:payload.limit===3?3:50,offset=Math.max(0,Number(payload.offset)||0);
    const rows=matching.slice(offset,offset+limit).map(row=>({id:row.id,created_at:row.created_at,operator_username:row.operator_username,operator_role:row.operator_role,action:row.action,target_type:row.target_type,target_id:row.target_id,ip_address:row.ip_address,client_type:row.client_type,client_label:row.client_label,object_label:auditObject(row)}));
    return send(req,res,{ok:true,rows,total:matching.length,offset,limit});
  };
};
