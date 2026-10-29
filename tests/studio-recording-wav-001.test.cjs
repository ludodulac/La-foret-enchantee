const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const C=require('../js/studio-recording-wav-core.js');
function err(name){let e=Error(name);e.name=name;return e}
function memoryOpfs({failClose=false}={}){
  const files=new Map(),writes=[];
  function directory(map){const childDirs=new Map();return{
    async getDirectoryHandle(name,{create=false}={}){if(!childDirs.has(name)){if(!create)throw err('NotFoundError');childDirs.set(name,directory(new Map()))}return childDirs.get(name)},
    async getFileHandle(name,{create=false}={}){if(!map.has(name)){if(!create)throw err('NotFoundError');map.set(name,new Blob([]))}return{
      async getFile(){return map.get(name)},
      async createWritable(){const chunks=[];return{async write(v){writes.push(name);chunks.push(v)},async close(){if(failClose)throw err('QuotaExceededError');map.set(name,new Blob(chunks))},async abort(){}}}
    }},
    async *entries(){for(const [k] of map)yield[k,{kind:'file'}];for(const [k,v] of childDirs)yield[k,{kind:'directory'}]},
    _map:map
  }}
  const root=directory(files);return{root,writes};
}
(async()=>{
  assert.throws(()=>C.header(123,0),/Frequence/);
  assert.throws(()=>C.header(0,44100),/frames/);
  assert.throws(()=>C.parseHeader(new Uint8Array(43)),/tronque/);
  const hdr=C.header(48000,48000),info=C.parseHeader(hdr);
  assert.deepEqual(info,{sampleRate:48000,frames:48000,bytes:96044});
  assert.equal(C.parseHeader(C.header(48000*35*60,48000)).frames,48000*35*60); // 35 min sans allouer le PCM
  const fs1=memoryOpfs();
  assert.deepEqual(await C.listTakes(fs1.root),[]);
  const take=await C.createTake(fs1.root,{id:'take_A',sampleRate:48000});
  assert.deepEqual((await C.listTakes(fs1.root)).map(t=>t.id),['take_A']);
  assert.equal((await C.listTakes(fs1.root))[0].readable,true);
  await assert.rejects(()=>C.createTake(fs1.root,{id:'take_A',sampleRate:48000}),/existante/);
  const samples=new Uint8Array(48000*2);samples[0]=0x11;samples[1]=0x44;samples[samples.length-2]=0x22;samples[samples.length-1]=0x33;
  assert.equal((await C.appendChunk(take,0,samples)).frames,48000);
  assert.equal((await C.appendChunk(take,1,samples)).bytes,96044);
  await assert.rejects(()=>C.appendChunk(take,0,samples),/deja present/);
  assert.equal((await C.recoverTake(fs1.root,'take_A')).seconds,2);
  assert(fs1.writes.includes('part-000000.wav'));
  const r=await C.recoverTake(fs1.root,'take_A');
  const whole=await C.previewWav(r);
  assert.equal(whole.seconds,2);
  assert.equal(whole.partial,false);
  assert.equal(whole.blob.size,192044);
  const wavHeader=new Uint8Array(await whole.blob.slice(0,44).arrayBuffer());
  assert.deepEqual(C.parseHeader(wavHeader),{sampleRate:48000,frames:96000,bytes:192044});
  const firstPcm=new Uint8Array(await whole.blob.slice(44,46).arrayBuffer());
  assert.deepEqual(firstPcm,samples.slice(0,2));
  const short=await C.previewWav(r,{maxSeconds:1});
  assert.equal(short.seconds,1);
  assert.equal(short.partial,true);
  assert.equal(short.blob.size,96044);
  await assert.rejects(()=>C.previewWav(r,{maxSeconds:31}),/Limite extrait/);
  // Android : exporter le WAV COMPLET ou refuser explicitement, jamais tronquer.
  const complete=await C.completeSmallWav(r);
  assert.equal(complete.size,192044);
  assert.equal(complete.type,'audio/wav');
  assert.deepEqual(C.parseHeader(new Uint8Array(await complete.slice(0,44).arrayBuffer())),{sampleRate:48000,frames:96000,bytes:192044});
  assert.deepEqual(new Uint8Array(await complete.slice(-2).arrayBuffer()),samples.slice(-2));
  await assert.rejects(()=>C.completeSmallWav(r,{maxSeconds:1}),/trop longue/);
  await assert.rejects(()=>C.completeSmallWav(r,{maxSeconds:121}),/invalide/);


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
  await assert.rejects(()=>C.previewWav(gap),/non lisible/);
  await assert.rejects(()=>C.completeSmallWav(gap),/non lisible/);
  await assert.rejects(()=>C.exportToWritable(gap,sink),/incomplete/);
  const broken=await C.createTake(fs1.root,{id:'truncated',sampleRate:44100});
  await C.appendChunk(broken,0,new Uint8Array(100));
  const f=await broken.dir.getFileHandle(C.nameFor(0));
  const real=await f.getFile(); // remplacer par un fichier partiel sans changer le nom
  broken.dir._map.set(C.nameFor(0),real.slice(0,real.size-1));
  const corrupt=await C.recoverTake(fs1.root,'truncated');
  assert.equal(corrupt.interrupted,true);assert.equal(corrupt.segments,0);
  const invalid=await C.createTake(fs1.root,{id:'invalid_meta',sampleRate:44100});
  invalid.dir._map.set('take.json',new Blob(['{not-json']));
  const list=await C.listTakes(fs1.root);
  assert.deepEqual(list.map(t=>t.id),['truncated','take_A','invalid_meta','gapped']);
  assert.equal(list.find(t=>t.id==='invalid_meta').readable,false);
  assert.equal(list.find(t=>t.id==='take_A').readable,true);
  await assert.rejects(()=>C.openTake(fs1.root,'invalid_meta'));
  const top=await fs1.root.getDirectoryHandle(C.DIRECTORY);
  await top.getFileHandle('unrelated',{create:true});
  assert.equal((await C.listTakes(fs1.root)).length,4); // les fichiers non-prises sont ignores
  const quota=memoryOpfs({failClose:true});
  await assert.rejects(()=>C.createTake(quota.root,{id:'quota',sampleRate:44100}),e=>e.name==='QuotaExceededError');
  // Test 005 : 120 secondes de vrais fragments OPFS simulés, WAV entier.
  const twoMinutes=await C.createTake(fs1.root,{id:'two_minutes',sampleRate:48000});
  for(let i=0;i<120;i++)await C.appendChunk(twoMinutes,i,samples);
  const longRecovered=await C.recoverTake(fs1.root,'two_minutes');
  assert.equal(longRecovered.segments,120);
  assert.equal(longRecovered.seconds,120);
  const longDownload=await C.completeSmallWav(longRecovered);
  assert.equal(longDownload.size,120*96000+44);
  assert.deepEqual(C.parseHeader(new Uint8Array(await longDownload.slice(0,44).arrayBuffer())),{sampleRate:48000,frames:120*48000,bytes:120*96000+44});
  assert.deepEqual(new Uint8Array(await longDownload.slice(-2).arrayBuffer()),samples.slice(-2));
  const longPreview=await C.previewWav(longRecovered);
  assert.equal(longPreview.seconds,30);
  assert.equal(longPreview.partial,true);
  await C.appendChunk(twoMinutes,120,samples);
  const tooLong=await C.recoverTake(fs1.root,'two_minutes');
  assert.equal(tooLong.seconds,121);
  await assert.rejects(()=>C.completeSmallWav(tooLong),/trop longue/);
  await assert.rejects(()=>C.completeSmallWav({...longRecovered,frames:120*192000,take:{meta:{sampleRate:192000}}}),/trop volumineux/);
  // La limite 24 Mio est testee avant toute lecture de fragment.

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
  // HTML preview safety checks: inline code must parse and never upload microphone audio.
  const html=fs.readFileSync('experiments/studio-recording-wav-001.html','utf8');
  assert.match(html,/id="storage-status"/);
  assert.match(html,/id="storage-warning"/);
  assert.match(html,/id="listen" disabled/);
  assert.match(html,/<audio id="player" controls/);
  assert.match(html,/<a id="download" hidden>/);
  assert.match(html,/id="download-note"/);
  assert.match(html,/id="timer" role="timer"/);
  assert.match(html,/id="status" role="status" aria-live="polite"/);
  assert.match(html,/id="download-feedback" role="status" aria-live="polite" hidden/);
  assert.match(html,/class="controls"/);
  assert.match(html,/<details><summary>Journal technique \(facultatif\)<\/summary><pre id="log"/);
  assert.ok(html.indexOf('id="timer"')<html.indexOf('id="start"'),'counter must be visible above the record button');
  assert.ok(html.indexOf('id="status"')<html.indexOf('id="export"'),'download feedback must be visible above the export button');
  assert.match(html,/2 minutes maximum/);
  assert.match(html,/C\.completeSmallWav\(recovered,\{maxSeconds:120\}\)/);
  assert.match(html,/C\.completeSmallWav\(recovered/);
  assert.match(html,/link\.download=name/);
  assert.match(html,/La prise locale est conservée/);
  assert.match(html,/C\.previewWav\(recovered\)/);
  assert.match(html,/VÉRIFIER L’ESPACE/);
  const inline=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(inline,'inline browser script exists');
  assert.doesNotThrow(()=>new vm.Script(inline[1],{filename:'studio-recording-wav-001.inline.js'}));
  // Timer must display minutes/seconds and must not depend on setInterval count.
  const timerCode=inline[1].match(/^const padTime=.*\nconst clockString=.*$/m);
  assert.ok(timerCode,'counter formatter found');
  const counterSandbox={};
  vm.runInNewContext(timerCode[0]+'\nglobalThis.clockString=clockString;',counterSandbox);
  assert.equal(counterSandbox.clockString(0),'00:00');
  assert.equal(counterSandbox.clockString(59.9),'00:59');
  assert.equal(counterSandbox.clockString(60),'01:00');
  assert.equal(counterSandbox.clockString(120.3),'02:00');
  assert.match(inline[1],/startedAt=performance\.now\(\)/);
  assert.match(inline[1],/setInterval\(\(\)=>/);
  assert.match(inline[1],/stopTimer\(\);\$\('#stop'\)/);
  assert.match(inline[1],/setClock\(r.seconds,'Durée retrouvée'\)/);
  assert.match(inline[1],/\$\('#download'\)\.onclick=/);
  assert.match(inline[1],/Téléchargement demandé à Brave/);
  assert.match(inline[1],/la page ne peut pas confirmer la fin du téléchargement/);
  assert.match(inline[1],/downloadFeedback\('Fichier WAV prêt/);

  assert.doesNotMatch(inline[1],/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|indexedDB|supabase)\b/i);
  console.log('STUDIO-WAV-REC-001: header, stockage OPFS, reprise, trou, corruption, quota, export borne et Worklet, HTML preview sûr PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
