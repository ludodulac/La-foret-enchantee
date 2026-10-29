const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const C=require('../js/studio-recording-wav-core.js');
function err(name){let e=Error(name);e.name=name;return e}
function memoryOpfs({failClose=false}={}){
  const files=new Map(),dirs=new Map(),writes=[];
  function directory(map){return{
    async getDirectoryHandle(name,{create=false}={}){if(!dirs.has(name)){if(!create)throw err('NotFoundError');dirs.set(name,directory(new Map()))}return dirs.get(name)},
    async getFileHandle(name,{create=false}={}){if(!map.has(name)){if(!create)throw err('NotFoundError');map.set(name,new Blob([]))}return{
      async getFile(){return map.get(name)},
      async createWritable(){const chunks=[];return{async write(v){writes.push(name);chunks.push(v)},async close(){if(failClose)throw err('QuotaExceededError');map.set(name,new Blob(chunks))},async abort(){}}}
    }},
    async *entries(){for(const [k,v] of map)yield[k,v]},
    _map:map
  }}
  const root=directory(files);return{root,dirs,writes};
}
(async()=>{
  assert.throws(()=>C.header(123,0),/Frequence/);
  assert.throws(()=>C.header(0,44100),/frames/);
  assert.throws(()=>C.parseHeader(new Uint8Array(43)),/tronque/);
  const hdr=C.header(48000,48000),info=C.parseHeader(hdr);
  assert.deepEqual(info,{sampleRate:48000,frames:48000,bytes:96044});
  assert.equal(C.parseHeader(C.header(48000*35*60,48000)).frames,48000*35*60); // 35 min sans allouer le PCM
  const fs1=memoryOpfs(),take=await C.createTake(fs1.root,{id:'take_A',sampleRate:48000});
  await assert.rejects(()=>C.createTake(fs1.root,{id:'take_A',sampleRate:48000}),/existante/);
  const samples=new Uint8Array(48000*2);samples[0]=0x11;samples[1]=0x44;samples[samples.length-2]=0x22;samples[samples.length-1]=0x33;
  assert.equal((await C.appendChunk(take,0,samples)).frames,48000);
  assert.equal((await C.appendChunk(take,1,samples)).bytes,96044);
  await assert.rejects(()=>C.appendChunk(take,0,samples),/deja present/);
  assert.equal((await C.recoverTake(fs1.root,'take_A')).seconds,2);
  assert(fs1.writes.includes('part-000000.wav'));
  const r=await C.recoverTake(fs1.root,'take_A');
  const result=[];const sink={async write(x){result.push(x)},async close(){this.closed=true}};
  await C.exportToWritable(r,sink);
  assert.equal(sink.closed,true);
  assert.equal(result.length,3); // entete global + 2 slices, jamais de copie PCM globale
  assert.equal(C.parseHeader(result[0]).frames,96000);
  assert.deepEqual(new Uint8Array(await result[1].arrayBuffer()).slice(0,2),samples.slice(0,2));
  const testOther=await C.createTake(fs1.root,{id:'gapped',sampleRate:44100});
  await C.appendChunk(testOther,0,new Uint8Array(200));
  await C.appendChunk(testOther,2,new Uint8Array(200));
  const gap=await C.recoverTake(fs1.root,'gapped');
  assert.equal(gap.interrupted,true);assert.equal(gap.segments,1);assert.match(gap.problem,/manquant/);
  await assert.rejects(()=>C.exportToWritable(gap,sink),/incomplete/);
  const broken=await C.createTake(fs1.root,{id:'truncated',sampleRate:44100});
  await C.appendChunk(broken,0,new Uint8Array(100));
  const f=await broken.dir.getFileHandle(C.nameFor(0));
  const real=await f.getFile(); // remplacer par un fichier partiel sans changer le nom
  broken.dir._map.set(C.nameFor(0),real.slice(0,real.size-1));
  const corrupt=await C.recoverTake(fs1.root,'truncated');
  assert.equal(corrupt.interrupted,true);assert.equal(corrupt.segments,0);
  const quota=memoryOpfs({failClose:true});
  await assert.rejects(()=>C.createTake(quota.root,{id:'quota',sampleRate:44100}),e=>e.name==='QuotaExceededError');
  // Le Worklet produit du PCM16 mono par paquets d'une seconde puis flush final.
  let Worklet;const out=[];class Processor{constructor(){this.port={postMessage:(value)=>out.push(value),onmessage:null}}}
  vm.runInNewContext(fs.readFileSync('js/studio-recording-wav-worklet.js','utf8'),{AudioWorkletProcessor:Processor,sampleRate:8000,registerProcessor:(name,klass)=>{assert.equal(name,'studio-recording-wav');Worklet=klass},ArrayBuffer,DataView,Number,Math});
  const worklet=new Worklet();
  for(let i=0;i<64;i++)worklet.process([ [new Float32Array(128).fill(.5)] ]);
  assert.equal(out.filter(x=>x.type==='pcm').length,1);
  assert.equal(out[0].bytes.byteLength,16000);
  worklet.port.onmessage({data:{type:'stop'}});
  assert.equal(out.filter(x=>x.type==='pcm').length,2);
  assert.equal(out[1].bytes.byteLength,384);
  assert.equal(out.at(-1).type,'stopped');
  assert.equal(new DataView(out[0].bytes).getInt16(0,true),16384);
  console.log('STUDIO-WAV-REC-001: header, stockage OPFS, reprise, trou, corruption, quota, export borne et Worklet PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
