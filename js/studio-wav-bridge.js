(function(root,factory){
  const api=factory(
    typeof module==='object'&&module.exports?require('./studio-recording-wav-core.js'):root.StudioRecordingWavCore,
    typeof module==='object'&&module.exports?require('./studio-waveform-core.js'):root.StudioWaveform
  );
  if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioWavBridge=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Core,Waveform){
'use strict';
// Étape réversible : créer une waveform SANS décoder le WAV entier en AudioBuffer.
// Le montage long et la compression automatique ne sont pas encore implémentés.
const MAX_ATTACH_SECONDS=30;
function check(recovered,maxSeconds=MAX_ATTACH_SECONDS){
  if(!recovered||recovered.interrupted||!recovered.take||!Number.isSafeInteger(recovered.frames)||recovered.frames<1)
    throw Error('Prise WAV absente ou incomplète');
  if(!Number.isInteger(maxSeconds)||maxSeconds<1||maxSeconds>MAX_ATTACH_SECONDS)
    throw Error('Limite de montage temporaire invalide');
  const rate=recovered.take.meta.sampleRate,seconds=recovered.frames/rate;
  if(!Number.isInteger(rate)||rate<8000||rate>192000||seconds>maxSeconds)
    throw Error('Montage WAV pilote limité à 30 secondes, prise longue conservée dans OPFS');
  if(!Number.isSafeInteger(recovered.segments)||recovered.segments<1)
    throw Error('Aucun fragment WAV');
  return {rate,seconds};
}
async function createWaveform(recovered,{yieldFn=()=>new Promise(resolve=>setTimeout(resolve,0))}={}){
  const {rate,seconds}=check(recovered);
  const peakRate=Waveform.PEAK_RATE;
  const peaks=new Uint8Array(Math.max(1,Math.ceil(seconds*peakRate)));
  let frame=0;
  for(let i=0;i<recovered.segments;i++){
    const file=await(await recovered.take.dir.getFileHandle(Core.nameFor(i))).getFile();
    const info=Core.parseHeader(new Uint8Array(await file.slice(0,44).arrayBuffer()));
    if(info.sampleRate!==rate||info.bytes!==file.size||!info.frames)
      throw Error('Fragment WAV altéré avant montage');
    // En mémoire : UN SEUL fragment PCM (<= 1 Mio), jamais 30 s à la fois.
    const pcm=await file.slice(44).arrayBuffer();
    const view=new DataView(pcm);
    if(info.frames*2!==view.byteLength)throw Error('PCM invalide');
    for(let offset=0;offset<info.frames;offset++){
      const v=view.getInt16(offset*2,true),abs=Math.abs(v/32768);
      const bin=Math.min(peaks.length-1,Math.floor((frame+offset)*peakRate/rate));
      const amp=Math.min(255,Math.round(abs*255));
      if(amp>peaks[bin])peaks[bin]=amp;
      if(offset&&offset%16384===0)await yieldFn();
    }
    frame+=info.frames;
    if(i+1<recovered.segments)await yieldFn();
  }
  if(frame!==recovered.frames)throw Error('Prise WAV modifiée pendant la préparation');
  return Waveform.validateWaveform({version:Waveform.WAVEFORM_VERSION,peakRate,duration:seconds,peaks});
}
async function makeShortClipSource(recovered,options={}){
  check(recovered);
  // Source WAV entière et peak cache léger ; les fragments OPFS originaux restent intacts.
  const waveform=await createWaveform(recovered,options);
  const blob=await Core.completeSmallWav(recovered,{maxSeconds:MAX_ATTACH_SECONDS});
  if(blob.size!==44+recovered.frames*2)throw Error('Source WAV incomplète');
  return {blob,waveform,seconds:recovered.frames/recovered.take.meta.sampleRate,takeId:recovered.take.meta.id};
}
return {MAX_ATTACH_SECONDS,check,createWaveform,makeShortClipSource};
});
