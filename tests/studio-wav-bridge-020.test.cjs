const assert=require('node:assert/strict');
const C=require('../js/studio-recording-wav-core.js');
const Wave=require('../js/studio-waveform-core.js');
const Bridge=require('../js/studio-wav-bridge.js');
(async()=>{
  assert.equal(Bridge.MAX_ATTACH_SECONDS,30);
  const rate=8000,framesPerPart=4000;
  const parts=new Map();
  for(let i=0;i<2;i++){
    const pcm=new Uint8Array(framesPerPart*2),v=new DataView(pcm.buffer);
    for(let j=0;j<framesPerPart;j++)v.setInt16(j*2,i===0?16384:-8192,true);
    parts.set(C.nameFor(i),new Blob([C.header(framesPerPart,rate),pcm],{type:'audio/wav'}));
  }
  const recovered={
    take:{meta:{sampleRate:rate,id:'take_short'},dir:{
      async getFileHandle(name){
        assert(parts.has(name),'no missing OPFS part permitted');
        return{getFile:async()=>parts.get(name)}
      }
    }},
    frames:framesPerPart*2,segments:2,seconds:1,interrupted:false
  };
  const item=await Bridge.makeShortClipSource(recovered,{yieldFn:async()=>{}});
  assert.equal(item.takeId,'take_short');
  assert.equal(item.seconds,1);
  assert.equal(item.blob.size,16044);
  assert.deepEqual(C.parseHeader(new Uint8Array(await item.blob.slice(0,44).arrayBuffer())),
    {sampleRate:rate,frames:8000,bytes:16044});
  assert.equal(item.waveform.version,Wave.WAVEFORM_VERSION);
  assert.equal(item.waveform.peakRate,Wave.PEAK_RATE);
  assert.equal(item.waveform.duration,1);
  assert.equal(item.waveform.peaks.length,256);
  assert(item.waveform.peaks.slice(0,128).some(x=>x>=126&&x<=129));
  assert(item.waveform.peaks.slice(128).some(x=>x>=62&&x<=65));
  assert.equal(parts.size,2,'OPFS originals preserved');
  await assert.rejects(()=>Bridge.makeShortClipSource({...recovered,frames:31*rate,seconds:31}),/30 secondes/);
  await assert.rejects(()=>Bridge.makeShortClipSource({...recovered,interrupted:true}),/incomplète/);
  assert.deepEqual(C.parseHeader(new Uint8Array(await parts.get(C.nameFor(0)).slice(0,44).arrayBuffer())),
    {sampleRate:rate,frames:4000,bytes:8044});
  const old=parts.get(C.nameFor(1));
  parts.set(C.nameFor(1),old.slice(0,old.size-1));
  await assert.rejects(()=>Bridge.makeShortClipSource(recovered,{yieldFn:async()=>{}}),/altéré/);
  console.log('STUDIO-WAV-BRIDGE-020: bounded PCM waveform, full short WAV, safety against long/corrupt, OPFS preserved PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
