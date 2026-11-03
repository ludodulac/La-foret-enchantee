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
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.addInitScript(()=>{
    window.__micMode='tone';
    window.__testTracks=[];
    navigator.mediaDevices.getUserMedia=()=>{
      const deliver=async()=>{
        const ctx=new AudioContext(),osc=ctx.createOscillator(),destination=ctx.createMediaStreamDestination();
        osc.frequency.value=330;osc.connect(destination);osc.start();await ctx.resume();
        window.__testTracks.push(destination.stream.getAudioTracks()[0]);
        return destination.stream;
      };
      if(window.__micMode==='held')return new Promise(resolve=>{
        window.__grantHeldMicrophone=()=>deliver().then(resolve);
      });
      return deliver();
    };
  });
  const worklet=`registerProcessor('studio-recording-wav',class extends AudioWorkletProcessor{
    constructor(){
      super();
      this.port.onmessage=e=>{if(e.data?.type==='stop')this.port.postMessage({type:'stopped'})};
    }
    process(){return true}
  });`;
  // AudioWorklet module fetches may bypass Playwright page.route.
  // Stub at the actual HTTP server layer so the test never falls back
  // to the production AudioWorklet implementation.
  STUBS['/js/studio-recording-wav-worklet.js']=worklet;
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.pathname==='/js/studio-recording-wav-worklet.js')
      return route.fulfill({status:200,body:worklet,contentType:'application/javascript'});
    if(u.hostname==='127.0.0.1'&&u.port===String(port))return route.continue();
    return route.abort('blockedbyclient');
  });
  await page.goto('http://127.0.0.1:'+port+'/studio.html',{waitUntil:'load',timeout:30000});
  await page.waitForFunction(()=>/Crée ton premier projet/.test(document.querySelector('#project-library-status')?.textContent||''),null,{timeout:15000});
  await page.locator('#create-local-project').click();
  await page.waitForFunction(()=>!document.querySelector('#app').hidden);
  // A hung worklet must not keep the Android mic captured indefinitely.
  await page.locator('#record').click();
  await page.waitForFunction(()=>secureCaptureState==='recording',null,{timeout:15000});
  await page.waitForFunction(()=>secureCaptureState==='idle',null,{timeout:15000});
  assert.equal(await page.evaluate(()=>window.__testTracks[0].readyState),'ended');
  assert.equal(await page.evaluate(()=>clips.length),0);
  const status=await page.locator('#recording-state').textContent();
  assert.match(status,/ENREGISTREMENT INCOMPLET.+Aucune donnée audio/i,'Missing PCM must be a visible error: '+status);
  assert.equal(await page.locator('#record').isEnabled(),true);
  console.log('STUDIO-033 DEAD WORKLET PASS: 7s watchdog stopped mic, no ghost clip, visible reason');

  // getUserMedia can legally remain pending forever. A slow/ignored permission
  // request must leave the UI usable and close a late stream if it arrives.
  await page.evaluate(()=>{window.__micMode='held'});
  await page.locator('#record').click();
  await page.waitForFunction(()=>typeof window.__grantHeldMicrophone==='function',null,{timeout:10000});
  await page.waitForFunction(()=>secureCaptureState==='idle',null,{timeout:16000});
  const timeoutReason=await page.locator('#recording-state').textContent();
  assert.match(timeoutReason,/MICROPHONE INDISPONIBLE.+délai dépassé/i);
  assert.equal(await page.locator('#record').isEnabled(),true);
  await page.evaluate(()=>{window.__micMode='tone';window.__grantHeldMicrophone()});
  await page.waitForFunction(()=>window.__testTracks.length===2&&window.__testTracks[1].readyState==='ended',null,{timeout:8000});
  assert.equal(await page.evaluate(()=>clips.length),0);
  console.log('STUDIO-033 PERMISSION TIMEOUT PASS: no indefinite spinner, late mic stream closed');
  assert.deepEqual(pageErrors,[]);
 }finally{
  try{await browser?.close()}catch{}
  if(server.listening)await close();
 }
})().catch(e=>{console.error('STUDIO-033 FAIL:',e);process.exitCode=1});
