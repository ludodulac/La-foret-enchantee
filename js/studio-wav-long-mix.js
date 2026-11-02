(function(root,factory){
  const api=factory(
    typeof module==='object'&&module.exports?require('./studio-export-core.js'):root.StudioExportCore,
    typeof module==='object'&&module.exports?require('./studio-wav-long-source.js'):root.StudioWavLongSource
  );
  if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioWavLongMix=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Export,Long){
'use strict';
// OPFS -> 8192 frames stereo PCM16 -> OPFS. Ni WAV source ni mix entier en RAM.
const MAX_MIX_SECONDS=3600,CHUNK_FRAMES=Export.CHUNK_FRAMES,SR=Export.SAMPLE_RATE;
function cancelled(signal){if(signal?.aborted){const e=Error('Export annulé');e.name='AbortError';throw e}}
function validate(clips,plan){
  if(!plan||plan.outputMode!=='opfs'||plan.sampleRate!==SR||
    !Number.isSafeInteger(plan.frames)||plan.frames<1||plan.duration>MAX_MIX_SECONDS||
    plan.wavBytes!==44+plan.frames*4||plan.wavBytes>0xffffffff)throw Error('Plan de mixage long invalide');
  if(!Array.isArray(clips)||clips.length>200)throw Error('Nombre de pistes invalide');
  for(const c of clips){
    if(!c||![c.start,c.trim,c.len,c.gain,c.trackGain].every(Number.isFinite)||
      c.start<0||c.trim<0||c.len<0||c.gain<0||c.trackGain<0)throw Error('Clip de mixage invalide');
    if(c.index){
      if(!Number.isInteger(c.index.rate)||c.index.frames<1||!c.index.take||
        c.trim+c.len>c.index.seconds+Math.max(.01,2/c.index.rate))
        throw Error('Durée de prise WAV incompatible');
    }else if(!c.buffer||typeof c.buffer.getChannelData!=='function'||
      !Number.isInteger(c.buffer.sampleRate)||c.buffer.sampleRate<1||
      c.trim+c.len>c.buffer.duration+Math.max(.02,2/c.buffer.sampleRate))
        throw Error('Source audio de clip absente');
  }
  return plan;
}
function wavHeader(frames,rate){
  const b=new ArrayBuffer(44),v=new DataView(b);let pos=0;
  const str=s=>{for(const ch of s)v.setUint8(pos++,ch.charCodeAt(0))};
  const u32=n=>{v.setUint32(pos,n,true);pos+=4};
  const u16=n=>{v.setUint16(pos,n,true);pos+=2};
  str('RIFF');u32(36+frames*4);str('WAVEfmt ');u32(16);u16(1);u16(2);
  u32(rate);u32(rate*4);u16(4);u16(16);str('data');u32(frames*4);
  return new Uint8Array(b);
}
async function renderChunks(clips,plan,{onChunk,onProgress=()=>{},signal,yieldFn=Export.yieldToEventLoop}={}){
  validate(clips,plan);
  if(typeof onChunk!=='function')throw Error('Sortie de mixage absente');
  const a=new Float32Array(CHUNK_FRAMES),b=new Float32Array(CHUNK_FRAMES);
  const bytes=new ArrayBuffer(CHUNK_FRAMES*4),out=new DataView(bytes);
  const jobs=clips.filter(c=>!c.muted&&!c.trackMuted&&c.gain*c.trackGain>0&&
    c.start+c.len>plan.start&&c.start<plan.end).map(c=>({
      c,from:Math.max(0,Math.floor((c.start-plan.start)*SR)),
      to:Math.min(plan.frames,Math.ceil((c.start+c.len-plan.start)*SR)),
      channels:!c.index?[c.buffer.getChannelData(0),c.buffer.getChannelData(Math.min(1,c.buffer.numberOfChannels-1))]:null
    }));
  for(let base=0;base<plan.frames;base+=CHUNK_FRAMES){
    cancelled(signal);
    const count=Math.min(CHUNK_FRAMES,plan.frames-base);a.fill(0,0,count);b.fill(0,0,count);
    for(const job of jobs){
      const {c}=job,begin=Math.max(base,job.from),end=Math.min(base+count,job.to);
      if(begin>=end)continue;
      const gain=c.gain*c.trackGain,rate=c.index?.rate||c.buffer.sampleRate;
      // Identical sample-position rule to the existing Studio export engine.
      const at=i=>Math.floor((c.trim+(plan.start+i/SR-c.start))*rate);
      let win=null,origin=0;
      if(c.index){
        const first=at(begin),last=at(end-1),left=Math.max(0,first),right=Math.min(c.index.frames-1,last);
        if(right>=left){origin=left;win=await Long.readWindow(c.index,left,right-left+1,{signal})}
      }
      for(let i=begin;i<end;i++){
        const sample=at(i),k=i-base;
        if(c.index){
          if(win&&sample>=origin&&sample<origin+win.length){const val=win[sample-origin]*gain;a[k]+=val;b[k]+=val}
        }else{
          const [l,r]=job.channels;
          if(sample>=0&&sample<l.length){a[k]+=l[sample]*gain;b[k]+=r[Math.min(sample,r.length-1)]*gain}
        }
      }
    }
    let o=0;
    for(let i=0;i<count;i++){out.setInt16(o,Export.pcm16(a[i]),true);o+=2;out.setInt16(o,Export.pcm16(b[i]),true);o+=2}
    await onChunk(new Uint8Array(bytes,0,count*4),base,count);
    onProgress(base+count,plan.frames);
    await yieldFn();cancelled(signal);
  }
}
function tempName(){return '.studio-wav-mix-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.tmp.wav'}
async function streamToOpfs(clips,plan,{navigator:nav=typeof navigator!=='undefined'?navigator:null,directory,
  signal,onProgress,yieldFn,tempFileName}={}){
  validate(clips,plan);cancelled(signal);
  const dir=directory||await nav?.storage?.getDirectory?.();
  if(!dir)throw Error('OPFS indisponible pour le mixage');
  // Prevent an obviously impossible OPFS write without claiming guaranteed quota.
  if(!directory&&typeof nav?.storage?.estimate==='function'){
    const e=await nav.storage.estimate();
    if(Number.isFinite(e.quota)&&Number.isFinite(e.usage)&&e.quota-e.usage<plan.wavBytes){
      const err=Error('Stockage insuffisant pour le WAV final');err.name='QuotaExceededError';throw err
    }
  }
  const name=tempFileName||tempName();
  if(!/^\.studio-wav-mix-[a-z0-9-]+\.tmp\.wav$/.test(name))throw Error('Nom de fichier temporaire invalide');
  let handle=null,writer=null,closed=false,cleaned=false;
  const cleanup=async()=>{if(cleaned)return;cleaned=true;await dir.removeEntry(name)};
  try{
    handle=await dir.getFileHandle(name,{create:true});
    writer=await handle.createWritable();
    await writer.write(wavHeader(plan.frames,SR));
    await renderChunks(clips,plan,{signal,onProgress,yieldFn,
      onChunk:async data=>{cancelled(signal);await writer.write(data);cancelled(signal)}});
    cancelled(signal);
    await writer.close();closed=true;
    const file=await handle.getFile();
    if(file.size!==plan.wavBytes)throw Error('Mixage WAV incomplet : taille incohérente');
    const h=new DataView(await file.slice(0,44).arrayBuffer());
    if(h.getUint32(4,true)!==plan.wavBytes-8||h.getUint32(40,true)!==plan.wavBytes-44)
      throw Error('Mixage WAV final non valide');
    return{blob:file,file,tempName:name,cleanup};
  }catch(e){
    if(writer&&!closed)try{await writer.abort?.(e)}catch{}
    try{await cleanup()}catch{}
    throw e;
  }
}
const TEMP_PATTERN=/^\.studio-wav-mix-[a-z0-9-]+\.tmp\.wav$/;
async function listTemporaryExports(dir){
  if(!dir||typeof dir.entries!=='function')throw Error('Stockage local inaccessible');
  const entries=[];
  for await(const [name,handle] of dir.entries()){
    if(handle?.kind!=='file'||!TEMP_PATTERN.test(name))continue;
    const file=await(await dir.getFileHandle(name)).getFile();
    entries.push({name,size:file.size});
  }
  return entries.sort((a,b)=>a.name.localeCompare(b.name));
}
async function removeTemporaryExports(dir,names){
  if(!Array.isArray(names)||names.some(name=>typeof name!=='string'||!TEMP_PATTERN.test(name)))
    throw Error('Suppression refusée : seuls les exports temporaires Studio WAV sont autorisés');
  if(new Set(names).size!==names.length)throw Error('Doublon de fichier temporaire');
  for(const name of names)await dir.removeEntry(name);
  return names.length;
}
return{MAX_MIX_SECONDS,CHUNK_FRAMES,SR,validate,wavHeader,renderChunks,streamToOpfs,listTemporaryExports,removeTemporaryExports};
});