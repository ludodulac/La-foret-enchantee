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
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.__calibrationTestMode='calibration';
    window.__calibrationMirrored=0;
    const nativeStart=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){
      if(window.__calibrationTestMode==='calibration'
        &&!window.__simulatingInput
        &&this.buffer?.duration>2.4&&this.buffer?.duration<2.8
        &&window.__micCtx&&window.__micDest){
        window.__simulatingInput=true;
        try{
          const echo=window.__micCtx.createBufferSource();
          echo.buffer=this.buffer;echo.connect(window.__micDest);
          echo.start(window.__micCtx.currentTime+.07+.215);
          window.__calibrationMirrored++;
        }finally{window.__simulatingInput=false}
      }
      return nativeStart.apply(this,args);
    };
    window.__micTracks=[];
    navigator.mediaDevices.getUserMedia=async()=>{
      const a=new AudioContext(),dest=a.createMediaStreamDestination();
      await a.resume();
      window.__micCtx=a;window.__micDest=dest;
      window.__micTracks.push(dest.stream.getAudioTracks()[0]);
      if(window.__calibrationTestMode==='voice'){
        const osc=a.createOscillator(),gain=a.createGain();
        osc.frequency.value=560;gain.gain.value=.35;
        osc.connect(gain).connect(dest);osc.start();
      }
      return dest.stream;
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
  await page.locator('#tools-menu-toggle').click();
  await page.locator('#latency-calibrate').click();
  await page.waitForFunction(()=>calibrationSession===null&&measuredLatencyMs>0,null,{timeout:22000});
  const calibrated=await page.evaluate(()=>({
    ms:measuredLatencyMs,status:document.querySelector('#latency-status').textContent,
    echoed:window.__calibrationMirrored,clips:clips.length,
    saved:localStorage.getItem(StudioLatencyCompensation.KEY),
    micState:window.__micTracks[0]?.readyState
  }));
  assert(calibrated.ms>=170&&calibrated.ms<=270,'Expected ~215ms loopback '+JSON.stringify(calibrated));
  assert.equal(calibrated.clips,0,'Calibration must not insert fake user clip');
  assert.equal(calibrated.micState,'ended','Calibration must release input');
  assert.equal(Number(calibrated.saved),calibrated.ms);
  assert.equal(calibrated.echoed,1);
  console.log('STUDIO-039 MEASURED MOBILE LATENCY PASS '+JSON.stringify(calibrated));

  await page.locator('#tools-menu-toggle').click();
  await page.evaluate(()=>{window.__calibrationTestMode='voice'});
  await page.locator('#record').click();
  await page.waitForFunction(()=>secureCaptureState==='recording',null,{timeout:14000});
  await page.waitForTimeout(2400);
  await page.locator('#stop').click();
  await page.waitForFunction(()=>secureCaptureState==='idle'&&clips.length===1,null,{timeout:13000});
  assert.equal(await page.evaluate(()=>clips[0].trim),0,'First unaccompanied take must stay untouched');
  await page.locator('#addtrack').click();
  await page.locator('#track-controls [data-arm]').nth(1).click();
  await page.evaluate(()=>setCursor(0,true));
  await page.locator('#record').click();
  await page.waitForFunction(()=>secureCaptureState==='recording',null,{timeout:14000});
  await page.waitForTimeout(2400);
  await page.locator('#stop').click();
  await page.waitForFunction(()=>secureCaptureState==='idle'&&clips.length===2,null,{timeout:17000});
  const doubled=await page.evaluate(()=>clips.map(c=>({
    start:c.start,trim:c.trim,len:c.len,corrected:c.latencyCorrectionMs||0,track:c.track
  })));
  assert.equal(doubled[0].trim,0);
  assert.equal(doubled[1].start,0,'Clip at t=0 must not be shifted to negative time');
  assert(Math.abs(doubled[1].trim-calibrated.ms/1000)<.00001,'Trim applies saved device latency');
  assert.equal(doubled[1].corrected,calibrated.ms);
  assert.notEqual(doubled[0].track,doubled[1].track);
  console.log('STUDIO-039 AUTO COMPENSATED OVERDUB PASS '+JSON.stringify(doubled));

  await page.locator('#back-projects').click();
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('#local-project-list .local-project-card'),null,{timeout:12000});
  await page.locator('#local-project-list .local-project-card').first().click();
  await page.waitForFunction(()=>!document.querySelector('#app').hidden);
  const persisted=await page.evaluate(()=>({ms:measuredLatencyMs,clips:clips.map(x=>({trim:x.trim,offset:x.latencyCorrectionMs}))}));
  assert.equal(persisted.ms,calibrated.ms);
  assert(Math.abs(persisted.clips[1].trim-doubled[1].trim)<.000001);
  assert.equal(persisted.clips[1].offset,calibrated.ms);
  await page.evaluate(()=>{selected=clips[1];$('#editor').classList.add('show');render()});
  await page.locator('#clip-early').click();
  const nudged=await page.evaluate(()=>({trim:selected.trim,correction:selected.latencyCorrectionMs}));
  assert(Math.abs(nudged.trim-(doubled[1].trim+.025))<.000001);
  await page.locator('#clip-late').click();
  assert(Math.abs((await page.evaluate(()=>selected.trim))-doubled[1].trim)<.000001);
  await page.locator('#clip-calibrated').click();
  assert(Math.abs((await page.evaluate(()=>selected.trim))-doubled[1].trim)<.000001,
    'Do not double apply calibrated shift to already corrected clip');
  console.log('STUDIO-039 PERSISTED + MANUAL 25ms ROUNDTRIP PASS '+JSON.stringify(persisted));
  assert.deepEqual(errors,[],'No unhandled browser errors');
 }finally{
  try{await browser?.close()}catch{}
  if(server.listening)await close();
 }
})().catch(e=>{console.error('STUDIO-039 FAIL:',e);process.exitCode=1});
