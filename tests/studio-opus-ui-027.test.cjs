const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Opus=require('../js/studio-opus-compact.js');
const html=fs.readFileSync('studio.html','utf8');
const js=fs.readFileSync('js/studio-opus-compact.js','utf8');
const mux=fs.readFileSync('js/studio-ogg-opus.js','utf8');
(async()=>{
  assert.match(html,/src="js\/studio-ogg-opus\.js"/);
  assert.match(html,/src="js\/studio-opus-compact\.js"/);
  assert(html.indexOf('src="js/studio-ogg-opus.js"')<html.indexOf('src="js/studio-opus-compact.js"'));
  assert.match(html,/id="export-compress-opus" type="button" disabled/);
  assert.match(html,/id="export-opus-download" type="button" hidden/);
  assert.match(html,/id="export-opus-status" role="status" aria-live="polite"/);
  assert.match(html,/StudioOpusCompact\.encoderConfig\(window\.AudioEncoder\)/);
  assert.match(html,/StudioOpusCompact\.encodeWav\(item\.blob/);
  assert.match(html,/if\(pendingExport!==item\)throw Error/);
  assert.match(html,/Téléchargement OGG Opus demandé/);
  assert.match(html,/WAV original est conservé/);
  assert.match(html,/const old=await StudioWavLongMix\.listTemporaryExports\(dir\)/);
  assert.match(html,/const compact=await StudioOpusCompact\.listTemporaryExports\(dir\)/);
  assert.match(html,/StudioOpusCompact\.removeTemporaryExports\(dir,compact/);
  assert.doesNotMatch(html,/new MediaRecorder\(.*opus/i);
  assert.doesNotMatch(js,/decodeAudioData|fetch\(|XMLHttpRequest|supabase/i);
  assert.doesNotThrow(()=>new vm.Script(js));
  assert.doesNotThrow(()=>new vm.Script(mux));
  const safe='.studio-opus-1234-abc.tmp.ogg',removed=[];
  const dir={
    async *entries(){
      yield[safe,{kind:'file'}];yield['studio-wav-takes-v1',{kind:'directory'}];
      yield['projet.foreststudio',{kind:'file'}];yield['.studio-wav-mix-123.tmp.wav',{kind:'file'}];
      yield['.studio-opus-evil.tmp.mp3',{kind:'file'}];
    },async getFileHandle(name){assert.equal(name,safe);return{getFile:async()=>new Blob([1,2,3,4,5])}},
    async removeEntry(name){removed.push(name)}
  };
  assert.deepEqual(await Opus.listTemporaryExports(dir),[{name:safe,size:5}]);
  await assert.rejects(()=>Opus.removeTemporaryExports(dir,['studio-wav-takes-v1']),/refusée/);
  await assert.rejects(()=>Opus.removeTemporaryExports(dir,['projet.foreststudio']),/refusée/);
  await assert.rejects(()=>Opus.removeTemporaryExports(dir,[safe,safe]),/refusée/);
  assert.equal(await Opus.removeTemporaryExports(dir,[safe]),1);
  assert.deepEqual(removed,[safe]);
  console.log('STUDIO-OPUS-UI-027: optional gated UI, WAV preserved, manual cleanup scoped, no project deletion PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
