(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.StudioLatencyCompensation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const KEY='studio-recording-latency-v1';
const TIMES=[0.42,1.04,1.69,2.37];
const TONE_HZ=960,TONE_DURATION=.032,START_LEAD=.07;
function clampMs(v,max=800){const n=Number(v);if(!Number.isFinite(n))return 0;return Math.max(0,Math.min(max,Math.round(n)))}
function load(storage){try{return clampMs(storage?.getItem(KEY))}catch{return 0}}
function save(storage,ms){const value=clampMs(ms);try{storage?.setItem(KEY,String(value))}catch{}return value}
function createTestTone(context){
  const rate=context.sampleRate||44100;
  const buffer=context.createBuffer(1,Math.ceil((TIMES.at(-1)+.18)*rate),rate);
  const samples=buffer.getChannelData(0);
  const len=Math.ceil(TONE_DURATION*rate);
  for(const at of TIMES){
    const base=Math.round(at*rate);
    for(let i=0;i<len&&base+i<samples.length;i++){
      const fade=Math.pow(Math.sin(Math.PI*(i+.5)/len),2);
      samples[base+i]+=0.55*fade*Math.sin(2*Math.PI*TONE_HZ*i/rate)
    }
  }
  return buffer;
}
function measure(chunks,sampleRate,opts={}){
  const rate=Number(sampleRate);
  if(!Number.isFinite(rate)||rate<8000||rate>192000||!Array.isArray(chunks)||!chunks.length)
    throw Error('Aucun échantillon exploitable pour la calibration');
  const step=Math.max(1,Math.round(rate*.005)),energies=[];
  let sum=0,count=0,seen=0,peak=0;
  // Chunks can be successive Uint8Array, Int16Array or Float32Array.
  function consume(v){
    const a=Math.abs(v);sum+=v*v;peak=Math.max(peak,a);count++;seen++;
    if(count===step){energies.push(Math.sqrt(sum/count));sum=0;count=0}
  }
  for(const chunk of chunks){
    if(chunk instanceof Uint8Array){
      const dv=new DataView(chunk.buffer,chunk.byteOffset,chunk.byteLength);
      for(let i=0;i+1<chunk.byteLength;i+=2)consume(dv.getInt16(i,true)/32768);
    }else if(chunk instanceof Int16Array){
      for(let i=0;i<chunk.length;i++)consume(chunk[i]/32768);
    }else if(chunk instanceof Float32Array){
      for(let i=0;i<chunk.length;i++)consume(chunk[i]);
    }else throw Error('Format PCM de calibration inconnu')
  }
  if(count)energies.push(Math.sqrt(sum/count));
  if(seen<Math.round(rate*2.95))throw Error('La mesure est trop courte');
  const binSeconds=step/rate,maxMs=opts.maxMs??800;
  if(peak<.006)throw Error('Clics inaudibles : augmente le volume ou rapproche le microphone');
  const candidates=[];
  for(let delayMs=0;delayMs<=maxMs;delayMs+=5){
    let hits=[],background=[],minPeak=Infinity;
    for(const at of TIMES){
      const center=(at+START_LEAD+delayMs/1000)/binSeconds;
      const from=Math.max(0,Math.round(center));
      const to=Math.min(energies.length-1,Math.round(center+TONE_DURATION/binSeconds));
      let hit=0;
      for(let j=from;j<=to;j++)hit=Math.max(hit,energies[j]||0);
      const before=Math.max(0,Math.round(center-.10/binSeconds));
      const quietEnd=Math.max(before,Math.round(center-.045/binSeconds));
      let quiet=0;
      for(let j=before;j<=quietEnd;j++)quiet=Math.max(quiet,energies[j]||0);
      hits.push(hit);background.push(quiet);minPeak=Math.min(minPeak,hit)
    }
    const score=hits.reduce((v,h,i)=>v+Math.max(0,h-background[i]*.65),0);
    candidates.push({delayMs,score,hits,background,minPeak});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const best=candidates[0];
  if(!best||best.hits.some((h,i)=>h<.012||h<best.background[i]*1.25))
    throw Error('Impossible de reconnaître les quatre clics : vérifie le volume et le bruit ambiant');
  // Four separated audio bursts are required; a single loud sound must never
  // silently produce a fabricated fixed latency.
  return {ms:clampMs(best.delayMs,maxMs),confidence:best.hits.map((h,i)=>Math.round(h/Math.max(.0001,best.background[i])*10)/10),
    peak:Math.round(peak*1000)/1000,clicks:TIMES.length};
}
function shiftClip(clip,earlierMs){
  const delta=Number(earlierMs)/1000;
  if(!Number.isFinite(delta)||Math.abs(delta)>2)throw Error('Correction de temps hors limites');
  if(!clip||!Number.isFinite(clip.start)||!Number.isFinite(clip.trim)||!Number.isFinite(clip.len)||clip.len<=0)
    throw Error('Clip incompatible');
  const next={...clip};
  if(delta>0){
    const move=Math.min(delta,next.start);
    next.start=Math.max(0,next.start-move);
    const crop=delta-move;
    if(crop>0){
      if(crop>=next.len-.03)throw Error('Correction supérieure à la durée disponible');
      next.trim+=crop;next.len-=crop
    }
  }else if(delta<0){
    let remaining=-delta;
    const untrim=Math.min(next.trim,remaining);
    next.trim=Math.max(0,next.trim-untrim);next.len+=untrim;remaining-=untrim;
    if(remaining>0)next.start+=remaining;
  }
  next.start=Math.round(next.start*1e6)/1e6;
  next.trim=Math.round(next.trim*1e6)/1e6;
  next.len=Math.round(next.len*1e6)/1e6;
  return next
}
return {KEY,TIMES,TONE_DURATION,START_LEAD,clampMs,load,save,createTestTone,measure,shiftClip};
});
