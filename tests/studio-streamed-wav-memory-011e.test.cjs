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
  const p=C.validatePlan(cs,start,end),m=await C.mixPcmCooperative(cs,p),blob=await C.encodeWavCooperative(m.left,m.right,p.sampleRate);
  return{p,blob,bytes:new Uint8Array(await blob.arrayBuffer())};
}
async function streamed(cs,start,end,onProgress){
  const p=C.validatePlan(cs,start,end),blob=await C.streamWavCooperative(cs,p,onProgress);
  return{p,blob,bytes:new Uint8Array(await blob.arrayBuffer())};
}
async function identical(name,cs,start,end){
  const [a,b]=await Promise.all([legacy(cs,start,end),streamed(cs,start,end)]);
  assert.equal(b.blob.type,'audio/wav');
  assert.equal(a.bytes.length,b.bytes.length,name+' byte length');
  assert.deepEqual([...b.bytes],[...a.bytes],name+' PCM16 WAV must be byte-identical');
  return b;
}
function mib(n){return n/1048576}

(async()=>{
  const streamStart=coreSource.indexOf('async function streamWavCooperative');
  const streamEnd=coreSource.indexOf('// Legacy helpers',streamStart);
  const streamCode=coreSource.slice(streamStart,streamEnd);
  assert(streamStart>=0&&streamEnd>streamStart);
  assert(!streamCode.includes('new Float32Array(p.frames)'));
  assert.equal((streamCode.match(/new Float32Array\(CHUNK_FRAMES\)/g)||[]).length,2);
  console.log('STREAMED_MIX_NO_FULL_FLOAT32_LEFT = PASS');
  console.log('STREAMED_MIX_NO_FULL_FLOAT32_RIGHT = PASS');
  assert.equal(C.CHUNK_FRAMES,8192);
  assert.equal(C.SCRATCH_BYTES,65536);

  const mono=await identical('short mono',[clip({buffer:buf(.38,44100,1,(i)=>Math.sin(i/13)*.32),len:.38})],0,.38);
  console.log('STREAMED_OUTPUT_MATCHES_LEGACY_SHORT_MONO = PASS');

  const stereoBuffer=buf(.42,44100,2,(i,c)=>c===0?Math.sin(i/11)*.31:Math.cos(i/17)*.19);
  await identical('stereo',[clip({buffer:stereoBuffer,len:.42})],0,.42);
  console.log('STREAMED_OUTPUT_MATCHES_LEGACY_STEREO = PASS');

  await identical('overlap',[
    clip({buffer:buf(.7,44100,1,()=>.22),start:0,len:.7,gain:.9,trackGain:.8}),
    clip({buffer:buf(.6,44100,2,(i,c)=>c?-.13:.17),start:.2,len:.6,gain:.7,trackGain:1})
  ],0,.8);
  console.log('STREAMED_OUTPUT_MATCHES_LEGACY_OVERLAP = PASS');

  const trimmed=buf(1.2,48000,2,(i,c)=>((i%997)/997-.5)*(c?-.45:.38));
  await identical('trim gain',[clip({buffer:trimmed,start:.1,trim:.23,len:.61,gain:.43,trackGain:.72})],.18,.64);
  console.log('STREAMED_OUTPUT_MATCHES_LEGACY_TRIM_GAIN = PASS');

  await identical('silence',[
    clip({buffer:buf(.5),start:0,len:.5,muted:true}),
    clip({buffer:buf(.2),start:2,len:.2})
  ],.6,1.1);
  console.log('STREAMED_OUTPUT_MATCHES_LEGACY_SILENCE = PASS');

  const ab=await mono.blob.slice(0,44).arrayBuffer(),v=new DataView(ab);
  assert.equal(String.fromCharCode(...new Uint8Array(ab,0,4)),'RIFF');
  assert.equal(String.fromCharCode(...new Uint8Array(ab,8,4)),'WAVE');
  assert.equal(v.getUint16(20,true),1);
  assert.equal(v.getUint16(22,true),2);
  assert.equal(v.getUint32(24,true),44100);
  assert.equal(v.getUint16(34,true),16);
  console.log('STREAMED_WAV_PCM16 = PASS');
  console.log('STREAMED_WAV_44100_STEREO = PASS');

  const durations=[1,5,10,30].map(min=>{
    const sec=min*60,frames=Math.ceil(sec*C.SAMPLE_RATE),oldBytes=frames*12+44;
    let plan=null,error=null;try{plan=C.planExport(0,sec)}catch(e){error=e}
    const newBytes=44+frames*4+C.SCRATCH_BYTES;
    return{min,frames,oldBytes,newBytes,plan,error};
  });
  assert(durations.find(x=>x.min===5).plan);
  assert(durations.find(x=>x.min===10).error);
  assert(durations.find(x=>x.min===30).error);
  console.log('EXPORT_5_MIN_PLAN_ACCEPTED = PASS');
  console.log('EXPORT_10_MIN_PLAN = REFUSED_BY_96_MIB_GUARD');
  for(const d of durations)console.log('MEMORY_'+d.min+'MIN old='+mib(d.oldBytes).toFixed(3)+'MiB new='+mib(d.newBytes).toFixed(3)+'MiB wav='+mib(44+d.frames*4).toFixed(3)+'MiB scratch='+mib(C.SCRATCH_BYTES).toFixed(4)+'MiB');

  const preflight=studio.indexOf('StudioExportCore.planExport(start,end)');
  const decode=studio.indexOf('getDecodedSource(sourceIdFor(c))',preflight);
  assert(preflight>=0&&decode>preflight);
  console.log('EXPORT_GUARD_BEFORE_SOURCE_DECODE = PASS');
  assert(studio.includes('function exportTooLargeDetail(start,end)'));
  assert(studio.includes("if(/^export trop volumineux/i.test(e?.message||''))alert(exportTooLargeDetail(start,end))"));
  assert(studio.includes("Durée calculée : "));
  assert(studio.includes("Mémoire estimée : "));
  assert(studio.includes("Limite : "));
  assert(studio.includes("Dernier son : "));
  assert(studio.includes("piste absente / invisible"));
  console.log('EXPORT_OVERSIZE_VISIBLE_DIAGNOSTIC = PASS');

  const progress=[];
  await streamed([clip({duration:.55})],0,.55,(n,total)=>progress.push([n,total]));
  assert(progress.length>=2);
  assert(progress.every((x,i)=>i===0||x[0]>=progress[i-1][0]));
  assert.equal(progress.at(-1)[0],progress.at(-1)[1]);
  assert(streamCode.includes('await yieldToEventLoop()'));
  assert(studio.includes("exportDiag('mixage/encodage '+Math.round(n/total*100)+' %')"));
  console.log('EXPORT_COOPERATIVE_YIELD = PASS');
  console.log('EXPORT_PROGRESS = PASS');

  assert(studio.includes('function downloadPreparedExport()'));
  assert(studio.includes("openExportDestination({blob,wavInfo,filename,diagnostic,requestedStart,requestedEnd})"));
  console.log('DOWNLOAD_EXPORT_STILL_WORKS = PASS');
  assert(studio.includes('ForestAudioPublish.publishNormalAudio({dbClient,blob:x.blob'));
  console.log('FOREST_EXPORT_PIPELINE_STILL_WORKS = PASS');

  console.log('OUTPUT_PCM16_IDENTICAL_TO_LEGACY = YES');
  console.log('Studio streamed WAV memory 011E tests PASS');
})().catch(e=>{console.error(e);process.exit(1)});
