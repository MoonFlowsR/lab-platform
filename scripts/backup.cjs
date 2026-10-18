const fs=require('node:fs'),path=require('node:path'),Database=require('better-sqlite3');
const ROOT=path.resolve(__dirname,'..');
(async()=>{
  const dbPath=path.join(ROOT,'server/data/lab_platform.db');if(!fs.existsSync(dbPath))throw Error('未找到数据库。');
  const stamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()).replace(/\D/g,'');
  const target=path.join(path.dirname(ROOT),path.basename(ROOT)+'-backups','full-'+stamp);
  fs.mkdirSync(path.join(target,'project/server/data'),{recursive:true});
  const live=new Database(dbPath,{readonly:true});try{await live.backup(path.join(target,'project/server/data/lab_platform.db'));}finally{live.close();}
  for(const name of fs.readdirSync(ROOT)){if(name.startsWith('.build-') || name.startsWith('.tmp-') || ['node_modules','server','_platform_backups','.git','test-results'].includes(name))continue;fs.cpSync(path.join(ROOT,name),path.join(target,'project',name),{recursive:true});}
  for(const name of fs.readdirSync(path.join(ROOT,'server'))){if(['data','backups','logs'].includes(name))continue;fs.cpSync(path.join(ROOT,'server',name),path.join(target,'project/server',name),{recursive:true});}
  const copy=new Database(path.join(target,'project/server/data/lab_platform.db'),{fileMustExist:true});
  let attachments=0;try{
    if(copy.pragma('journal_mode=DELETE',{simple:true})!=='delete')throw Error('数据库备份日志整理失败。');
    if(copy.pragma('integrity_check',{simple:true})!=='ok')throw Error('数据库备份校验失败。');
    const base=path.resolve(target,'project/server/uploads');
    for(const row of copy.prepare("SELECT data_json FROM records WHERE collection='lab_attachments'").all()){
      const file=JSON.parse(row.data_json);if(file.deleted_at || !file.storage_path)continue;
      const destination=path.resolve(base,file.storage_path);if(!destination.startsWith(base+path.sep) || !fs.existsSync(destination))throw Error('备份缺少有效附件，请在附件操作结束后重新备份。');attachments++;
    }
  }finally{copy.close();}
  fs.writeFileSync(path.join(target,'backup-manifest.json'),JSON.stringify({created_at:new Date().toISOString(),database_integrity:'ok',active_attachments_verified:attachments,private_backup:true},null,2));
  fs.writeFileSync(path.join(target,'恢复说明.txt'),'私有备份，不得上传GitHub。恢复前停止平台服务；project包含源码、配置、构建、数据库和附件。先移开当前server/data中的DB/WAL/SHM文件，再恢复project下对应文件。node_modules按锁文件重新安装；不要覆盖其它新的备份。');
  console.log(process.env.PLATFORM_BACKUP_JSON === '1' ? JSON.stringify({backup:target,attachments}) : '完整备份已完成：'+target);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
