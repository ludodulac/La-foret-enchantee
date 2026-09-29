const assert=require('node:assert/strict');
const fs=require('fs');
const C=require('../js/studio-export-core.js');

const studio=fs.readFileSync('studio.html','utf8');
const coreSource=fs.readFileSync('js/studio-export-core.js','utf8');

function buf(d,sr=44100,ch=1,fn=(i,c)=>Math.sin((i+1)*(c+1)/23)*.25){
  const n=Math.round(d*sr),channels=Array.from({length:ch},(_,c)=>{
    const a=new Float32Array(n);for(let i=0;i<n;i++)a[i]=fn(i,c);return a;
  });
  return{duration:n/sr,length:n,sampleRate:sr,numberOfChannels:ch,getChannelData:i=>channels[i]};
}
function clip(o={}){
  const b=o.buffer||buf(o.duration||1);
  return{start:o.start??0,trim:o.trim??0,len:o.len??b.duration,gain:o.gain??1,trackGain:o.trackGain??1,muted:o.muted??false,trackMuted:o.trackMuted??false,buffer:b};
}
async function legacy(cs,start,end){
  const p=C.validatePlan(cs,start,end,{output:'memory'}),m=await C.mixPcmCooperative(cs,p),blob=await C.encodeWavCooperative(m.left,m.right,p.sampleRate);
  return new Uint8Array(await blob.arrayBuffer());
}
function namedError(name,msg){let e=Error(msg||name);e.name=name;return e}
function makeOpfs({quotaAtWrite=0,failAtWrite=0,noCreateWritable=false}={}){
  const states=new Map(),removed=[],writes=[];
  const dir={
    async getFileHandle(name,{create}={}){
      if(!states.has(name)){
        if(!create)throw namedError('NotFoundError');
        states.set(name,{parts:[],closed:false,aborted:false});
      }
      const state=states.get(name);
      const handle={
        async getFile(){return new Blob(state.parts,{type:'audio/wav'})}
      };
      if(!noCreateWritable)handle.createWritable=async()=>({
        async write(bytes){
          const n=writes.length+1;
          writes.push({name,n,size:bytes.byteLength});
          if(quotaAtWrite===n)throw namedError('QuotaExceededError','quota');
          if(failAtWrite===n)throw Error('write failed');
          state.parts.push(Uint8Array.from(bytes));
        },
        async close(){state.closed=true},
        async abort(){state.aborted=true}
      });
      return handle;
    },
    async removeEntry(name){
      if(!states.has(name))throw namedError('NotFoundError');
      removed.push(name);states.delete(name);
    }
  };
  return{navigator:{storage:{getDirectory:async()=>dir}},dir,states,removed,writes};
}
async function opfsBytes(cs,start,end,opts={}){
  const p=C.validatePlan(cs,start,end,{output:'opfs'}),fs=makeOpfs(opts),r=await C.streamWavToOpfs(cs,p,{navigator:fs.navigator,tempName:'test.wav'});
  const bytes=new Uint8Array(await r.file.arrayBuffer());
  return{p,fs,r,bytes};
}
async function identical(name,cs,start,end){
  const a=await legacy(cs,start,end),b=await opfsBytes(cs,start,end);
  assert.equal(a.length,b.bytes.length,name+' byte length');
  assert.deepEqual([...b.bytes],[...a],name+' must be byte-identical');
  await b.r.cleanup();
  return b.bytes;
}

