'use strict';
// STUDIO-031: realistic browser API exercise with Chrome's SYNTHETIC microphone.
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
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.__overdubMicRequests=[];
    const originalStart=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){
      window.__overdubOutputSourceStart=performance.now();
      return originalStart.apply(this,args);
    };
    navigator.mediaDevices.getUserMedia=async()=>{
      window.__overdubMicRequests.push(performance.now());
      const ac=new AudioContext(),osc=ac.createOscillator(),gain=ac.createGain(),dest=ac.createMediaStreamDestination();
      osc.frequency.value=440;gain.gain.value=.35;
      osc.connect(gain).connect(dest);osc.start();await ac.resume();return dest.stream;
    };
  });
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='127.0.0.1'&&u.port===String(port))return route.continue();
    return route.abort('blockedbyclient');
  });
  await page.goto('http://127.0.0.1:'+port+'/studio.html',{waitUntil:'load'});
  await page.waitForFunction(()=>/Crée ton premier projet/.test(document.querySelector('#project-library-status')?.textContent||''),null,{timeout:12000});
  await page.locator('#create-local-project').click();
  await page.waitForFunction(()=>!document.querySelector('#app').hidden);
  await page.locator('#record').click();
  await page.waitForFunction(()=>secureCaptureState==='recording',null,{timeout:12000});
  await page.waitForTimeout(2300);
  await page.locator('#stop').click();
  await page.waitForFunction(()=>secureCaptureState==='idle'&&clips.length===1,null,{timeout:12000});
  assert.equal(await page.evaluate(()=>window.__overdubMicRequests.length),1);

  await page.locator('#addtrack').click();
  await page.locator('#track-controls [data-arm]').nth(1).click();
  await page.evaluate(()=>{
    setCursor(0,true);decodedSourceCache.clear();
    const oldDecode=ctx.decodeAudioData.bind(ctx);
    ctx.decodeAudioData=async(...args)=>{
      window.__overdubDecodeStart=performance.now();
      await new Promise(resolve=>setTimeout(resolve,1250));
      window.__overdubDecodeDone=performance.now();
      return oldDecode(...args);
    };
  });
  await page.locator('#record').click();
  await page.waitForTimeout(350);
  const preflight=await page.evaluate(()=>({
    state:secureCaptureState,preparing:secureOverdubPreparing,requests:window.__overdubMicRequests.length,
    clips:clips.length,hasLiveClip:!!document.querySelector('#liveclip'),
    banner:document.querySelector('#recording-state').textContent
  }));
  assert.equal(preflight.preparing,true,'Guide must be prepared BEFORE mic acquisition');
  assert.equal(preflight.requests,1,'No second microphone request during decoding');
  assert.equal(preflight.clips,1,'Do not change original clip during guide decoding');
  assert.equal(preflight.hasLiveClip,false,'Capture must not visually start during decode');
  assert.match(preflight.banner,/PRÉPARATION DES PISTES/);
  console.log('STUDIO-036 PREDECODE WITHOUT MIC PASS '+JSON.stringify(preflight));

  // Test STOP while decoding: old WAV remains unchanged and the mic never opens.
  await page.locator('#stop').click();
  await page.waitForFunction(()=>secureOverdubPreparing===false,null,{timeout:1500});
  assert.equal(await page.evaluate(()=>window.__overdubMicRequests.length),1);
  assert.equal(await page.evaluate(()=>clips.length),1);
  await page.waitForTimeout(1100); // late decoder must not start a capture
  assert.equal(await page.evaluate(()=>window.__overdubMicRequests.length),1);
  console.log('STUDIO-036 CANCEL GUIDE PREP PASS: no capture after delayed decoder');

  // Repeat with a slow decoder. Now preload and start monitoring and recording
  // in the SAME JavaScript tick rather than calling asynchronous play() later.
  await page.evaluate(()=>{setCursor(0,true);decodedSourceCache.clear();window.__overdubOutputSourceStart=null});
  await page.locator('#record').click();
  await page.waitForFunction(()=>secureCaptureState==='recording',null,{timeout:12000});
  const sync=await page.evaluate(()=>({
    recording:secureCaptureState,clips:clips.length,requests:window.__overdubMicRequests.length,
    micRequestedAt:window.__overdubMicRequests.at(-1),decodeStart:window.__overdubDecodeStart,
    decodeDone:window.__overdubDecodeDone,outputStartedAt:window.__overdubOutputSourceStart,
    sync:secureOverdubSync,monitor:playing,sources:sources.length,
    armedTrack:recordTrackIdFor(),recordingTrack:secureCaptureInfo?.trackId
  }));
  assert.equal(sync.requests,2);
  assert(sync.micRequestedAt>=sync.decodeDone,'Microphone must open after guide decoder completes');
  assert(sync.decodeDone-sync.decodeStart>=1100,'Test actually injected a slow decoder');
  assert(sync.monitor&&sync.sources>=1,'Existing recording must actually play during capture');
  assert(sync.sync?.guidePreparedBeforeMic===true,'Explicit guide-prepared invariant');
  assert(sync.sync.monitorStartDelayMs>=0&&sync.sync.monitorStartDelayMs<80,
    'Playback must be scheduled synchronously with capture: '+JSON.stringify(sync));
  assert(Math.abs(sync.outputStartedAt-sync.sync.captureActivationAt)<80,
    'Actual AudioBufferSource.start must occur with WAV capture: '+JSON.stringify(sync));
  console.log('STUDIO-036 SYNCHRONIZED OVERDUB START PASS '+JSON.stringify(sync));

  await page.waitForTimeout(2100);
  await page.locator('#stop').click();
  await page.waitForFunction(()=>secureCaptureState==='idle'&&clips.length===2,null,{timeout:14000});
  const result=await page.evaluate(()=>clips.map(c=>({track:c.track,start:c.start,len:c.len})));
  assert.equal(result[0].start,0);assert.equal(result[1].start,0);
  assert.notEqual(result[0].track,result[1].track);
  assert.equal(await page.locator('#tracks .clip').count(),2);
  assert.deepEqual(errors,[],'No uncaught JS errors');
  console.log('STUDIO-036 MULTITRACK ALIGNMENT PASS '+JSON.stringify(result));
 }finally{
  try{await browser?.close()}catch{}
  if(server.listening)await close();
 }
})().catch(e=>{console.error('STUDIO-036 FAIL:',e);process.exitCode=1});
