const assert=require('node:assert/strict');
const Core=require('../js/studio-recording-wav-core.js');
const Long=require('../js/studio-wav-long-source.js');
const Player=require('../js/studio-wav-long-playback.js');
(async()=>{
  const sampleRate=48000,pcm=new Uint8Array(sampleRate*2);
  const dv=new DataView(pcm.buffer);for(let i=0;i<sampleRate;i++)dv.setInt16(2*i,8192,true);
  const file=new Blob([Core.header(sampleRate,sampleRate),pcm],{type:'audio/wav'});
  const recovered={take:{meta:{id:'rec-test-stream',sampleRate},dir:{async getFileHandle(){
    return{getFile:async()=>file};
  }}},segments:6,frames:6*sampleRate,seconds:6,interrupted:false};
  const index=await Long.indexRecovered(recovered,{yieldFn:async()=>{}});
  const plan=await Player.prepare(index,3*sampleRate,6*sampleRate);
  assert.equal(plan.first.length,24000,'prefetch only first half second');
  assert(plan.first.every(x=>x===.25));
  const events=[],nodes=[];
  const context={currentTime:0,destination:{},createGain(){
    return{gain:{value:1},connect(){},disconnect(){events.push('disconnect')}};
  },createBuffer(ch,n,rate){
    assert.equal(ch,1);assert.equal(rate,sampleRate);assert(n<=24000);
    const pcm=new Float32Array(n);return{getChannelData(){return pcm},length:n};
  },createBufferSource(){const node={start(t){events.push({type:'start',at:t,data:this.buffer.getChannelData(0)[0]})},
    connect(){},stop(){events.push('stop')},onended:null,buffer:null};nodes.push(node);return node}};
  let interval=null,errors=[];
  const stream=Player.start(context,plan,{when:.5,gain:.8,onError:e=>errors.push(e),
    every:fn=>{interval=fn;return 1},cancelEvery:()=>{interval=null}});
  assert.equal(stream.stats.scheduledChunks,1);
  assert.equal(events[0].at,.5);
  assert.equal(events[0].data,.25);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert(stream.stats.scheduledChunks>=2);
  assert(stream.stats.maxBufferFrames<=24000);
  context.currentTime=1.1;
  await stream.pump();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(stream.stats.scheduledChunks,6,'3 seconds should schedule six bounded chunks');
  assert.equal(stream.stats.scheduledFrames,3*sampleRate);
  assert.equal(errors.length,0);
  const times=events.filter(x=>x.type==='start').map(x=>x.at);
  assert.deepEqual(times,[.5,1,1.5,2,2.5,3]);
  assert.equal(interval,null,'finished schedule cancels timer');
  stream.stop();
  assert.equal(stream.active(),false);
  assert(events.includes('stop'));
  await assert.rejects(()=>Player.prepare(index,0,7*sampleRate),/invalide/);
  assert.throws(()=>Player.start(context,plan,{when:.01}),/trop proche/);
  // Slow OPFS must be a visible error, NEVER silently claim full playback.
  context.currentTime=0;errors=[];
  const underrun=Player.start(context,await Player.prepare(index,0,6*sampleRate),{when:.5,
    onError:e=>errors.push(e),every:()=>2,cancelEvery:()=>{}});
  await new Promise(resolve=>setTimeout(resolve,0));
  context.currentTime=3.5;
  await underrun.pump();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(underrun.active(),false);
  assert.match(errors[0].message,/trop lente/);
  console.log('STUDIO-WAV-PLAYBACK-022: 500ms bounded WAV chunks, seek, aligned schedule, cancel, underrun error PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
