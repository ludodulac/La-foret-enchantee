'use strict';
// STUDIO-030: realistic browser API exercise with Chrome's SYNTHETIC microphone.
// No real microphone, user audio, network, account, Supabase, production writes, or deletion.
// The browser profile and OPFS/IndexedDB are ephemeral for this run only.
const assert=require('node:assert/strict'),http=require('node:http'),
  fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const STUBS={
  '/js/supabase.js':`window.dbClient={
    from(){return{select(){return{order:async()=>({data:[],error:null})}}}},
    storage:{from(){throw Error('Remote storage forbidden in 030')}}
  };`,
  '/js/auth.js':`window.requireAuth=async()=>({id:'synthetic-ci-only'});`,
  '/js/audio-publish.js':`window.ForestAudioPublish={
    publishNormalAudio:async()=>{throw Error('Remote publication forbidden in 030')}
  };`
};
function serve(req,res){
  const u=new URL(req.url||'/', 'http://127.0.0.1');
  const name=u.pathname;
  const respond=(code,body,type='text/plain; charset=utf-8')=>{
    res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
  };
  if(Object.hasOwn(STUBS,name))return respond(200,STUBS[name],'application/javascript; charset=utf-8');
  if(name==='/studio.html')return respond(200,fs.readFileSync(path.join(ROOT,'studio.html')),'text/html; charset=utf-8');
  if(!/^\/js\/[a-z0-9-]+\.js$/.test(name))return respond(404,'Missing');
  const file=path.resolve(ROOT,name.slice(1));
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file))return respond(404,'Missing');
  return respond(200,fs.readFileSync(file),'application/javascript; charset=utf-8');
}
const server=http.createServer(serve);
const listen=()=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=()=>new Promise(resolve=>server.close(resolve));
(async()=>{
 let browser;
 try{
  const port=await listen();
  browser=await chromium.launch({headless:true,args:[
    '--no-sandbox','--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'
  ]});
  const context=await browser.newContext({
    viewport:{width:390,height:844},deviceScaleFactor:1,
    isMobile:true,hasTouch:true,permissions:['microphone']
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='127.0.0.1'&&u.port===String(port))return route.continue();
    return route.abort('blockedbyclient');
  });
  await page.goto('http://127.0.0.1:'+port+'/studio.html',{waitUntil:'load',timeout:30000});
  await page.waitForFunction(()=>/Crée ton premier projet/.test(document.querySelector('#project-library-status')?.textContent||''),null,{timeout:15000});
  await page.locator('#create-local-project').click();
  await page.waitForFunction(()=>!document.querySelector('#app').hidden);
  await page.locator('#tools-menu-toggle').click();
  await page.locator('#studio-wav-open').click();
  await page.locator('#studio-wav-start').click();

  // Real browser AudioWorklet + OPFS fragment writer, but FAKE 100% synthetic mic.
  await page.waitForFunction(()=>/Enregistrement WAV en cours/.test(document.querySelector('#studio-wav-status')?.textContent||''),null,{timeout:15000});
  // At least two full PCM fragments are emitted before stop; never time out silently.
  await page.waitForFunction(async()=>{
    const root=await navigator.storage.getDirectory();
    return (await StudioRecordingWavCore.listTakes(root)).length>0
      && (await StudioRecordingWavCore.recoverTake(root,(await StudioRecordingWavCore.listTakes(root))[0].id)).segments>=2;
  },null,{timeout:25000,polling:300});

  await page.locator('#studio-wav-stop').click();
  await page.waitForFunction(()=>{
    const status=document.querySelector('#studio-wav-status')?.textContent||'';
    return /Prise enregistrée et ajoutée à la piste active/.test(status)
      || /ajout au montage impossible|Arrêt incomplet|Récupération impossible/.test(status);
  },null,{timeout:20000});
  const status=await page.locator('#studio-wav-status').textContent();
  assert.match(status,/Prise enregistrée et ajoutée à la piste active/, 'Capture and attach must succeed: '+status);

  const data=await page.evaluate(async()=>{
    const root=await navigator.storage.getDirectory();
    const takes=await StudioRecordingWavCore.listTakes(root);
    const rec=await StudioRecordingWavCore.recoverTake(root,takes[0].id);
    const wav=await StudioRecordingWavCore.completeSmallWav(rec);
    const head=new DataView(await wav.slice(0,44).arrayBuffer());
    const bytes=new Int16Array(await wav.slice(44,Math.min(wav.size,44+32768)).arrayBuffer());
    let peak=0;for(const n of bytes)peak=Math.max(peak,Math.abs(n));
    return{takes:takes.length,segments:rec.segments,seconds:rec.seconds,
      interrupted:rec.interrupted,wavBytes:wav.size,rate:head.getUint32(24,true),
      pcmBytes:head.getUint32(40,true),peak,
      clipCount:clips.length,clipSeconds:clips[0]?.len,
      sourceOrigin:localSources.get(clips[0]?.sourceId)?.origin};
  });
  assert.equal(data.interrupted,false,'WAV segments continuous');
  assert(data.seconds>=2&&data.seconds<=15,'Synthetic short recording in expected bounds');
  assert(data.wavBytes===data.pcmBytes+44,'WAV size and header match');
  assert(data.peak>0,'Synthetic microphone generated non-silent PCM');
  assert.equal(data.clipCount,1,'WAV inserted exactly once');
  assert.equal(data.sourceOrigin,'opfs-wav-short');
  assert(Math.abs(data.clipSeconds-data.seconds)<0.02,'Clip matches complete recorded duration');
  await page.locator('#studio-wav-close').click();
  await page.locator('#tools-menu-toggle').click();
  await page.locator('#back-projects').click();
  await page.reload({waitUntil:'load',timeout:30000});
  await page.waitForFunction(()=>document.querySelector('#local-project-list .local-project-card'));
  await page.locator('#local-project-list .local-project-card').first().click();
  await page.waitForFunction(()=>!document.querySelector('#app').hidden);
  assert.equal(await page.locator('#tracks .clip').count(),1,'Recorded clip survives page reload');
  const after=await page.evaluate(()=>({clips:clips.length,seconds:clips[0]?.len,source:localSources.get(clips[0]?.sourceId)?.origin}));
  assert.equal(after.clips,1);assert.equal(after.source,'opfs-wav-short');
  assert(Math.abs(after.seconds-data.seconds)<0.02);
  assert.deepEqual(errors,[],'No uncaught errors');
  console.log('STUDIO-030 PASS: real Chromium AudioWorklet + fake mic -> OPFS WAV -> automatic short clip -> IndexedDB -> reload. '+JSON.stringify(data));
 }finally{
  try{await browser?.close()}catch{}
  if(server.listening)await close();
 }
})().catch(e=>{console.error('STUDIO-030 FAIL:',e);process.exitCode=1});
