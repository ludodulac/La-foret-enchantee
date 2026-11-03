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
    viewport:{width:390,height:844},deviceScaleFactor:1,
    isMobile:true,hasTouch:true,acceptDownloads:true
  });
  const page=await context.newPage(),errors=[];
  // A controlled 440 Hz browser-generated MediaStream. Real WebAudio and OPFS
  // are exercised, but no hardware microphone is requested or accessed.
  await page.addInitScript(()=>{
    const synthetic=[];
    navigator.mediaDevices.getUserMedia=async()=>{
      const ctx=new AudioContext();
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      const dest=ctx.createMediaStreamDestination();
      osc.frequency.value=440;gain.gain.value=0.35;
      osc.connect(gain).connect(dest);osc.start();await ctx.resume();
      synthetic.push({ctx,osc});window.__syntheticStudioAudio=synthetic;
      return dest.stream;
    };
  });
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
  // Real, visible, primary transport controls — no WAV overlay.
  await page.locator('#addtrack').click();
  await page.locator('#track-controls [data-arm]').nth(1).click();
  const armed=await page.evaluate(()=>({target:recordTrackIdFor(),cursor}));
  assert.equal(await page.locator('#track-controls [data-arm]').count(),2);
  assert.equal(await page.locator('#studio-wav-panel').isVisible(),false);
  await page.locator('#record').click();
  await page.waitForFunction(()=>secureCaptureState==='recording',null,{timeout:15000});
  assert.equal(await page.locator('#record').isDisabled(),true);
  assert.equal(await page.locator('#stop').isEnabled(),true);
  assert.equal(await page.locator('#studio-wav-panel').isVisible(),false);
  // The real user's video showed an entirely blank track and an active PLAY
  // button during capture. Both are now explicit acceptance criteria.
  assert.equal(await page.locator('#recording-state').isVisible(),true);
  assert.match(await page.locator('#recording-state').textContent(),/ENREGISTREMENT WAV/);
  assert.equal(await page.locator('#play').isDisabled(),true,'PLAY must not interfere with recording');
  assert.equal(await page.locator('#back').isDisabled(),true);
  assert.equal(await page.locator('#forward').isDisabled(),true);
  assert.equal(await page.locator('#liveclip').isVisible(),true,'Live red clip must appear immediately');
  assert.equal(await page.locator('#liveclip').evaluate(el=>el.classList.contains('secure-wav-live')),true);

  // Real browser AudioWorklet + OPFS fragment writer, but FAKE 100% synthetic mic.
  await page.waitForFunction(()=>/Enregistrement WAV en cours/.test(document.querySelector('#studio-wav-status')?.textContent||''),null,{timeout:15000});
  // Poll outside the page context: waitForFunction treats a returned Promise
  // as an object in some Chromium builds and would stop recording too early.
  let ready=null;
  for(let i=0;i<50;i++){
    ready=await page.evaluate(async()=>{
      const root=await navigator.storage.getDirectory();
      const takes=await StudioRecordingWavCore.listTakes(root);
      if(!takes.length)return {seconds:0,segments:0};
      const rec=await StudioRecordingWavCore.recoverTake(root,takes[0].id);
      return {seconds:rec.seconds,segments:rec.segments};
    });
    if(ready.seconds>=2)break;
    await page.waitForTimeout(400);
  }
  assert(ready.seconds>=2,'At least 2 PCM seconds must be persisted before stop: '+JSON.stringify(ready));
  const visual=await page.evaluate(()=>{
    const el=document.querySelector('#liveclip'),canvas=document.querySelector('#livewave');
    const pixel=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let painted=0;for(let i=3;i<pixel.length;i+=4)if(pixel[i])painted++;
    return {state:secureCaptureState,peakCount:secureWavePeaks.length,
      liveWidth:el?.getBoundingClientRect().width,elapsed:liveRec?.len,
      clock:document.querySelector('#clock')?.textContent,
      cursor:cursor,painted,status:document.querySelector('#recording-state')?.textContent};
  });
  assert.equal(visual.state,'recording');
  assert(visual.elapsed>=1.8,'Duration must visibly advance while recording: '+JSON.stringify(visual));
  assert(visual.peakCount>=20,'Real PCM peaks must reach the editor');
  assert(visual.painted>20,'Live waveform must be visible, not empty: '+JSON.stringify(visual));
  assert(visual.liveWidth>25,'Red recording clip must grow: '+JSON.stringify(visual));
  assert(visual.cursor>armed.cursor+1.8,'Timeline playhead must advance with capture clock');
  console.log('STUDIO-031 VISUAL LIVE PASS '+JSON.stringify(visual));
  fs.mkdirSync(path.join(ROOT,'artifacts'),{recursive:true});
  await page.screenshot({path:path.join(ROOT,'artifacts','studio-main-rec-live-031.png'),timeout:10000});
  await page.locator('#stop').click();
  await page.waitForFunction(()=>secureCaptureState==='idle'&&clips.length===1,null,{timeout:20000});
  assert.equal(await page.locator('#record').isEnabled(),true);
  assert.equal(await page.locator('#play').isEnabled(),true);
  assert.equal(await page.locator('#liveclip').count(),0,'Live ghost disappears after WAV is saved');
  assert.equal(await page.locator('#tracks .clip').count(),1,'Final blue editable clip appears');
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
      clipTrack:clips[0]?.track,clipStart:clips[0]?.start,
      sourceOrigin:localSources.get(clips[0]?.sourceId)?.origin};
  });
  console.log('STUDIO-031 actual captured data='+JSON.stringify(data));
  assert.equal(data.interrupted,false,'WAV segments continuous');
  assert(data.seconds>=2&&data.seconds<=15,'Synthetic short recording in expected bounds');
  assert(data.wavBytes===data.pcmBytes+44,'WAV size and header match');
  assert(data.peak>0,'Synthetic microphone generated non-silent PCM');
  assert.equal(data.clipCount,1,'WAV inserted exactly once');
  assert.equal(data.sourceOrigin,'opfs-wav-short');
  assert.equal(data.clipTrack,armed.target,'Capture attached to originally armed track');
  assert.equal(data.clipStart,armed.cursor,'Capture attached at original playhead');
  assert(Math.abs(data.clipSeconds-data.seconds)<0.02,'Clip matches complete recorded duration');
  await page.locator('#back-projects').click();
  await page.reload({waitUntil:'load',timeout:30000});
  await page.waitForFunction(()=>document.querySelector('#local-project-list .local-project-card'));
  await page.locator('#local-project-list .local-project-card').first().click();
  await page.waitForFunction(()=>!document.querySelector('#app').hidden);
  assert.equal(await page.locator('#tracks .clip').count(),1,'Recorded clip survives page reload');
  assert.equal(await page.locator('#track-controls [data-arm]').count(),2,'Two tracks survive reload');
  const after=await page.evaluate(()=>({clips:clips.length,seconds:clips[0]?.len,track:clips[0]?.track,source:localSources.get(clips[0]?.sourceId)?.origin}));
  assert.equal(after.clips,1);assert.equal(after.source,'opfs-wav-short');assert.equal(after.track,armed.target);
  assert(Math.abs(after.seconds-data.seconds)<0.02);
  // Playback exercises the actual Studio AudioBuffer runtime after reload.
  await page.evaluate(()=>setCursor(0,true));
  await page.locator('#play').click();
  await page.waitForFunction(()=>playing===true,null,{timeout:10000});
  await page.waitForTimeout(350);
  const playback=await page.evaluate(()=>({cursor,playing,sources:sources.length,audio:ctx.state}));
  assert(playback.cursor>0.2,'Playback cursor must advance');
  assert(playback.sources>=1,'Real Studio AudioBufferSource must be scheduled');
  await page.locator('#stop').click();
  assert.equal(await page.evaluate(()=>playing),false,'STOP stops normal playback');
  console.log('STUDIO-031 PLAYBACK PASS '+JSON.stringify(playback));

  // Second take: overdub on another track while the first one is audible.
  await page.locator('#track-controls [data-arm]').first().click();
  await page.evaluate(()=>setCursor(0,true));
  await page.locator('#record').click();
  await page.waitForFunction(()=>secureCaptureState==='recording',null,{timeout:15000});
  assert.equal(await page.locator('#play').isDisabled(),true);
  await page.waitForTimeout(2400);
  assert(await page.evaluate(()=>secureWavePeaks.some(x=>x>.05)),'Second take also captures audible PCM');
  await page.locator('#stop').click();
  await page.waitForFunction(()=>secureCaptureState==='idle'&&clips.length===2,null,{timeout:15000});
  const both=await page.evaluate(async()=>{
    const takes=await StudioRecordingWavCore.listTakes(await navigator.storage.getDirectory());
    return {takes:takes.length,clips:clips.map(c=>({track:c.track,start:c.start,len:c.len,origin:localSources.get(c.sourceId)?.origin}))}
  });
  assert.equal(both.takes,2,'Both WAV sources preserved in OPFS');
  assert.equal(both.clips.length,2,'Both WAV takes are mounted on 2 tracks');
  assert.notEqual(both.clips[0].track,both.clips[1].track,'Independent recording tracks');
  assert.equal(both.clips[1].start,0);
  assert(both.clips[1].len>1.8);
  console.log('STUDIO-031 MULTITRACK OVERDUB PASS '+JSON.stringify(both));

  // Reopen the project again, then export the two-track mix as a full WAV.
  await page.locator('#back-projects').click();
  await page.reload({waitUntil:'load',timeout:30000});
  await page.waitForFunction(()=>document.querySelector('#local-project-list .local-project-card'),null,{timeout:15000});
  await page.locator('#local-project-list .local-project-card').first().click();
  await page.waitForFunction(()=>!document.querySelector('#app').hidden);
  assert.equal(await page.locator('#tracks .clip').count(),2);
  await page.locator('#export').click();
  await page.waitForFunction(()=>!document.querySelector('#export-destination-panel').hidden,null,{timeout:20000});
  const exportInfo=await page.locator('#export-destination-note').textContent();
  const downloadPromise=page.waitForEvent('download',{timeout:15000});
  await page.locator('#export-download-ready').click();
  const download=await downloadPromise;
  const savedPath=await download.path();
  const fh=fs.openSync(savedPath,'r'),header=Buffer.alloc(44);
  fs.readSync(fh,header,0,44,0);fs.closeSync(fh);
  assert.equal(header.toString('ascii',0,4),'RIFF');
  assert.equal(header.toString('ascii',8,12),'WAVE');
  assert.equal(fs.statSync(savedPath).size,44+header.readUInt32LE(40));
  assert(header.readUInt32LE(40)>100000,'Audible multi-track output WAV has content');
  console.log('STUDIO-031 MULTITRACK EXPORT PASS '+JSON.stringify({name:download.suggestedFilename(),bytes:fs.statSync(savedPath).size,note:exportInfo}));
  assert.deepEqual(errors,[],'No uncaught errors');
  console.log('STUDIO-031 PASS: main REC/STOP + real AudioWorklet synthetic mic -> OPFS WAV -> armed track -> IndexedDB reload. '+JSON.stringify(data));
 }finally{
  try{await browser?.close()}catch{}
  if(server.listening)await close();
 }
})().catch(e=>{console.error('STUDIO-031 FAIL:',e);process.exitCode=1});
