const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
test('setup creates four independent registration codes and adds only the missing finance code on upgrade',()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'platform-setup-'));
 try{
  fs.mkdirSync(path.join(temporary,'scripts'));fs.copyFileSync(path.resolve(__dirname,'../../scripts/setup.cjs'),path.join(temporary,'scripts/setup.cjs'));
  const file=path.join(temporary,'.env'),run=()=>execFileSync(process.execPath,[path.join(temporary,'scripts/setup.cjs')],{encoding:'utf8',windowsHide:true});
  run();let content=fs.readFileSync(file,'utf8');
  const codes=[...content.matchAll(/^\w+_INVITE_CODE=(.+)$/gm)].map(match=>match[1]);assert.equal(codes.length,4);assert.equal(new Set(codes).size,4);assert(codes.every(code=>code.length>=12));
  run();assert.equal(fs.readFileSync(file,'utf8'),content,'Repeated setup keeps every configured value');
  for(const line of ['', 'FINANCE_INVITE_CODE=\r\n', ' FINANCE_INVITE_CODE = ""\r\n']){
   const original='# Existing deployment\r\nJWT_SECRET=synthetic-existing-secret\r\nSTUDENT_INVITE_CODE=synthetic-student-code\r\nTEACHER_INVITE_CODE=synthetic-teacher-code\r\n'+line+'ADMIN_INVITE_CODE=synthetic-admin-code\r\nPORT=3999';
   fs.writeFileSync(file,original);run();content=fs.readFileSync(file,'utf8');
   const finance=content.match(/^FINANCE_INVITE_CODE=([a-f0-9]{24})/m)?.[1];assert(finance,'Missing or blank finance code must be filled');assert(!content.includes('=synthetic-admin-code\r\nPORT=3999FINANCE'));
   assert.equal(content.replace(/^FINANCE_INVITE_CODE=[a-f0-9]+\r?\n?/m,'').trimEnd(),original.replace(/^[ \t]*FINANCE_INVITE_CODE[^\r\n]*\r?\n?/m,'').trimEnd(),'All other configuration bytes stay unchanged');
   assert(!run().includes(finance),'Setup never prints private codes');assert.equal(fs.readFileSync(file,'utf8'),content);
   assert(!fs.readdirSync(temporary).some(name=>name.endsWith('.tmp')));
  }
 }finally{assert.equal(path.dirname(temporary),path.resolve(os.tmpdir()));assert(path.basename(temporary).startsWith('platform-setup-'));fs.rmSync(temporary,{recursive:true,force:true});}
});
