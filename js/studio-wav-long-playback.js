(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./studio-wav-long-source.js'):root.StudioWavLongSource);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioWavLongPlayback=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Long){
'use strict';
const CHUNK_SECONDS=.5,LOOKAHEAD_SECONDS=1.5,START_LEAD_SECONDS=.4;
function checkPlan(index,startFrame,endFrame){
  if(!index||!Number.isInteger(index.rate)||!Number.isSafeInteger(startFrame)||!Number.isSafeInteger(endFrame)
    ||startFrame<0||endFrame>index.frames||endFrame<=startFrame)throw Error('Intervalle WAV invalide');
}
async function prepare(index,startFrame,endFrame,{signal}={}){
  checkPlan(index,startFrame,endFrame);
  const count=Math.min(endFrame-startFrame,Math.max(1,Math.floor(index.rate*CHUNK_SECONDS)));
  const first=await Long.readWindow(index,startFrame,count,{signal});
  return{index,startFrame,endFrame,first};
}
// First window has already been read and checked. Never assemble long audio or decodeAudioData.
function start(ctx,plan,{when,gain=1,destination=ctx.destination,onError=()=>{},
  every=(fn,ms)=>setInterval(fn,ms),cancelEvery=id=>clearInterval(id)}={}){
  if(!ctx||typeof ctx.createBuffer!=='function'||!plan||!(plan.first instanceof Float32Array))
    throw Error('Lecteur WAV progressif indisponible');
  const {index,startFrame,endFrame,first}=plan;
  checkPlan(index,startFrame,endFrame);
  if(!Number.isFinite(when)||when<ctx.currentTime+.06)throw Error('Début lecture WAV trop proche');
  if(!Number.isFinite(gain)||gain<0||gain>2)throw Error('Volume WAV invalide');
  let running=true,busy=false,handle=null,nextFrame=startFrame,failed=false;
  const nodes=new Set(),output=ctx.createGain();output.gain.value=gain;output.connect(destination);
  const stats={maxBufferFrames:0,scheduledFrames:0,scheduledChunks:0};
  function schedule(pcm){
    if(!running)return;
    const chunkAt=when+(nextFrame-startFrame)/index.rate;
    if(chunkAt<ctx.currentTime+.025)throw Error('Lecture WAV trop lente : flux interrompu');
    const buffer=ctx.createBuffer(1,pcm.length,index.rate);
    buffer.getChannelData(0).set(pcm);
    const node=ctx.createBufferSource();node.buffer=buffer;node.connect(output);nodes.add(node);
    node.onended=()=>nodes.delete(node);
    node.start(chunkAt);
    stats.maxBufferFrames=Math.max(stats.maxBufferFrames,pcm.length);
    stats.scheduledFrames+=pcm.length;stats.scheduledChunks++;
    nextFrame+=pcm.length;
  }
  function stop(){
    if(!running)return;
    running=false;if(handle!==null)cancelEvery(handle);
    for(const n of nodes)try{n.stop()}catch{}nodes.clear();
    try{output.disconnect()}catch{}
  }
  const fail=e=>{if(failed||!running)return;failed=true;stop();onError(e)};
  // Schedule the very first PCM window synchronously to preserve alignment with other tracks.
  try{schedule(first)}catch(e){stop();throw e}
  async function pump(){
    if(!running||busy||nextFrame>=endFrame)return;
    busy=true;
    try{
      while(running&&nextFrame<endFrame){
        const whenNext=when+(nextFrame-startFrame)/index.rate;
        if(whenNext>=ctx.currentTime+LOOKAHEAD_SECONDS)break;
        const count=Math.min(endFrame-nextFrame,Math.max(1,Math.floor(index.rate*CHUNK_SECONDS)));
        const at=nextFrame;
        const pcm=await Long.readWindow(index,at,count);
        if(!running)break;
        if(nextFrame!==at)throw Error('Lecteur WAV : décalage de séquence');
        schedule(pcm);
      }
      if(nextFrame>=endFrame&&handle!==null){cancelEvery(handle);handle=null}
    }catch(e){fail(e)}finally{busy=false}
  }
  if(nextFrame<endFrame)handle=every(()=>{void pump()},100);
  void pump();
  return{stop,pump,stats,active:()=>running,readyFrames:()=>nextFrame-startFrame};
}
return{CHUNK_SECONDS,LOOKAHEAD_SECONDS,START_LEAD_SECONDS,prepare,start};
});
