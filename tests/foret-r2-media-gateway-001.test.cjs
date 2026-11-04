'use strict';
/* Isolated R2/Supabase mocks. No network, deployment, live bucket or user data. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const workerSource=fs.readFileSync(path.join(ROOT,'cloudflare/foret-media-worker.js'),'utf8');
const clientSource=fs.readFileSync(path.join(ROOT,'js/foret-r2-media.js'),'utf8');
const supaSource=fs.readFileSync(path.join(ROOT,'js/supabase.js'),'utf8');
const adminSource=fs.readFileSync(path.join(ROOT,'js/admin.js'),'utf8');
const coverSource=fs.readFileSync(path.join(ROOT,'js/admin-cover-editor.js'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'admin.html'),'utf8');
const audioScript=fs.readFileSync(path.join(ROOT,'js/audio.js'),'utf8');
const appScript=fs.readFileSync(path.join(ROOT,'js/app.js'),'utf8');
const BASE='https://foret-enchantee-stockage.rondes.workers.dev',ORIGIN='https://ludodulac.github.io';
const body=async(response)=>response.text();
const mockObjects=new Map(),operations=[];
const bucket={
  async put(key,stream,opts){
    const bytes=new Uint8Array(await new Response(stream).arrayBuffer());
    operations.push(['put',key,opts.httpMetadata.contentType,bytes.length]);
    mockObjects.set(key,{bytes,type:opts.httpMetadata.contentType});
    return {key};
  },
  async get(key,{range}={}){
    const value=mockObjects.get(key);if(!value)return null;
    const content=new Uint8Array(value.bytes);
    const header=range?.get?.('Range');
    const match=/^bytes=(\d+)-(\d*)$/.exec(header||'');
    let offset=0,length=content.length,rangeValue=null;
    if(match){
      offset=Number(match[1]);if(offset>=content.length)return null;
      length=Math.min(content.length-offset,match[2]?Number(match[2])-offset+1:content.length-offset);
      rangeValue={offset,length};
    }
    return {size:content.length,httpEtag:'"ci"',
      body:content.slice(offset,offset+length),
      range:rangeValue,
      writeHttpMetadata(headers){headers.set('Content-Type',value.type)}};
  },
  async head(key){
    const value=mockObjects.get(key);if(!value)return null;
    return {size:value.bytes.length,httpEtag:'"ci"',writeHttpMetadata(headers){headers.set('Content-Type',value.type)}};
  },
  async delete(key){operations.push(['delete',key]);mockObjects.delete(key)}
};
const env={CONTES_BUCKET:bucket};
env.SUPABASE_URL='https://mock.supabase.co';env.SUPABASE_ANON_KEY='public-ci-key';
let admin=true, validToken=true,authCalls=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const url=String(input);authCalls++;
  if(url==='https://mock.supabase.co/auth/v1/user')
    return Response.json(validToken?{id:'user-test'}:{message:'bad token'}, {status:validToken?200:401});
  if(url==='https://mock.supabase.co/rest/v1/rpc/is_app_admin')
    return Response.json(admin);
  throw Error('Unexpected external network attempt: '+url);
};
function req(url,method='GET',{origin=ORIGIN,token='ci-token',type='audio/mpeg',bytes=null,length=null}={}){
  const headers={};
  if(origin!==null)headers.Origin=origin;
  if(token!==null)headers.Authorization='Bearer '+token;
  if(type)headers['Content-Type']=type;
  const init={method,headers};
  if(bytes){init.body=bytes;headers['Content-Length']=String(length===null?bytes.byteLength:length)}
  return new Request(url,init);
}
(async()=>{
  const worker=(await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(workerSource))).default;
  let r=await worker.fetch(new Request(BASE+'/'),env);assert.equal(r.status,200);assert.match(await body(r),/Stockage La Forêt Enchantée : prêt/);
  mockObjects.set('contes/test.mp3',{bytes:new Uint8Array([1,2,3,4,5]),type:'audio/mpeg'});
  r=await worker.fetch(new Request(BASE+'/media/contes/test.mp3'),env);
  assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'audio/mpeg');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()),new Uint8Array([1,2,3,4,5]));
  r=await worker.fetch(new Request(BASE+'/media/contes/test.mp3',{headers:{Range:'bytes=1-3'}}),env);
  assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 1-3/5');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()),new Uint8Array([2,3,4]));
  r=await worker.fetch(new Request(BASE+'/media/contes/test.mp3',{method:'HEAD'}),env);
  assert.equal(r.status,200);assert.equal(r.headers.get('Content-Length'),'5');
  r=await worker.fetch(new Request(BASE+'/media/%2e%2e/secret.mp3'),env);
  assert.equal(r.status,404);
  assert.equal(operations.length,0,'GET/HEAD never write to R2');
  console.log('R2-001 PUBLIC READ + HEAD + RANGE 206 PASS');

  const payload=new Uint8Array([65,66,67,68]),upload=BASE+'/api/upload?kind=audio';
  r=await worker.fetch(req(upload,'OPTIONS',{token:null,bytes:null}),env);
  assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),ORIGIN);
  r=await worker.fetch(req(upload,'POST',{origin:'https://evil.example',bytes:payload}),env);
  assert.equal(r.status,403);
  r=await worker.fetch(req(upload,'POST',{origin:null,bytes:payload}),env);
  assert.equal(r.status,403);
  r=await worker.fetch(req(upload,'POST',{token:null,bytes:payload}),env);
  assert.equal(r.status,401);
  assert.equal(operations.length,0);
  console.log('R2-001 CORS AND NO TOKEN -> NO WRITES PASS');
  validToken=false;
  r=await worker.fetch(req(upload,'POST',{bytes:payload}),env);
  assert.equal(r.status,401);validToken=true;admin=false;
  r=await worker.fetch(req(upload,'POST',{bytes:payload}),env);
  assert.equal(r.status,403);admin=true;
  assert.equal(operations.length,0);
  console.log('R2-001 EXPIRED AND NON-ADMIN DENIED PASS');
  r=await worker.fetch(req(upload,'POST',{bytes:payload,type:'text/html'}),env);
  assert.equal(r.status,415);
  r=await worker.fetch(req(upload,'POST',{bytes:payload,length:60*1024*1024+1}),env);
  assert.equal(r.status,413);
  assert.equal(operations.length,0);
  console.log('R2-001 MIME AND LENGTH RESTRICTIONS PASS');
  r=await worker.fetch(req(upload,'POST',{bytes:payload}),env);
  assert.equal(r.status,201);
  const uploaded=await r.json();
  assert.match(uploaded.path,/^r2:contes\/[0-9a-f-]+\.mp3$/);
  assert.equal(operations.filter(o=>o[0]==='put').length,1);
  r=await worker.fetch(new Request(BASE+'/media/'+uploaded.path.slice(3)),env);
  assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),payload);
  r=await worker.fetch(req(BASE+'/api/media/contes/test.mp3','DELETE'),env);
  assert.equal(r.status,404);assert(mockObjects.has('contes/test.mp3'));
  r=await worker.fetch(req(BASE+'/api/media/'+uploaded.path.slice(3),'DELETE'),env);
  assert.equal(r.status,200);assert(!mockObjects.has(uploaded.path.slice(3)));
  console.log('R2-001 ALLOWED ADMIN UPLOAD, PUBLIC READ, RESTRICTED DELETE PASS');

  // Client resolves old and new paths without modifying the main site player.
  const sb={SUPABASE_URL:'https://legacy.supabase.co',STORAGE_URL:'https://legacy.supabase.co/storage/v1/object/public'};
  vm.runInNewContext(supaSource.slice(supaSource.indexOf('function getPublicUrl')),sb);
  assert.equal(sb.getPublicUrl('audios','legacy.mp3'),sb.STORAGE_URL+'/audios/legacy.mp3');
  assert.equal(sb.getPublicUrl('images','old.jpg'),sb.STORAGE_URL+'/images/old.jpg');
  assert.equal(sb.getPublicUrl('audios','r2:contes/a.mp3'),BASE+'/media/contes/a.mp3');
  assert.equal(sb.getPublicUrl('images','r2:couvertures/a.webp'),BASE+'/media/couvertures/a.webp');
  assert.equal(sb.getPublicUrl('images','r2:../../hack'),'', 'Do not resolve arbitrary media URLs');
  assert(appScript.includes("getPublicUrl('audios', audio.audio_path)"));
  assert(audioScript.includes("getPublicUrl('audios', item.audio_path)"));
  console.log('R2-001 NEW + LEGACY PLAYER URL COMPATIBILITY PASS');

  assert(html.includes('<script src="js/foret-r2-media.js"></script>'));
  assert(html.indexOf('js/foret-r2-media.js')<html.indexOf('js/admin.js'));
  assert(adminSource.includes("window.ForestR2Media.upload(dbClient, bucket, file)"));
  assert(adminSource.includes("window.ForestR2Media.remove(dbClient, item.path)"));
  assert(coverSource.includes("const stored = await uploadFile(bucket, path, file)"));
  assert(coverSource.includes("return window.ForestR2Media.verify(path)"));
  assert(!workerSource.includes('service_role'));
  const clientContext={module:{exports:{}},Blob,console};
  vm.runInNewContext(clientSource,clientContext);
  const client=clientContext.module.exports;
  const fakeMp3=new Blob([payload],{type:'audio/mpeg'});Object.defineProperty(fakeMp3,'name',{value:'conte.mp3'});
  assert.equal(client.checkedMedia('audios',fakeMp3).kind,'audio');
  const wav=new Blob([payload],{type:'audio/wav'});Object.defineProperty(wav,'name',{value:'conte.wav'});
  assert.throws(()=>client.checkedMedia('audios',wav),/MP3/);
  assert.equal(client.isR2Path(uploaded.path),true);
  assert.equal(client.isR2Path('r2:couvertures/../../x.jpg'),false);
  console.log('R2-001 ADMIN CODE ROUTING, MP3 RULE AND NO SUPABASE SECRET PASS');
  console.log('R2-001 ALL ISOLATED TESTS PASS; NO CLOUDFLARE DEPLOYMENT');
})().catch(error=>{console.error('R2-001 FAIL',error);process.exitCode=1}).finally(()=>{globalThis.fetch=originalFetch});
