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
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.__overdubClickEvents=[];
    const original=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){
      const playedAt=performance.now();
      window.__overdubClickEvents.push({type:'guide-play',at:playedAt});
      // A simulated musician responds to the first guide click at +0.28 s.
      // Without predecoding this voice impulse would land ~1.2 s too late.
      if(window.__scheduleInputClick)window.__scheduleInputClick(.28);
      return original.apply(this,args);
    };
    navigator.mediaDevices.getUserMedia=async()=>{
      const ac=new AudioContext(),dest=ac.createMediaStreamDestination();
      await ac.resume();
      window.__scheduleInputClick=delay=>{
        const osc=ac.createOscillator(),gain=ac.createGain(),start=ac.currentTime+delay;
        osc.frequency.value=800;
        gain.gain.setValueAtTime(0,start);
        gain.gain.setValueAtTime(.8,start+.003);
        gain.gain.setValueAtTime(.8,start+.024);
        gain.gain.setValueAtTime(0,start+.028);
        osc.connect(gain).connect(dest);
        osc.start(start);osc.stop(start+.035);
      };
      window.__overdubClickEvents.push({type:'mic-granted',at:performance.now()});
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

  // Seed a real guide WAV in track 1: three rhythmic 800 Hz clicks on 0.28s,
  // 0.92s and 1.56s. The editor decodes these exact WAV bytes before overdub.
  await page.evaluate(async()=>{
    const rate=ctx.sampleRate,buffer=ctx.createBuffer(1,Math.round(2.2*rate),rate),
      a=buffer.getChannelData(0);
    for(const when of [.28,.92,1.56]){
      const start=Math.round(when*rate);
      for(let n=0;n<Math.round(.027*rate);n++)
        a[start+n]=Math.sin(2*Math.PI*800*n/rate)*.8;
    }
    const sourceId=await registerSourceBlob(wav(buffer),buffer,
      {origin:'ci-injected',originalName:'rhythm-clicks.wav',mimeType:'audio/wav'});
    clips.push({id:crypto.randomUUID(),track:tracks[0].id,name:'Guide clics',sourceId,start:0,trim:0,len:2.2,gain:1,muted:false});
    await flushLocalAutosave();render();
  });
  await page.locator('#addtrack').click();
  await page.locator('#track-controls [data-arm]').nth(1).click();
  await page.evaluate(()=>{
    setCursor(0,true);decodedSourceCache.clear();
    const decode=ctx.decodeAudioData.bind(ctx);
    ctx.decodeAudioData=async(...args)=>{
      window.__simulateOverdubDecodeStart=performance.now();
      await new Promise(resolve=>setTimeout(resolve,1250));
      window.__simulateOverdubDecodeEnd=performance.now();
      return decode(...args);
    };
  });
  await page.locator('#record').click();
  await page.waitForFunction(()=>secureCaptureState==='recording',null,{timeout:16000});
  const starts=await page.evaluate(()=>({
    decode:window.__simulateOverdubDecodeEnd-window.__simulateOverdubDecodeStart,
    events:window.__overdubClickEvents,sync:secureOverdubSync
  }));
  assert(starts.decode>=1100,'Must reproduce late decoder (>1s)');
  assert.equal(starts.events.length,2);
  assert(starts.events[0].type==='mic-granted'&&starts.events[1].type==='guide-play');
  assert(starts.sync.monitorStartDelayMs<80);
  await page.waitForTimeout(2350);
  await page.locator('#stop').click();
  await page.waitForFunction(()=>secureCaptureState==='idle'&&clips.length===2,null,{timeout:17000});
  const result=await page.evaluate(async()=>{
    const takes=await StudioRecordingWavCore.listTakes(await navigator.storage.getDirectory());
    const rec=await StudioRecordingWavCore.recoverTake(await navigator.storage.getDirectory(),takes[0].id);
    const blob=await StudioRecordingWavCore.completeSmallWav(rec);
    const pcm=new DataView(await blob.slice(44).arrayBuffer()),rate=rec.take.meta.sampleRate;
    let onset=-1,peak=0;
    for(let i=0;i<pcm.byteLength/2;i++){
      const sample=Math.abs(pcm.getInt16(i*2,true));
      peak=Math.max(peak,sample);
      if(onset<0&&sample>7500)onset=i/rate;
    }
    return {onset,peak,seconds:rec.seconds,clipStarts:clips.map(x=>x.start),
      source:localSources.get(clips[1].sourceId)?.origin,rate};
  });
  assert(result.peak>7500,'Click not recorded as PCM: '+JSON.stringify(result));
  assert(Math.abs(result.onset-.28)<.17,
    'Captured musician response is not aligned with guide start: '+JSON.stringify(result));
  assert.equal(result.clipStarts[0],0);
  assert.equal(result.clipStarts[1],0);
  console.log('STUDIO-037 RHYTHMIC OVERDUB AUDIO ALIGNMENT PASS '+JSON.stringify({starts,result}));
  assert.deepEqual(errors,[]);
 }finally{
  try{await browser?.close()}catch{}
  if(server.listening)await close();
 }
})().catch(e=>{console.error('STUDIO-037 FAIL:',e);process.exitCode=1});
