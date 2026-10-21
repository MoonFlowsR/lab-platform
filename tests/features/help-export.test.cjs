const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express'),Database=require('better-sqlite3');
const help=require('../../src/features/help/content.json');
const install=require('../../server/features/help/help-comments.cjs');
const text=block=>block.type==='steps'?block.items.join('\n'):block.type==='table'?[...block.headers,...block.rows.flat()].join('\n'):block.text||'';
test('current role help accepts selections and replies while preserving archived comment anchors',async()=>{
 const db=new Database(':memory:'),app=express(),events=[];
 app.use(express.json());
 install({app,db,authMiddleware:(req,res,next)=>{req.account={username:'example-student',display_name:'示例学生',account_type:'student',status:'active'};next();},addAudit:(...args)=>events.push(args),nowISO:()=>new Date().toISOString(),recordChanges:{notify(){}}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const post=async body=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/help-comments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();assert.equal(response.status,201,result.message);return result.comment;};
 try{
  let checked=0;
  for(const section of help.sections.filter(section=>section.role)){
   for(const [index,block]of section.blocks.entries()){
    if(block.type==='history')continue;
    assert(!text(block).includes('CSV'),section.id);
    const source=text(block),quote=source.slice(0,Math.min(120,source.length));
    if(!quote)continue;
    const comment=await post({section_id:section.id,block_id:`${section.id}-${index}`,quote,body:'示例新导出评论'});
    const reply=await post({parent_id:comment.id,body:'示例回复'});assert.equal(reply.reply_to_username,'example-student');checked++;
   }
   const archived=section.blocks.findIndex(block=>block.type==='history'&&text(block).includes('CSV'));
   if(archived>=0){const source=text(section.blocks[archived]),at=source.indexOf('CSV');await post({section_id:section.id,block_id:`${section.id}-${archived}`,quote:source.slice(Math.max(0,at-20),at+60),body:'示例旧正文评论'});}
  }
  assert(checked>=100);assert.equal(db.prepare('SELECT COUNT(*) AS count FROM help_comment_events').get().count,events.length);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
