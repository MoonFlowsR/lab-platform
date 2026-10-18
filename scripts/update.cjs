// Prepare in a separate checkout, then replace application files once. Business data stays in place.
const fs=require('node:fs'),path=require('node:path'),{spawnSync,spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),rollback=args.includes('--rollback');
const flag=rollback?'--rollback':'--from',source=path.resolve(args[args.indexOf(flag)+1]||'');
const logs=path.join(root,'server/logs'),lock=path.join(logs,'maintenance.json');
const childOptions={cwd:root,windowsHide:true,encoding:'utf8'};
const readPackage=directory=>JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
const appFiles=directory=>{
  const result=[];
  for(const top of ['src','server','scripts','docs','public','tests']){
    const directoryRoot=path.join(directory,top);if(!fs.existsSync(directoryRoot))continue;
    for(const name of fs.readdirSync(directoryRoot,{recursive:true})){
      const relative=top+'/'+name.replaceAll('\\','/');
      if(/^server\/(data|uploads|backups|logs)(\/|$)/.test(relative))continue;
      if(fs.statSync(path.join(directory,relative)).isFile())result.push(relative);
    }
  }
  for(const file of ['package.json','package-lock.json','index.html','vite.config.js','eslint.config.js','README.md','LICENSE','backup-data.bat','start-platform.ps1','start-platform.vbs','platform-health.ps1','watch-platform.ps1','install-watchdog-task.ps1'])if(fs.existsSync(path.join(directory,file)))result.push(file);
  return result;
};
function command(executable,parameters,cwd=root){const r=spawnSync(executable,parameters,{...childOptions,cwd,stdio:'inherit'});if(r.status!==0)throw new Error('验证未通过：'+parameters.join(' '));}
function copyApplication(from){
  const incoming=appFiles(from),allowed=new Set(incoming);
  for(const file of incoming){const target=path.resolve(root,file);if(!target.startsWith(root+path.sep))throw Error('文件路径超出项目');fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(from,file),target);}
  for(const file of appFiles(root).filter(file=>!allowed.has(file))){const target=path.resolve(root,file);if(!target.startsWith(root+path.sep))throw Error('文件路径超出项目');fs.unlinkSync(target);}
  fs.mkdirSync(path.join(root,'dist'),{recursive:true});
  for(const name of fs.readdirSync(path.join(from,'dist')))if(name!=='index.html')fs.cpSync(path.join(from,'dist',name),path.join(root,'dist',name),{recursive:true});
  fs.copyFileSync(path.join(from,'dist/index.html'),path.join(root,'dist/index.next.html'));fs.renameSync(path.join(root,'dist/index.next.html'),path.join(root,'dist/index.html'));
}
function readPort(){const match=fs.readFileSync(path.join(root,'.env'),'utf8').match(/^PORT\s*=\s*["']?(\d+)/m);return Number(match?.[1]||3001);}
function stopOwned(){
  if(process.platform!=='win32')throw Error('自动重载目前用于Windows。其它系统请由进程管理器停止服务后更新。');
  const ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const r=spawnSync(ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/stop-owned.ps1'),'-PlatformRoot',root,'-Port',String(readPort())],childOptions);
  if(r.status!==0)throw Error(r.stderr||'无法停止本项目服务。');
}
async function start(){
  const output=fs.openSync(path.join(logs,'updated-server.log'),'a'),error=fs.openSync(path.join(logs,'updated-server.error.log'),'a');
  const child=spawn(process.execPath,[path.join(root,'server/index.cjs')],{cwd:root,windowsHide:true,detached:true,stdio:['ignore',output,error]});child.unref();fs.closeSync(output);fs.closeSync(error);
  for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:'+readPort()+'/api/health',{signal:AbortSignal.timeout(2000)});const data=await r.json();if(r.ok&&data.ok&&data.database==='ok')return;}catch{/* Wait for the newly started service. */}await new Promise(resolve=>setTimeout(resolve,200));}
  throw Error('新版本启动验证失败。');
}
(async()=>{
  if(process.platform!=='win32')throw Error('此更新工具用于Windows；其它系统请按维护说明操作。');
  if(args.indexOf(flag)<0 || source===root || !fs.existsSync(path.join(source,'package.json')))throw Error('用法：npm run update -- --from <已验证的新版本目录>；回滚：npm run update -- --rollback <备份中的project目录>');
  if(JSON.stringify(readPackage(root).dependencies)!==JSON.stringify(readPackage(source).dependencies))throw Error('运行依赖有变化，请先按维护文档完成依赖升级，再使用此更新工具。当前服务未变。');
  const settings='src/config/platform-settings.json';
  if(fs.existsSync(path.join(root,settings))&&fs.readFileSync(path.join(root,settings),'utf8')!==fs.readFileSync(path.join(source,settings),'utf8'))throw Error('两个目录的平台配置不同。先将当前配置复制到新版本，重新构建后再更新。');
  for(const file of ['src/config/dropdown-options.json']) if(fs.existsSync(path.join(root,file)) && fs.readFileSync(path.join(root,file),'utf8')!==fs.readFileSync(path.join(source,file),'utf8'))throw Error('材料目录配置不同，请在候选版本保留或确认该配置后再更新。');
  const npm=process.platform==='win32'?path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'):require.resolve('npm/bin/npm-cli.js');
  if(!rollback){command(process.execPath,[npm,'run','lint'],source);command(process.execPath,[npm,'test'],source);command(process.execPath,[npm,'run','build'],source);}
  if(!fs.existsSync(path.join(source,'dist/index.html')))throw Error('新版本缺少构建页面。');
  fs.mkdirSync(logs,{recursive:true});
  if(fs.existsSync(lock)){const old=JSON.parse(fs.readFileSync(lock,'utf8'));try{process.kill(old.pid,0);throw Error('另一个更新正在进行。');}catch(e){if(e.code!=='ESRCH')throw e;}}
  const backupScript=fs.existsSync(path.join(root,'scripts/backup.cjs'))?'scripts/backup.cjs':'server/scripts/backup-now.cjs';
  const backup=spawnSync(process.execPath,[path.join(root,backupScript)],{...childOptions,env:{...process.env,PLATFORM_BACKUP_JSON:'1'}});if(backup.status!==0)throw Error(backup.stderr||'更新前备份失败。');
  const saved=JSON.parse(backup.stdout.trim()).backup;
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}));
  let stopped=false;
  try{stopOwned();stopped=true;copyApplication(source);await start();console.log('更新成功。回滚目录：'+path.join(saved,'project'));}
  catch(error){if(stopped){try{stopOwned();copyApplication(path.join(saved,'project'));await start();console.error('已恢复原程序，业务数据保留。');}catch(recovery){console.error('恢复失败，请运行启动入口并核对日志：'+recovery.message);}}throw error;}
  finally{fs.unlinkSync(lock);}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
