const types=new Set(['pc','mobile','system','unknown']);
function fromUserAgent(value){
 const ua=String(value||'');
 if(/Android|iPhone|iPad|iPod|Mobile|Tablet|IEMobile|Windows Phone|Silk\//i.test(ua))return 'mobile';
 if(/Windows NT|Macintosh|Mac OS X|X11|Linux|CrOS/i.test(ua))return 'pc';
 return 'unknown';
}
function requestClient(req,account){
 if(account?.account_type==='system')return 'system';
 const headers=req?.headers||{},reported=headers['x-platform-client'];
 // Browser metadata is an audit description, never an authorization input.
 if(reported==='pc'||reported==='mobile')return reported;
 if(headers['sec-ch-ua-mobile']==='?1')return 'mobile';
 return fromUserAgent(headers['user-agent']);
}
function auditClientType(row){
 return row.operator_role==='system'?'system':types.has(row.client_type)?row.client_type:fromUserAgent(row.user_agent);
}
module.exports={requestClient,auditClientType};
