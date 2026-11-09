(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.StudioSilenceEditor=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FRAME_SECONDS=.02,MAX_PAUSES=700,ANALYSIS_VERSION=2;
  const MODES={
    natural:{minSilence:.65,keep:.25,threshold:.0045,noiseFactor:1.55,glitchSeconds:.08},
    dynamic:{minSilence:.48,keep:.18,threshold:.006,noiseFactor:1.8,glitchSeconds:.10}
  };
  const round=n=>Math.round(n*1000000)/1000000;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function settings(mode){return MODES[mode]||MODES.natural}
  // A fixed -47 dBFS cutoff misses real pauses when a phone's lavalier
  // captures a steady fan, hiss or room sound. Estimate the recording's
  // noise floor conservatively, then gate short isolated spikes without
  // treating soft voices as silence. All work is local; no audio is uploaded.
  async function analyze(buffer,trim,duration,mode='natural',opts={}){
    if(!buffer||typeof buffer.getChannelData!=='function'||!Number.isFinite(buffer.sampleRate)||buffer.sampleRate<=0)throw Error('Audio original indisponible');
    const sr=buffer.sampleRate,offset=clamp(Math.floor(trim*sr),0,buffer.length),
      end=clamp(Math.ceil((trim+duration)*sr),offset,buffer.length),
      frame=Math.max(1,Math.round(FRAME_SECONDS*sr)),cfg=settings(mode);
    const channels=Array.from({length:Math.min(2,buffer.numberOfChannels)},(_,i)=>buffer.getChannelData(i));
    if(!channels.length||!Number.isFinite(duration)||duration<=0)throw Error('Durée audio invalide');
    const frames=Math.ceil((end-offset)/frame),energy=new Float32Array(frames),
      active=new Uint8Array(frames);
    for(let k=0;k<frames;k++){
      if(opts.signal?.aborted)throw Error('Analyse annulée');
      const a=offset+k*frame,b=Math.min(end,a+frame);
      let sum=0,count=0;
      for(let i=a;i<b;i+=4){for(const ch of channels){let v=ch[i]||0;sum+=v*v;count++}}
      energy[k]=Math.sqrt(sum/Math.max(1,count));
      if(k%300===299){opts.onProgress?.(k/frames*.55);await new Promise(resolve=>setTimeout(resolve,0))}
    }
    if(opts.signal?.aborted)throw Error('Analyse annulée');
    // Use a bounded sample: even a 30-minute tale stays responsive on Android.
    const stride=Math.max(1,Math.ceil(frames/2800)),sample=[];
    for(let k=0;k<frames;k+=stride)sample.push(energy[k]);
    sample.sort((a,b)=>a-b);
    const quantile=p=>sample.length?sample[Math.min(sample.length-1,Math.floor((sample.length-1)*p))]:0;
    const noiseFloor=quantile(.20),voiceReference=quantile(.95);
    // Never lift the gate close to the voice itself: when voice/noise overlap,
    // preserve ambiguous audio instead of accidentally deleting a whisper.
    const adaptive=Math.min(noiseFloor*cfg.noiseFactor,voiceReference*.4);
    const threshold=Math.max(cfg.threshold,adaptive);
    for(let k=0;k<frames;k++)active[k]=energy[k]>threshold?1:0;
    // Very brief isolated ticks or hiss fluctuations can split a long pause
    // into many sub-threshold runs. Bridge only small bursts well inside
    // genuinely quiet stretches, not syllables surrounded by speech.
    for(let k=0;k<frames;){
      if(!active[k]){k++;continue}
      const from=k;let peak=0;
      while(k<frames&&active[k]){peak=Math.max(peak,energy[k]);k++}
      const length=k-from,quietSide=Math.ceil(.12/FRAME_SECONDS),
        left=from>=quietSide&&active[from-quietSide]===0,
        right=k+quietSide<frames&&active[k+quietSide]===0;
      const tiny=length<=Math.ceil(.045/FRAME_SECONDS),
        weak=length<=Math.ceil(cfg.glitchSeconds/FRAME_SECONDS)&&peak<=threshold*1.5;
      if(left&&right&&(tiny||weak))active.fill(0,from,k);
    }
    const pauses=[];let from=-1;
    for(let k=0;k<=frames;k++){
      if(opts.signal?.aborted)throw Error('Analyse annulée');
      const quiet=k<frames&&active[k]===0;
      if(quiet&&from<0)from=k;
      else if(!quiet&&from>=0){
        const a=round(from*frame/sr),b=round(Math.min(duration,k*frame/sr));
        if(b-a>=cfg.minSilence&&a>=.08&&b<=duration-.08){
          // Leave the requested mini-pause and a buffer before the next word.
          const edge=Math.max(cfg.keep/2,.06),cutStart=round(a+edge),cutEnd=round(b-edge);
          if(cutEnd-cutStart>.04){
            pauses.push({start:a,end:b,cutStart,cutEnd,reduced:true});
            if(pauses.length>MAX_PAUSES)throw Error('Trop de pauses détectées : coupe le long enregistrement en plusieurs clips.');
          }
        }
        from=-1;
      }
    }
    opts.onProgress?.(1);
    return{originalDuration:round(duration),mode,analysisVersion:ANALYSIS_VERSION,pauses};
  }
  function segments(c,edit=c.silenceEdit){
    if(!edit)return[{at:0,trim:c.trim,len:c.len}];
    const total=Number(edit.originalDuration),base=Number(c.trim);
    if(!Number.isFinite(total)||total<=0||!Number.isFinite(base)||base<0)throw Error('Traitement des silences invalide');
    const cuts=(edit.pauses||[]).filter(p=>p.reduced).map(p=>({
      a:clamp(Number(p.cutStart),0,total),b:clamp(Number(p.cutEnd),0,total)
    })).filter(p=>Number.isFinite(p.a)&&Number.isFinite(p.b)&&p.b>p.a+.00001).sort((a,b)=>a.a-b.a);
    const out=[];let source=0,at=0;
    for(const cut of cuts){
      if(cut.b<=source)continue;
      const a=Math.max(source,cut.a);
      if(a>source){const len=round(a-source);out.push({at:round(at),trim:round(base+source),len});at+=len}
      source=Math.max(source,cut.b);
    }
    if(total>source){const len=round(total-source);out.push({at:round(at),trim:round(base+source),len})}
    return out.filter(x=>x.len>.000001);
  }
  function duration(c,edit=c.silenceEdit){
    return round(segments(c,edit).reduce((sum,s)=>sum+s.len,0));
  }
  function sourceAt(c,outputTime,edge='start'){
    const spans=segments(c);
    if(!spans.length)return c.trim;
    const pos=clamp(outputTime,0,duration(c));
    for(let i=0;i<spans.length;i++){
      const s=spans[i],end=s.at+s.len;
      if(pos<end-0.000001)return round(s.trim+Math.max(0,pos-s.at));
      if(Math.abs(pos-end)<=0.000001&&edge==='end')return round(s.trim+s.len);
      if(Math.abs(pos-end)<=0.000001&&i===spans.length-1)return round(s.trim+s.len);
    }
    const last=spans[spans.length-1];return round(last.trim+last.len);
  }
  // A split or trim of an already edited clip keeps the original, never copies PCM.
  function slice(c,from,to){
    const a=clamp(from,0,c.len),b=clamp(to,a,c.len);
    if(!c.silenceEdit)return{...c,start:c.start+a,trim:c.trim+a,len:b-a};
    const left=sourceAt(c,a,'start'),right=sourceAt(c,b,'end');
    const start=Math.min(left,right),end=Math.max(left,right);
    const offset=start-c.trim,originalDuration=round(end-start);
    const pauses=(c.silenceEdit.pauses||[]).filter(p=>p.end>offset&&p.start<offset+originalDuration).map(p=>({
      start:round(clamp(p.start-offset,0,originalDuration)),
      end:round(clamp(p.end-offset,0,originalDuration)),
      cutStart:round(clamp(p.cutStart-offset,0,originalDuration)),
      cutEnd:round(clamp(p.cutEnd-offset,0,originalDuration)),
      reduced:!!p.reduced
    }));
    const clip={...c,start:c.start+a,trim:round(start),silenceEdit:{originalDuration,mode:c.silenceEdit.mode,analysisVersion:c.silenceEdit.analysisVersion,pauses}};
    clip.len=duration(clip);
    return clip;
  }
  function ripple(clips,target,oldEnd,delta){
    if(Math.abs(delta)<.000001)return 0;
    let shifted=0;
    for(const c of clips){
      if(c===target||c.id===target.id||c.track!==target.track||c.start<oldEnd-.00001)continue;
      c.start=round(Math.max(0,c.start+delta));shifted++;
    }
    return shifted;
  }
  function outputTimeAtSource(c,originalTime){
    const spans=segments(c);
    const desired=c.trim+originalTime;
    for(const s of spans){
      if(desired<s.trim)return s.at;
      if(desired<=s.trim+s.len)return s.at+desired-s.trim;
    }
    return duration(c);
  }
  function clipSlicesForExport(c){
    return segments(c).map(s=>({at:s.at,trim:s.trim,len:s.len}));
  }
  return{FRAME_SECONDS,MAX_PAUSES,ANALYSIS_VERSION,MODES,settings,analyze,segments,duration,sourceAt,slice,ripple,outputTimeAtSource,clipSlicesForExport};
});
