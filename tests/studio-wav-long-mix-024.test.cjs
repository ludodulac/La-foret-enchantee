const assert=require('node:assert/strict');
const C=require('../js/studio-recording-wav-core.js');
const E=require('../js/studio-export-core.js');
const L=require('../js/studio-wav-long-source.js');
const M=require('../js/studio-wav-long-mix.js');
(async()=>{
  const rate=48000,part=new Uint8Array(rate*2),v=new DataView(part.buffer);
  for(let i=0;i<rate;i++)v.setInt16(2*i,16384,true);
  const chunk=new Blob([C.header(rate,rate),part],{type:'audio/wav'});
  let maxRead=0,opened=0;
  const take={meta:{id:'rec-long',sampleRate:rate},dir:{
    async getFileHandle(name){assert.match(name,/^part-\d{6}\.wav$/);opened++;
      return{getFile:async()=>({
        size:chunk.size,
        slice(a,b){maxRead=Math.max(maxRead,b-a);return chunk.slice(a,b)},
        async arrayBuffer(){throw Error('Never buffer whole audio file')}
      })};
    }
  }};
  const recovered={take,segments:2,frames:rate*2,seconds:2,interrupted:false};
  const index=await L.indexRecovered(recovered,{yieldFn:async()=>{}});
  assert.equal(index.seconds,2);
  let outFile=null,writes=[],removed=0,aborted=0;
  const outputDir={async getFileHandle(name,{create}={}){
    assert.equal(create,true);assert.match(name,/^\.studio-wav-mix-[a-z0-9-]+\.tmp\.wav$/);
    return{async createWritable(){return{
      async write(chunk){assert(chunk.byteLength<=E.PCM_CHUNK_BYTES||chunk.byteLength===44);writes.push(chunk.slice())},
      async close(){outFile=new Blob(writes,{type:'audio/wav'})},
      async abort(){aborted++}
    }},async getFile(){return outFile}}
  },async removeEntry(){removed++}};
  const simple={sampleRate:E.SAMPLE_RATE,duration:1,length:E.SAMPLE_RATE,numberOfChannels:1,
    getChannelData(){return new Float32Array(E.SAMPLE_RATE).fill(.25)}};
  const long={start:0,trim:0,len:2,gain:1,trackGain:1,index};
  const short={start:0,trim:0,len:1,gain:1,trackGain:1,buffer:simple};
  const plan=E.planExport(0,2,{output:'opfs'});
  assert.equal(plan.sampleRate,44100);
  let lastProgress=0;
  const result=await M.streamToOpfs([long,short],plan,{
    directory:outputDir,yieldFn:async()=>{},onProgress:(n,total)=>{lastProgress=n/total}});
  assert.equal(lastProgress,1);
  assert.equal(result.file.size,plan.wavBytes);
  assert.equal(maxRead<=44+M.CHUNK_FRAMES*rate/E.SAMPLE_RATE*2+10,true,'bounded input sample window');
  assert(writes.length>2,'bounded chunks, not one full WAV write');
  const header=new DataView(await result.file.slice(0,44).arrayBuffer());
  assert.equal(header.getUint16(22,true),2);assert.equal(header.getUint32(24,true),44100);
  assert.equal(header.getUint32(40,true),plan.frames*4);
  async function frame(at){
    const pos=44+Math.round(at*plan.sampleRate)*4,v=new DataView(await result.file.slice(pos,pos+4).arrayBuffer());
    return[v.getInt16(0,true),v.getInt16(2,true)];
  }
  const atStart=await frame(0),atHalf=await frame(.5),atEnd=await frame(1.5);
  for(const sample of [...atStart,...atHalf])assert(Math.abs(sample-24575)<=2,'two-track mix 0.5+0.25');
  for(const sample of atEnd)assert(Math.abs(sample-16383)<=2,'later long-only 0.5');
  assert.equal(removed,0);
  await result.cleanup();await result.cleanup();assert.equal(removed,1);
  // Preserve original source when canceled or when export cannot be completed.
  const ctrl=new AbortController();outFile=null;writes=[];let thrown=false;
  try{await M.streamToOpfs([long],plan,{directory:outputDir,signal:ctrl.signal,
    yieldFn:async()=>{},onProgress:()=>ctrl.abort()})}catch(e){thrown=e.name==='AbortError'}
  assert.equal(thrown,true);
  assert.equal(aborted,1);
  assert.equal(removed,2);
  const huge=E.planExport(0,35*60,{output:'opfs'});
  M.validate([long],huge);assert(huge.wavBytes>350*1024*1024);
  assert(huge.estimatedPeakBytes<1e6,'35-minute peak scratch independent of WAV duration');
  const unsupported=E.planExport(0,3601,{output:'opfs'});
  assert.throws(()=>M.validate([long],unsupported),/invalide/);
  assert.throws(()=>M.validate([{...long,trim:2}],plan),/incompatible/);
  assert.equal(opened>0,true);
  console.log('STUDIO-WAV-MIX-024: 2-track mix, 8192-frame RAM bound, verified output, 35min plan, safe cancel PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
