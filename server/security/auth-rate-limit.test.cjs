const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const createLimiter = require('./auth-rate-limit.cjs');

function attempt(limiter, { name='示例学生', ip='192.0.2.1', peer='127.0.0.1', route='/api/auth/login', status=400, finish=true } = {}) {
  const req={method:'POST',path:route,body:{username:name},socket:{remoteAddress:peer},headers:{'x-forwarded-for':ip}};
  const res=new EventEmitter();res.statusCode=200;res.headers={};res.setHeader=(key,value)=>{res.headers[key]=value;};res.status=code=>{res.statusCode=code;return res;};res.json=body=>{res.body=body;res.emit('finish');return res;};
  let accepted=false;
  limiter.byIp(req,res,()=>limiter.byAccount(req,res,()=>{accepted=true;res.statusCode=status;if(finish)res.emit('finish');}));
  return {req,res,accepted};
}
test('successful team registrations and sign-ins sharing an IP do not consume the failure quota',()=>{
 const limiter=createLimiter();for(let i=0;i<120;i++){assert.ok(attempt(limiter,{status:200}).accepted);assert.ok(attempt(limiter,{route:'/api/auth/register',status:200}).accepted);}
});
test('repeated wrong credentials are blocked with retry guidance and expire automatically',()=>{
 let now=0;const limiter=createLimiter({clock:()=>now});for(let i=0;i<12;i++)assert.ok(attempt(limiter).accepted);
 const blocked=attempt(limiter);assert.equal(blocked.accepted,false);assert.equal(blocked.res.statusCode,429);assert.equal(blocked.res.body.code,'AUTH_RATE_LIMITED');assert.equal(blocked.res.headers['Retry-After'],'300');
 assert.ok(attempt(limiter,{name:'另一示例学生',status:200}).accepted);now=300001;assert.ok(attempt(limiter,{status:200}).accepted);
});
test('rotating account names cannot bypass the IP-wide failure limit',()=>{
 const limiter=createLimiter();for(let i=0;i<60;i++)assert.ok(attempt(limiter,{name:'示例'+i}).accepted);assert.equal(attempt(limiter,{name:'继续尝试'}).res.statusCode,429);
 assert.ok(attempt(limiter,{ip:'192.0.2.2',status:200}).accepted);
});
test('untrusted direct clients cannot spoof a new address through forwarded headers',()=>{
 const limiter=createLimiter();for(let i=0;i<12;i++)assert.ok(attempt(limiter,{peer:'198.51.100.5',ip:'192.0.2.'+i}).accepted);
 assert.equal(attempt(limiter,{peer:'198.51.100.5',ip:'203.0.113.99'}).res.statusCode,429);
});
test('a trusted proxy uses its appended hop, rejecting leftmost-header spoofing',()=>{
 const limiter=createLimiter();for(let i=0;i<12;i++)assert.ok(attempt(limiter,{ip:'198.51.100.'+i+', 203.0.113.7'}).accepted);
 assert.equal(attempt(limiter,{ip:'198.51.100.99, 203.0.113.7'}).res.statusCode,429);assert.ok(attempt(limiter,{ip:'203.0.113.8',status:200}).accepted);
});
test('IPv4-mapped IPv6 and IPv4 forms share one limit',()=>{
 const limiter=createLimiter();for(let i=0;i<12;i++)assert.ok(attempt(limiter,{ip:i%2?'::ffff:192.0.2.9':'192.0.2.9'}).accepted);assert.equal(attempt(limiter,{ip:'192.0.2.9'}).res.statusCode,429);
});
test('in-flight attempts and aborted connections cannot bypass the limit',()=>{
 const limiter=createLimiter();const pending=[];for(let i=0;i<12;i++)pending.push(attempt(limiter,{finish:false}));assert.equal(attempt(limiter).res.statusCode,429);
 pending.forEach(x=>x.res.emit('close'));assert.equal(attempt(limiter).res.statusCode,429);
});
test('transient server errors do not lock out valid users',()=>{
 const limiter=createLimiter();for(let i=0;i<80;i++)assert.ok(attempt(limiter,{status:500}).accepted);assert.ok(attempt(limiter,{status:200}).accepted);
});
test('registration and malformed JSON failures receive protection; other API traffic is untouched',()=>{
 for(const route of ['/api/auth/register']){const limiter=createLimiter();for(let i=0;i<12;i++)assert.ok(attempt(limiter,{route}).accepted);assert.equal(attempt(limiter,{route}).res.statusCode,429);}
 const limiter=createLimiter();for(let i=0;i<60;i++){const req={method:'POST',path:'/api/auth/login',socket:{remoteAddress:'192.0.2.1'},headers:{}},res=new EventEmitter();res.statusCode=400;limiter.byIp(req,res,()=>res.emit('finish'));}
 assert.equal(attempt(limiter,{peer:'192.0.2.1'}).res.statusCode,429);
 for(let i=0;i<80;i++)assert.ok(attempt(limiter,{route:'/api/ops/syncAll'}).accepted);
});
test('invalid proxy configuration fails clearly instead of trusting arbitrary networks',()=>{
 assert.throws(()=>createLimiter({trustedProxies:'0.0.0.0/0'}),/明确的IP地址/);
});
