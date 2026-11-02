(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./studio-recording-wav-core.js'):root.StudioRecordingWavCore,
    typeof module==='object'&&module.exports?require('./studio-waveform-core.js'):root.StudioWaveform);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioWavLongSource=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Core,Wave){
'use strict';
// Lecture OPFS mono PCM16 : une fenêtre bornée, jamais le WAV entier.
const MAX_WINDOW_SECONDS=2,MAX_INDEX_SEGMENTS=21600,MAX_SOURCE_SECONDS=6*3600;
function cancelled(signal){if(signal?.aborted)throw Error('Lecture WAV annulée')}
const cooperative=()=>new Promise(resolve=>setTimeout(resolve,0));
function safeRecovered(r){
  if(!r||r.interrupted||!r.take||!Number.isSafeInteger(r.segments)||r.segments<1||r.segments>MAX_INDEX_SEGMENTS
    ||!Number.isSafeInteger(r.frames)||r.frames<=0)throw Error('Prise WAV incomplète ou trop longue');
  const rate=r.take.meta?.sampleRate;
  if(!Number.isInteger(rate)||rate<8000||rate>192000||r.frames/rate>MAX_SOURCE_SECONDS)
    throw Error('Fréquence ou durée WAV non prise en charge');
  return rate;
}
async function indexRecovered(recovered,{signal,yieldFn=cooperative}={}){
  const rate=safeRecovered(recovered),parts=[],prefix=[0];let total=0;
  for(let i=0;i<recovered.segments;i++){
    cancelled(signal);
    const name=Core.nameFor(i),file=await(await recovered.take.dir.getFileHandle(name)).getFile();
    const info=Core.parseHeader(new Uint8Array(await file.slice(0,44).arrayBuffer()));
    if(info.bytes!==file.size||info.sampleRate!==rate||info.frames<1)
      throw Error('Fragment WAV incorrect : '+name);
    total+=info.frames;parts.push({name,frames:info.frames,bytes:info.bytes});
    prefix.push(total);
    if(i%24===23)await yieldFn();
  }
  if(total!==recovered.frames)throw Error('Durée WAV incohérente pendant indexation');
  return {take:recovered.take,rate,frames:total,seconds:total/rate,parts,prefix};
}
function findPart(index,frame){
  let lo=0,hi=index.parts.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(index.prefix[mid+1]<=frame)lo=mid+1;else hi=mid}
  return lo;
}
async function readWindow(index,startFrame,frameCount,{signal}={}){
  if(!index||!Array.isArray(index.parts)||!Array.isArray(index.prefix)
    ||!Number.isSafeInteger(startFrame)||startFrame<0||startFrame>=index.frames
    ||!Number.isSafeInteger(frameCount)||frameCount<=0||frameCount>MAX_WINDOW_SECONDS*index.rate
    ||startFrame+frameCount>index.frames)throw Error('Fenêtre WAV hors limites');
  const out=new Float32Array(frameCount);
  let frame=startFrame,copied=0;
  while(copied<frameCount){
    cancelled(signal);
    const i=findPart(index,frame),part=index.parts[i];
    if(!part)throw Error('Fragment WAV introuvable');
    const inPart=frame-index.prefix[i],n=Math.min(frameCount-copied,part.frames-inPart);
    const file=await(await index.take.dir.getFileHandle(part.name)).getFile();
    if(file.size!==part.bytes)throw Error('Fragment WAV modifié : '+part.name);
    const head=Core.parseHeader(new Uint8Array(await file.slice(0,44).arrayBuffer()));
    if(head.frames!==part.frames||head.sampleRate!==index.rate)
      throw Error('Fragment WAV corrompu : '+part.name);
    const raw=await file.slice(44+inPart*2,44+(inPart+n)*2).arrayBuffer();
    if(raw.byteLength!==n*2)throw Error('Lecture WAV incomplète');
    const v=new DataView(raw);
    for(let j=0;j<n;j++)out[copied+j]=v.getInt16(j*2,true)/32768;
    frame+=n;copied+=n;
  }
  cancelled(signal);
  return out;
}
async function buildPeaks(index,{signal,onProgress=()=>{},yieldFn=cooperative}={}){
  if(!index||!Array.isArray(index.parts)||index.frames<1)throw Error('Index WAV absent');
  const peakRate=Wave.PEAK_RATE,peaks=new Uint8Array(Math.max(1,Math.ceil(index.seconds*peakRate)));
  let offset=0;
  for(let i=0;i<index.parts.length;i++){
    cancelled(signal);
    const part=index.parts[i],file=await(await index.take.dir.getFileHandle(part.name)).getFile();
    const info=Core.parseHeader(new Uint8Array(await file.slice(0,44).arrayBuffer()));
    if(file.size!==part.bytes||info.frames!==part.frames||info.sampleRate!==index.rate)
      throw Error('Fragment WAV corrompu pendant analyse');
    // Lire <= 32768 frames par tranche, même si un fragment contient 192000 frames.
    for(let frame=0;frame<part.frames;frame+=32768){
      cancelled(signal);
      const n=Math.min(32768,part.frames-frame),raw=await file.slice(44+frame*2,44+(frame+n)*2).arrayBuffer();
      if(raw.byteLength!==n*2)throw Error('Échantillons WAV manquants');
      const view=new DataView(raw);
      for(let j=0;j<n;j++){
        const bin=Math.min(peaks.length-1,Math.floor((offset+frame+j)*peakRate/index.rate));
        const amp=Math.min(255,Math.round(Math.abs(view.getInt16(j*2,true))/32768*255));
        if(amp>peaks[bin])peaks[bin]=amp;
      }
      await yieldFn();
    }
    offset+=part.frames;
    if(i%10===9||i===index.parts.length-1)onProgress(offset/index.frames);
  }
  if(offset!==index.frames)throw Error('Durée waveform non conforme');
  cancelled(signal);
  return Wave.validateWaveform({version:Wave.WAVEFORM_VERSION,peakRate,duration:index.seconds,peaks});
}
async function prepare(recovered,opts={}){
  const index=await indexRecovered(recovered,opts),waveform=await buildPeaks(index,opts);
  return{index,waveform,seconds:index.seconds,takeId:index.take.meta.id};
}
return{MAX_WINDOW_SECONDS,MAX_INDEX_SEGMENTS,MAX_SOURCE_SECONDS,indexRecovered,readWindow,buildPeaks,prepare};
});