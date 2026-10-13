const fs=require('node:fs'),path=require('node:path'),Database=require('better-sqlite3');
const root=path.resolve(__dirname,'..'),dbPath=path.join(root,'server/data/lab_platform.db');
(async()=>{
  if(!fs.existsSync(dbPath))throw Error('尚未创建数据库，请先启动平台。');
  const stamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()).replace(/\D/g,'');
  const target=path.join(root,'server/backups','full-'+stamp);fs.mkdirSync(target,{recursive:true});
  const db=new Database(dbPath,{readonly:true});try{await db.backup(path.join(target,'lab_platform.db'));}finally{db.close();}
  const uploads=path.join(root,'server/uploads');if(fs.existsSync(uploads))fs.cpSync(uploads,path.join(target,'uploads'),{recursive:true});
  fs.copyFileSync(path.join(root,'.env'),path.join(target,'.env'));
  const copy=new Database(path.join(target,'lab_platform.db'),{readonly:true});try{
    if(copy.pragma('integrity_check',{simple:true})!=='ok')throw Error('数据库备份校验失败。');
    for(const row of copy.prepare("SELECT data_json FROM records WHERE collection='lab_attachments'").all()){
      const file=JSON.parse(row.data_json);if(file.deleted_at || !file.storage_path)continue;
      const destination=path.resolve(target,'uploads',file.storage_path),base=path.resolve(target,'uploads');
      if(!destination.startsWith(base+path.sep) || !fs.existsSync(destination))throw Error('备份缺少附件，请暂停上传及删除后重新备份。');
    }
  }finally{copy.close();}
  console.log('完整备份已保存至 '+target+'。包含账号、记录、照片和私密配置，请勿上传到 GitHub。');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
