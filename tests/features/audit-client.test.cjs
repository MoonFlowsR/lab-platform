const {test,before}=require('node:test'),assert=require('node:assert/strict');
const Database=require('better-sqlite3'),express=require('express');
const initializeSchema=require('../../server/db/schema.cjs');
const createRecords=require('../../server/db/records.cjs');
const {requestClient,auditClientType}=require('../../server/security/audit-client.cjs');
let browserClient,requestJson,buildExportTable,clientName;
before(async()=>{
 ({browserClient}=await import('../../src/shared/api/client-platform.js'));
 ({requestJson}=await import('../../src/shared/api/api-request.js'));
 ({buildExportTable}=await import('../../src/shared/lib/export-columns.js'));
 ({clientName}=await import('../../src/shared/lib/audit-labels.js'));
});
const pc='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36';
const mobile='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/142.0.0.0 Mobile Safari/537.36';
const mac='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
test('browser identifies phones, tablets, iPad desktop mode and PCs independently of viewport size',()=>{
 for(const [nav,type]of [[{userAgent:pc,maxTouchPoints:10},'pc'],[{userAgent:mobile},'mobile'],[{userAgent:'iPhone Mobile'},'mobile'],[{userAgent:'Android Tablet'},'mobile'],[{userAgent:mac,platform:'MacIntel',maxTouchPoints:5},'mobile'],[{userAgent:mac,platform:'MacIntel',maxTouchPoints:0},'pc'],[{userAgent:'Mozilla/5.0 (X11; Linux x86_64)'},'pc'],[{userAgent:'custom',userAgentData:{mobile:true}},'mobile'],[{},'unknown']])assert.equal(browserClient(nav),type);
});
test('audit uses supported browser metadata, falls back to saved UA, and treats only server actors as system',()=>{
 assert.equal(requestClient({headers:{'x-platform-client':'mobile','user-agent':mac}},{account_type:'student'}),'mobile');
 assert.equal(requestClient({headers:{'sec-ch-ua-mobile':'?1'}},{account_type:'teacher'}),'mobile');
 assert.equal(requestClient({headers:{'x-platform-client':'system','user-agent':pc}},{account_type:'admin'}),'pc');
 assert.equal(requestClient({headers:{'x-platform-client':'pc'}},{account_type:'system'}),'system');
 for(const [ua,type]of [[pc,'pc'],[mobile,'mobile'],['','unknown'],['curl/8','unknown']])assert.equal(auditClientType({user_agent:ua}),type);
 assert.equal(auditClientType({operator_role:'system',user_agent:''}),'system');
 assert.equal(auditClientType({client_type:'mobile',user_agent:mac}),'mobile');
});
test('old audit schema upgrades idempotently without rewriting existing evidence; every new audit stores its terminal',()=>{
 const db=new Database(':memory:');
 try{
  db.exec('CREATE TABLE audit_logs (id INTEGER PRIMARY KEY,operator_username TEXT,operator_role TEXT,action TEXT NOT NULL,target_type TEXT,target_id TEXT,before_json TEXT,after_json TEXT,ip_address TEXT,user_agent TEXT,created_at TEXT NOT NULL)');
  db.prepare('INSERT INTO audit_logs (id,operator_username,operator_role,action,user_agent,created_at,before_json) VALUES (1,?,?,?,?,?,?)').run('example-old','student','login',mobile,'original-time','{"preserved":true}');
  const original=db.prepare('SELECT * FROM audit_logs').get();initializeSchema(db);initializeSchema(db);
  const {client_type,...unchanged}=db.prepare('SELECT * FROM audit_logs WHERE id=1').get();assert.equal(client_type,'');assert.deepEqual(unchanged,original);
  const {addAudit}=createRecords({db,nowISO:()=> '2026-10-20T00:00:00Z'});
  for(const [headers,role,type]of [[{'x-platform-client':'mobile','user-agent':mac},'student','mobile'],[{'user-agent':pc},'teacher','pc'],[{},'system','system'],[{},'admin','unknown']]){
   addAudit({headers,ip:'127.0.0.1'},{username:'example-'+role,account_type:role},'example-operation','records',7,{value:1},{value:2});
   const row=db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1').get();assert.equal(row.client_type,type);assert.equal(row.user_agent,headers['user-agent']||'');assert.deepEqual(JSON.parse(row.before_json),{value:1});assert.deepEqual(JSON.parse(row.after_json),{value:2});
  }
 }finally{db.close();}
});
test('request helper includes the terminal header without changing authentication or business data',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:mac,platform:'MacIntel',maxTouchPoints:5}});
 try{await requestJson('/example',{quantity:2},'test-token',{fetcher:async(url,options)=>{assert.equal(options.headers['X-Platform-Client'],'mobile');assert.equal(options.headers.Authorization,'Bearer test-token');assert.deepEqual(JSON.parse(options.body),{quantity:2});return {ok:true,json:async()=>({ok:true})};}});}
 finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
});
test('real HTTP audit writes, administrator search, pagination and Excel use the same recorded terminal',async()=>{
 const db=new Database(':memory:');initializeSchema(db);const now='2026-10-20T00:00:00Z';
 db.prepare('INSERT INTO accounts(username,display_name,account_type,status,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('example-admin','示例管理员','admin','active','unused',now,now);
 const account=db.prepare('SELECT * FROM accounts').get(),service=createRecords({db,nowISO:()=>now}),app=express();app.use(express.json());
 const query=require('../../server/queries/audit.cjs')({...service,db,requireAdmin:actor=>{if(actor.account_type!=='admin')throw Error('admin required');}});
 app.post('/operate',(req,res)=>{service.addAudit(req,account,req.body.action,'accounts',account.id,null,{username:account.username});res.json({ok:true});});
 app.post('/logs',(req,res,next)=>{query(req,res,req.body,req.body.nonAdmin?{...account,account_type:'teacher'}:account).catch(next);});
 app.use((error,req,res,next)=>{void next;res.status(403).json({message:error.message});});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const post=(route,body,headers={})=>fetch(`http://127.0.0.1:${server.address().port}${route}`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 try{
  for(const [action,headers]of [['login',{'user-agent':pc}],['initializeMaterialStock',{'user-agent':mobile}],['createHelpMessage',{'user-agent':mac,'x-platform-client':'mobile'}],['deleteAttachment',{'user-agent':'unrecognized'}]])assert.equal((await post('/operate',{action},headers)).status,200);
  const first=await(await post('/logs',{})).json();assert.equal(first.total,4);assert.equal(first.rows.length,4);assert.equal(first.limit,10);
  const all=await(await post('/logs',{all:true})).json();assert.equal(all.rows.length,4);assert(all.rows.every(row=>!Object.hasOwn(row,'user_agent')&&!Object.hasOwn(row,'after_json')));
  const selected=await(await post('/logs',{query:'移动端',all:true})).json();assert.equal(selected.total,2);assert(selected.rows.every(row=>row.client_type==='mobile'&&row.client_label==='移动端'));
  const pcOnly=await(await post('/logs',{query:'PC端',all:true})).json();assert.equal(pcOnly.total,1);assert.equal(pcOnly.rows[0].client_label,'PC端');
  assert.equal((await post('/logs',{nonAdmin:true})).status,403);
  const table=buildExportTable('audit',all.rows),index=table.headers.indexOf('操作端');assert(index>=0);assert.deepEqual(table.rows.map(row=>row[index]),all.rows.map(row=>clientName(row.client_type)));
  for(let index=0;index<21;index++)service.addAudit({headers:{'user-agent':pc}},account,'login','accounts',account.id,null,{username:account.username});
  const pages=[];
  for(const offset of [0,10,20]){const page=await(await post('/logs',{offset,limit:9999})).json();assert.equal(page.limit,10);assert.equal(page.total,25);assert.equal(page.rows.length,offset===20?5:10);pages.push(...page.rows.map(row=>row.id));}
  assert.equal(new Set(pages).size,25);assert.deepEqual(pages,[...pages].sort((a,b)=>b-a));
  const filtered=await(await post('/logs',{query:'移动端'})).json();assert.equal(filtered.total,2);assert.equal(filtered.rows.length,2);
  const exported=await(await post('/logs',{all:true})).json();assert.equal(exported.rows.length,25);assert.equal(buildExportTable('audit',exported.rows).rows.length,25);
  const empty=await(await post('/logs',{query:'no-matching-audit-record'})).json();assert.equal(empty.total,0);assert.deepEqual(empty.rows,[]);
  for(const offset of [-10,'Infinity','invalid']){const page=await(await post('/logs',{offset})).json();assert.equal(page.offset,0);assert.equal(page.rows.length,10);}
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