(async()=>{
  assert.equal(C.SAMPLE_RATE,44100);
  assert.equal(C.CHUNK_FRAMES,8192);
  assert.equal(C.SCRATCH_BYTES,65536);
  assert.equal(C.PCM_CHUNK_BYTES,32768);
  assert(C.OPFS_RENDER_BYTES<1024*1024);

  const longSeconds=13*60+25;
  assert.throws(()=>C.planExport(0,longSeconds,{output:'memory'}),/export trop volumineux/);
  const longPlan=C.planExport(0,longSeconds,{output:'opfs'});
  assert.equal(longPlan.outputMode,'opfs');
  assert(longPlan.wavBytes>135*1024*1024);
  assert(longPlan.estimatedPeakBytes===C.OPFS_RENDER_BYTES);
  assert(longPlan.estimatedPeakBytes<C.MAX_PEAK_BYTES);
  console.log('13M25_PLAN_ACCEPTED_WITH_OPFS = PASS');

  const opfsStart=coreSource.indexOf('async function streamWavToOpfs');
  const opfsEnd=coreSource.indexOf('async function mixPcmCooperative',opfsStart);
  const opfsCode=coreSource.slice(opfsStart,opfsEnd);
  assert(opfsStart>=0&&opfsEnd>opfsStart);
  assert(!opfsCode.includes('new ArrayBuffer(p.wavBytes)'));
  assert(!opfsCode.includes('new Float32Array(p.frames)'));
  console.log('FULL_WAV_ARRAYBUFFER_ALLOCATION_LONG_PATH = 0');

  const feature=makeOpfs();
  assert.equal(await C.probeOpfs({navigator:feature.navigator,probeName:'probe.tmp'}),true);
  assert(feature.removed.includes('probe.tmp'));
  const noWritable=makeOpfs({noCreateWritable:true});
  assert.equal(await C.probeOpfs({navigator:noWritable.navigator,probeName:'probe2.tmp'}),false);
  assert(noWritable.removed.includes('probe2.tmp'));
  await assert.rejects(()=>C.probeOpfs({navigator:{storage:{}}}),e=>e.name==='NotSupportedError');
  console.log('OPFS_FEATURE_DETECTION = PASS navigator.storage.getDirectory + fileHandle.createWritable');

  const mono=await identical('short mono',[clip({buffer:buf(.38,44100,1,i=>Math.sin(i/13)*.32),len:.38})],0,.38);
  console.log('LEGACY_SHORT_MONO_BYTE_MATCH = PASS');

  const stereoBuffer=buf(.42,44100,2,(i,c)=>c===0?Math.sin(i/11)*.31:Math.cos(i/17)*.19);
  await identical('stereo',[clip({buffer:stereoBuffer,len:.42})],0,.42);
  console.log('LEGACY_STEREO_BYTE_MATCH = PASS');

  await identical('overlap',[
    clip({buffer:buf(.7,44100,1,()=>.22),start:0,len:.7,gain:.9,trackGain:.8}),
    clip({buffer:buf(.6,44100,2,(i,c)=>c?-.13:.17),start:.2,len:.6,gain:.7,trackGain:1})
  ],0,.8);
  console.log('LEGACY_OVERLAP_BYTE_MATCH = PASS');

  const trimmed=buf(1.2,48000,2,(i,c)=>((i%997)/997-.5)*(c?-.45:.38));
  await identical('trim gain',[clip({buffer:trimmed,start:.1,trim:.23,len:.61,gain:.43,trackGain:.72})],.18,.64);
  console.log('LEGACY_TRIM_GAIN_BYTE_MATCH = PASS');

  await identical('silence',[
    clip({buffer:buf(.5),start:0,len:.5,muted:true}),
    clip({buffer:buf(.2),start:2,len:.2})
  ],.6,1.1);
  console.log('LEGACY_SILENCE_BYTE_MATCH = PASS');

  const h=mono.slice(0,44),v=new DataView(h.buffer,h.byteOffset,h.byteLength);
  assert.equal(String.fromCharCode(...h.slice(0,4)),'RIFF');
  assert.equal(String.fromCharCode(...h.slice(8,12)),'WAVE');
  assert.equal(String.fromCharCode(...h.slice(12,16)),'fmt ');
  assert.equal(String.fromCharCode(...h.slice(36,40)),'data');
  assert.equal(v.getUint16(20,true),1);
  assert.equal(v.getUint16(22,true),2);
  assert.equal(v.getUint32(24,true),44100);
  assert.equal(v.getUint16(34,true),16);
  console.log('WAV_HEADER = PASS');
  console.log('PCM16 = PASS');
  console.log('STEREO = PASS');
  console.log('44100_HZ = PASS');

  const progress=[],yields=[];
  const p=C.validatePlan([clip({duration:.55})],0,.55,{output:'opfs'}),fs=makeOpfs();
  const r=await C.streamWavToOpfs([clip({duration:.55})],p,{
    navigator:fs.navigator,tempName:'progress.wav',
    onProgress:(n,total)=>progress.push([n,total]),
    yieldFn:async()=>{yields.push(1)}
  });
  assert(progress.length>=2);
  assert(progress.every((x,i)=>i===0||x[0]>=progress[i-1][0]));
  assert.equal(progress.at(-1)[0],progress.at(-1)[1]);
  assert.equal(yields.length,progress.length);
  assert(fs.writes.length===1+progress.length);
  assert.equal(fs.writes[0].size,44);
  assert(fs.writes.slice(1).every(x=>x.size<=C.PCM_CHUNK_BYTES));
  await r.cleanup();
  console.log('OPFS_CHUNKED_WRITE = PASS');
  console.log('PROGRESS = PASS');
  console.log('COOPERATIVE_YIELD = PASS');

  const cancelFs=makeOpfs(),controller=new AbortController();
  let yieldCount=0;
  await assert.rejects(()=>C.streamWavToOpfs([clip({duration:.6})],C.validatePlan([clip({duration:.6})],0,.6,{output:'opfs'}),{
    navigator:cancelFs.navigator,tempName:'cancel.wav',signal:controller.signal,
    yieldFn:async()=>{yieldCount++;if(yieldCount===1)controller.abort()}
  }),e=>e.name==='AbortError');
  assert(cancelFs.removed.includes('cancel.wav'));
  assert(!cancelFs.states.has('cancel.wav'));
  console.log('CANCEL = PASS');
  console.log('TEMP_CLEANUP_AFTER_CANCEL = PASS');

  const errFs=makeOpfs({failAtWrite:2});
  await assert.rejects(()=>C.streamWavToOpfs([clip({duration:.2})],C.validatePlan([clip({duration:.2})],0,.2,{output:'opfs'}),{
    navigator:errFs.navigator,tempName:'error.wav'
  }),/write failed/);
  assert(errFs.removed.includes('error.wav'));
  console.log('TEMP_CLEANUP_AFTER_ERROR = PASS');

  const quotaFs=makeOpfs({quotaAtWrite:2});
  await assert.rejects(()=>C.streamWavToOpfs([clip({duration:.2})],C.validatePlan([clip({duration:.2})],0,.2,{output:'opfs'}),{
    navigator:quotaFs.navigator,tempName:'quota.wav'
  }),e=>e.name==='QuotaExceededError');
  assert(quotaFs.removed.includes('quota.wav'));
  console.log('QUOTA_ERROR_HANDLED = PASS');

  // Short path remains memory-backed in production; OPFS is only fallback after historical memory guard.
  assert(studio.includes("StudioExportCore.planExport(start,end,{output:'memory'})"));
  assert(studio.includes("if(!/export trop volumineux/i.test(memoryError?.message||''))throw memoryError"));
  assert(studio.includes("output='opfs';preflight=StudioExportCore.planExport(start,end,{output:'opfs'})"));
  assert(studio.includes("if(output==='opfs'){opfsResult=await StudioExportCore.streamWavToOpfs"));
  assert(studio.includes("else blob=await StudioExportCore.streamWavCooperative"));
  console.log('SHORT_EXPORT_REGRESSION = PASS');

  // Selection uses the exact same exportRange start/end contract.
  assert(studio.includes("exportRange(start,end,'selection-son',true)"));
  assert(studio.includes("StudioExportCore.validatePlan(xs,start,end,{output})"));
  console.log('SELECTION_EXPORT_REGRESSION = PASS');

  assert(studio.includes("let url=URL.createObjectURL(x.blob)"));
  assert(studio.includes("a.download=x.filename"));
  assert(studio.includes("if(cleanup)Promise.resolve(cleanup())"));
  console.log('DOWNLOAD_FILE_PATH = PASS File/Blob -> object URL -> anchor download');

  assert(studio.includes("if(x.opfsBacked)return msg('Upload long non activé dans cette mission · télécharge le WAV')"));
  assert(!coreSource.includes('Supabase'));
  console.log('FOREST_LONG_UPLOAD_TOUCHED = NO');

  console.log('OUTPUT_AUDIO_IDENTICAL = YES');
  console.log('Studio bounded OPFS WAV 011E tests PASS');
})().catch(e=>{console.error(e);process.exit(1)});
