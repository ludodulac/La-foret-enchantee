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
  browser=await chromium.launch({headless:true,args:[
    '--no-sandbox','--autoplay-policy=no-user-gesture-required'
  ]});
  const context=await browser.newContext({
    viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.__microphoneMode='held';
    window.__producedStreams=[];
    navigator.mediaDevices.getUserMedia=()=>{
      const supply=async()=>{
        const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain(),
          dest=ctx.createMediaStreamDestination();
        gain.gain.value=window.__microphoneMode==='silent'?0:.25;
        osc.frequency.value=440;osc.connect(gain).connect(dest);
        osc.start();await ctx.resume();
        window.__producedStreams.push(dest.stream);
        return dest.stream;
      };
      if(window.__microphoneMode==='held'){
        return new Promise(resolve=>{window.__grantPendingMicrophone=()=>supply().then(resolve)});
      }
      return supply();
    };
  });
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='127.0.0.1'&&u.port===String(port))return route.continue();
    return route.abort('blockedbyclient');
  });
  await page.goto('http://127.0.0.1:'+port+'/studio.html',{waitUntil:'load',timeout:30000});
  await page.waitForFunction(()=>/Crée ton premier projet/.test(document.querySelector('#project-library-status')?.textContent||''),null,{timeout:15000});
  await page.locator('#create-local-project').click();
  await page.waitForFunction(()=>!document.querySelector('#app').hidden);

  // Android may freeze microphone permission/getUserMedia. Leaving the app
  // must immediately exit the wait instead of occupying the input later.
  await page.locator('#record').click();
  await page.waitForFunction(()=>typeof window.__grantPendingMicrophone==='function',null,{timeout:15000});
  assert.equal(await page.locator('#record').isDisabled(),true);
  await page.evaluate(()=>{
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__simulatedVisibility||'visible'});
    window.__simulatedVisibility='hidden';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(()=>secureCaptureState==='idle',null,{timeout:4000});
  assert.equal(await page.locator('#record').isEnabled(),true);
  assert.match(await page.locator('#recording-state').textContent(),/MICROPHONE INDISPONIBLE/);
  // Grant permission AFTER the tab left. The belated stream must be closed.
  await page.evaluate(()=>{window.__simulatedVisibility='visible';window.__microphoneMode='tone';window.__grantPendingMicrophone()});
  await page.waitForFunction(()=>window.__producedStreams.length===1
    && window.__producedStreams[0].getAudioTracks().every(t=>t.readyState==='ended'),null,{timeout:8000});
  assert.equal(await page.evaluate(()=>clips.length),0);
  console.log('STUDIO-032 PENDING MIC RELEASE PASS: delayed browser stream stopped on tab leave');

  // A microphone can be granted yet deliver digital silence due to another
  // Android app. Such WAV must remain recoverable, not impersonate voiced audio.
  await page.evaluate(()=>{window.__microphoneMode='silent'});
  await page.locator('#record').click();
  await page.waitForFunction(()=>secureCaptureState==='recording',null,{timeout:15000});
  await page.waitForTimeout(3400);
  await page.waitForFunction(()=>/AUCUN SIGNAL MICRO/.test(document.querySelector('#recording-state').textContent),null,{timeout:4000});
  await page.locator('#stop').click();
  await page.waitForFunction(()=>secureCaptureState==='idle',null,{timeout:15000});
  assert.equal(await page.evaluate(()=>clips.length),0,'Silent microphone must not create fake editable clip');
  assert.match(await page.locator('#recording-state').textContent(),/AUCUN SON REÇU DU MICRO/);
  assert.equal(await page.locator('#record').isEnabled(),true);
  assert.equal(await page.evaluate(async()=> (await StudioRecordingWavCore.listTakes(await navigator.storage.getDirectory())).length),1,
    'Silent fragments preserved for recovery');
  const silentTrack=await page.evaluate(()=>window.__producedStreams[1].getAudioTracks()[0].readyState);
  assert.equal(silentTrack,'ended','Studio microphone stops after STOP');
  console.log('STUDIO-032 SILENT MIC PASS: no fake clip, warning visible, WAV recoverable, mic released');

  // A valid recording MUST still work; changing tabs during the recording
  // stops the stream so the keyboard can acquire the microphone.
  await page.evaluate(()=>window.__microphoneMode='tone');
  await page.locator('#record').click();
  await page.waitForFunction(()=>secureCaptureState==='recording',null,{timeout:15000});
  await page.waitForTimeout(2400);
  await page.evaluate(()=>{window.__simulatedVisibility='hidden';document.dispatchEvent(new Event('visibilitychange'))});
  await page.waitForFunction(()=>secureCaptureState==='idle',null,{timeout:20000});
  assert.equal(await page.evaluate(()=>window.__producedStreams[2].getAudioTracks()[0].readyState),'ended');
  assert.equal(await page.evaluate(()=>clips.length),1,'Valid WAV saved safely on background switch');
  assert.equal(await page.locator('#record').isEnabled(),true);
  console.log('STUDIO-032 BACKGROUND MIC RELEASE PASS: active stream stopped and good WAV preserved');
  assert.deepEqual(errors,[],'No uncaught page errors');
 }finally{
  try{await browser?.close()}catch{}
  if(server.listening)await close();
 }
})().catch(e=>{console.error('STUDIO-032 FAIL:',e);process.exitCode=1});
