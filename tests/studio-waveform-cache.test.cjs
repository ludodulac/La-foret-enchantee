const assert=require('node:assert/strict');
const fs=require('fs');
const W=require('../js/studio-waveform-core.js');
const A=require('../js/studio-autosave.js');

function fakeBuffer(seconds=4,sampleRate=48000,channels=2){
  const length=Math.round(seconds*sampleRate);
  const data=Array.from({length:channels},(_,ch)=>{
    const a=new Float32Array(length);
    for(let i=0;i<length;i++)a[i]=Math.sin(i/37+ch)*(.2+.6*((i%997)/996));
    return a;
  });
  return{duration:length/sampleRate,length,sampleRate,numberOfChannels:channels,getChannelData:i=>data[i]};
}
function snapshot(sourceId){
  return{schema:2,name:'Waveform',cursor:0,zoom:1,selectionStart:null,selectionEnd:null,
    tracks:[{id:'v',name:'Voix',gain:1,muted:false}],
    clips:[{id:'a',track:'v',name:'A',start:0,trim:0,len:4,gain:1,muted:false,sourceId}]};
}
(async()=>{
  const buffer=fakeBuffer(),id='source-A',cache=W.createPeakCache({yieldFn:()=>Promise.resolve(),yieldFrames:4096});
  let first=await cache.ensure(id,buffer);
  assert.equal(first.created,true);
  assert.equal(cache.metrics().pcmScans,1,'premier calcul = 1 scan PCM');
  assert.equal(first.waveform.peakRate,256);
  assert(first.waveform.peaks instanceof Uint8Array);
  assert.equal(first.waveform.peaks.length,Math.ceil(buffer.duration*256));

  const operations=['MOVE','TRIM','SPLIT','DUPLICATE','GAIN','MUTE','ZOOM'];
  for(const operation of operations){
    let reused=await cache.ensure(id,buffer);
    assert.equal(reused.created,false,operation+' doit réutiliser le cache');
  }
  for(let i=0;i<25;i++){
    const plan=W.visiblePlan({clipStart:i*.1,clipDuration:3.2,sourceOffset:.4,pps:40+i*3,scrollLeft:i*11,viewportWidth:412,sourceDuration:buffer.duration,peakRate:256,dpr:3});
    if(plan.visible)W.peakForColumn(first.waveform,plan,0,plan.columns);
  }
  assert.equal(cache.metrics().pcmScans,1,'édition + zoom + renders = 0 scan PCM supplémentaire');

  const secondClip={id:'b',sourceId:id,start:8,trim:.8,len:1.5,gain:.4,muted:false};
  const thirdClip={...secondClip,id:'c',start:12};
  await cache.ensure(secondClip.sourceId,buffer);
  await cache.ensure(thirdClip.sourceId,buffer);
  assert.equal(cache.metrics().entries,1,'plusieurs clips = un cache logique source');
  assert.equal(cache.metrics().pcmScans,1);

  const store=A.createMemoryStore();
  const blob=new Blob([new Uint8Array([1,2,3,4,5,6])],{type:'audio/test'});
  await store.save(snapshot(id),[{id,blob,sourceSchema:2,mimeType:blob.type,origin:'test'}]);
  await store.saveWaveform(id,first.waveform);
  let loaded=await store.load();
  assert.equal(store._metrics().audioWrites,1);
  assert.equal(store._metrics().waveformWrites,1);
  assert(loaded.waveforms.get(id).peaks instanceof Uint8Array);

  const reopened=W.createPeakCache({yieldFn:()=>Promise.resolve()});
  reopened.seed(id,loaded.waveforms.get(id));
  let reopenedResult=await reopened.ensure(id,buffer);
  assert.equal(reopenedResult.created,false);
  assert.equal(reopened.metrics().pcmScans,0,'réouverture avec cache = 0 scan PCM');

  const legacy=A.createMemoryStore();
  const legacyId='legacy-source';
  await legacy.save({schema:1,name:'Legacy',cursor:0,zoom:1,selectionStart:null,selectionEnd:null,
    tracks:[{id:'v',name:'Voix',gain:1,muted:false}],
    clips:[{id:'old',track:'v',name:'Old',start:0,trim:0,len:4,gain:1,muted:false,sourceId:legacyId}]},
    [{id:legacyId,blob:new Blob([new Uint8Array([82,73,70,70])],{type:'audio/wav'})}]);
  loaded=await legacy.load();
  assert.equal(loaded.waveforms.size,0,'ancienne source commence sans cache');
  const legacyFirst=W.createPeakCache({yieldFn:()=>Promise.resolve()});
  let legacyComputed=await legacyFirst.ensure(legacyId,buffer);
  assert.equal(legacyFirst.metrics().pcmScans,1,'legacy premier open = 1 scan');
  await legacy.saveWaveform(legacyId,legacyComputed.waveform);
  loaded=await legacy.load();
  const legacySecond=W.createPeakCache({yieldFn:()=>Promise.resolve()});
  legacySecond.seed(legacyId,loaded.waveforms.get(legacyId));
  await legacySecond.ensure(legacyId,buffer);
  assert.equal(legacySecond.metrics().pcmScans,0,'legacy second open = 0 scan');

  const hours=4,duration=hours*3600,pps=1000,viewportWidth=412,dpr=3;
  const longPlan=W.visiblePlan({clipStart:0,clipDuration:duration,sourceOffset:0,pps,scrollLeft:duration*pps/2,viewportWidth,sourceDuration:duration,peakRate:256,dpr});
  assert(longPlan.visible);
  assert(longPlan.cssWidth<=viewportWidth+2*W.OVERSCAN_PX+1,'canvas CSS doit rester borné au viewport');
  assert(longPlan.bitmapWidth<=Math.ceil((viewportWidth+2*W.OVERSCAN_PX+1)*dpr),'bitmap canvas doit rester borné');
  assert(longPlan.bitmapWidth<2000,'source de 4h ne doit pas créer un canvas géant');

  const html=fs.readFileSync('studio.html','utf8');
  const waveformStart=html.indexOf('function waveform(canvas,c)');
  const waveformEnd=html.indexOf('function pixelsPerSecond()',waveformStart);
  const waveformFn=html.slice(waveformStart,waveformEnd);
  assert(waveformFn.includes('waveformCache.get(c.sourceId)'));
  assert(waveformFn.includes('StudioWaveform.visiblePlan'));
  assert(!waveformFn.includes('getChannelData'),'rendu waveform ne doit jamais rescanner le PCM');
  assert(html.includes("wave._clip=c;requestAnimationFrame(()=>waveform(wave,c))"));
  assert(html.includes("addEventListener('scroll'"),'scroll doit rafraîchir la tranche visible');
  const liveStart=html.indexOf('function updateLiveRecordingVisual');
  const liveEnd=html.indexOf('function play(',liveStart);
  const liveFn=html.slice(liveStart,liveEnd);
  assert(!liveFn.includes('render()'),'mise à jour REC ne doit pas lancer le gros render');
  assert(!html.includes('if(newD!==oldD)render()'),'ancien render général pendant REC doit avoir disparu');

  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
  assert.doesNotThrow(()=>new Function(scripts.at(-1)),'script inline Studio doit rester syntaxiquement valide');

  console.log('WAVEFORM_SCAN_METRIC INITIAL_SOURCE=1; MOVE+TRIM+SPLIT+DUPLICATE+GAIN+MUTE+ZOOM+25_RENDERS=0 ADDITIONAL PCM SCANS');
  console.log('WAVEFORM_SCAN_METRIC REOPEN_WITH_CACHE=0 PCM SCANS; LEGACY_FIRST_OPEN=1; LEGACY_SECOND_OPEN=0');
  console.log('CANVAS_BOUND_METRIC 4H_SOURCE viewport='+viewportWidth+'px dpr='+dpr+' bitmapWidth='+longPlan.bitmapWidth+'px fullTimelineWouldBe='+Math.round(duration*pps*dpr)+'px');
  console.log('Studio waveform cache render 002 tests PASS');
})().catch(e=>{console.error(e);process.exit(1)});