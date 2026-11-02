const assert=require('node:assert/strict');
const Core=require('../js/studio-recording-wav-core.js');
const Wave=require('../js/studio-waveform-core.js');
const Long=require('../js/studio-wav-long-source.js');
(async()=>{
  assert.equal(Long.MAX_WINDOW_SECONDS,2);
  const rate=48000,pcm=new Uint8Array(rate*2),dv=new DataView(pcm.buffer);
  for(let i=0;i<rate;i++)dv.setInt16(i*2,i<rate/2?16384:-16384,true);
  const goodFile=new Blob([Core.header(rate,rate),pcm],{type:'audio/wav'});
  let largestSlice=0,reads=0,filesOpened=0;
  const wrap=file=>({
    size:file.size,
    slice(a,b){largestSlice=Math.max(largestSlice,b-a);reads++;return file.slice(a,b)},
    arrayBuffer(){throw Error('Entire OPFS file must never be buffered')},
  });
  const totalSeconds=35*60;
  const take={meta:{id:'rec-mock35',sampleRate:rate},dir:{
    async getFileHandle(name){filesOpened++;assert.match(name,/^part-\d{6}\.wav$/);
      const n=Number(name.match(/\d{6}/)[0]);if(n>=totalSeconds)throw Error('missing');
      return{getFile:async()=>wrap(goodFile)};
    }
  }};
  const recovered={take,frames:totalSeconds*rate,segments:totalSeconds,seconds:totalSeconds,interrupted:false};
  const idx=await Long.indexRecovered(recovered,{yieldFn:async()=>{}});
  assert.equal(idx.parts.length,2100);
  assert.equal(idx.seconds,2100);
  assert.equal(idx.prefix.length,2101);
  assert.equal(idx.prefix.at(-1),rate*totalSeconds);
  assert(largestSlice<=44,'index reads only headers');
  // Non-début seek : recherche logarithmique dans 2100 fragments.
  const tail=await Long.readWindow(idx,idx.frames-240,240);
  assert.equal(tail.length,240);
  assert(tail.every(x=>x===-.5));
  assert(largestSlice<=480,'seek reads only requested PCM bytes');
  const cross=await Long.readWindow(idx,rate-8,16);
  assert.equal(cross.length,16);
  assert(cross.slice(0,8).every(x=>x===-.5));
  assert(cross.slice(8).every(x=>x===.5));
  assert(largestSlice<=480);
  await assert.rejects(()=>Long.readWindow(idx,0,rate*2+1),/hors limites/);
  await assert.rejects(()=>Long.readWindow(idx,idx.frames-2,3),/hors limites/);
  const abort=new AbortController();abort.abort();
  await assert.rejects(()=>Long.readWindow(idx,0,10,{signal:abort.signal}),/annulée/);
  await assert.rejects(()=>Long.indexRecovered(recovered,{signal:abort.signal}),/annulée/);
  // 2 fragments seulement pour le calcul détaillé des crêtes ; aucun décodage global.
  const mini={...recovered,segments:2,frames:2*rate,seconds:2};
  const index2=await Long.indexRecovered(mini,{yieldFn:async()=>{}});
  let steps=0,progress=0;
  const wave=await Long.buildPeaks(index2,{yieldFn:async()=>{steps++},onProgress:x=>{progress=x}});
  assert.equal(wave.duration,2);assert.equal(wave.peakRate,Wave.PEAK_RATE);
  assert.equal(wave.peaks.length,512);assert(steps>=2);assert.equal(progress,1);
  assert(wave.peaks.every(x=>x>=126&&x<=129));
  // Aucune suppression/écriture de fichiers pendant lecture, même en erreur.
  const badBlob=goodFile.slice(0,goodFile.size-2);
  const corrupt={...mini,take:{meta:take.meta,dir:{async getFileHandle(name){
    return{getFile:async()=>name===Core.nameFor(1)?badBlob:goodFile};
  }}}};
  await assert.rejects(()=>Long.indexRecovered(corrupt,{yieldFn:async()=>{}}),/incorrect/);
  const miss={...mini,frames:3*rate};
  await assert.rejects(()=>Long.indexRecovered(miss,{yieldFn:async()=>{}}),/incohérente/);
  await assert.rejects(()=>Long.indexRecovered({...mini,interrupted:true}),/incomplète/);
  const empty={...mini,segments:0};
  await assert.rejects(()=>Long.indexRecovered(empty),/incomplète/);
  // Le test 35 min simule les tranches (aucun test humain / interruption Android).
  assert(filesOpened>2100);
  assert(reads>2100);
  console.log('STUDIO-WAV-LONG-021: 35min virtual OPFS index, seek, bounded memory, peaks, abort/corruption PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
