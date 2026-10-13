const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),file=path.join(root,'.env');
if(!fs.existsSync(file)){console.error('尚未生成 .env，请先运行 npm run setup。');process.exit(1);}
const env=Object.fromEntries(fs.readFileSync(file,'utf8').split(/\r?\n/).filter(line=>/^\w+=/.test(line)).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).trim().replace(/^(['"])(.*)\1$/,'$2')];}));
const port=Number(env.PORT||3001);
(async()=>{const response=await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(5000)});if(response.status!==200 || !(await response.json()).ok)throw Error('服务尚未就绪');const page=await fetch('http://127.0.0.1:'+port+'/',{signal:AbortSignal.timeout(5000)});if(page.status!==200 || !(await page.text()).includes('/assets/'))throw Error('前端尚未构建，请运行 npm run build');console.log('平台正常。访问 http://localhost:'+port+'/');})().catch(error=>{console.error('检查失败：'+error.message+'。请检查端口或运行 npm run local。');process.exitCode=1;});
