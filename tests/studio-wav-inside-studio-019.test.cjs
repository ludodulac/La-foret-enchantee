const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('studio.html','utf8');
const panel=fs.readFileSync('js/studio-wav-panel.js','utf8');
const core=fs.readFileSync('js/studio-recording-wav-core.js','utf8');
const worklet=fs.readFileSync('js/studio-recording-wav-worklet.js','utf8');
const C=require('../js/studio-recording-wav-core.js');

// Le Studio d'origine reste le seul logiciel, avec son transport et ses projets inchangés.
assert.match(html,/id="multitrack"/);
assert.match(html,/id="project-library-screen"/);
assert.match(html,/id="autosave-status"/);
assert.match(html,/id="record"/);
assert.match(html,/id="stop"/);
assert.match(html,/new MediaRecorder\(stream\)/,'legacy recording is left intact');
assert.match(html,/const localStore=StudioAutosave.createIndexedDbStore\(\)/);
assert.match(html,/initializeProjectLibraryEntry\(\)/);

// Panneau WAV dans la MÊME interface (pas de lien vers l'expérience externe).
assert.match(html,/id="studio-wav-open"/);
assert.match(html,/id="studio-wav-panel" hidden/);
assert.match(html,/role="dialog" aria-modal="true" aria-labelledby="studio-wav-title"/);
assert.match(html,/id="studio-wav-start"/);
assert.match(html,/id="studio-wav-stop" type="button" disabled/);
assert.match(html,/id="studio-wav-saved"/);
assert.match(html,/id="studio-wav-recover"/);
assert.match(html,/id="studio-wav-listen"/);
assert.match(html,/id="studio-wav-export"/);
assert.match(html,/id="studio-wav-download" hidden/);
assert.match(html,/id="studio-wav-time"/);
assert.match(html,/id="studio-wav-player"/);
assert.match(html,/ces prises ne sont pas encore placées sur les pistes du montage/);
assert.doesNotMatch(html,/experiments\/studio-recording-wav-001\.html/);

// L'ancien REC n'a pas été remplacé avant la validation Android en vrai.
assert.match(html,/\$\('#record'\)\.onclick=record/);
assert.match(html,/\$\('#stop'\)\.onclick=\(\)=>\{if\(recording&&recorder\?\.state!=='inactive'\)/);
assert.match(html,/StudioWavPanel\.mount\(\{isStudioRecording:\(\)=>recording,isProjectOpen:\(\)=>!!currentProjectId\}\)/);

// Scripts OPFS insérés avant la logique principale, sans mutation d'anciens projets.
assert.ok(html.indexOf('src="js/studio-recording-wav-core.js"')<html.indexOf('src="js/studio-wav-panel.js"'));
assert.ok(html.indexOf('src="js/studio-wav-panel.js"')<html.indexOf("initializeProjectLibraryEntry()"));
assert.match(panel,/root\.StudioWavPanel=\{mount\}/);
assert.match(panel,/if\(isStudioRecording\(\)\)/);
assert.match(panel,/if\(!isProjectOpen\(\)\)/);
assert.match(panel,/const savedId=take\?\.meta\?\.id/,'recorded take has actual persisted ID');
assert.match(panel,/Core\.listTakes\(await rootDir\(\)\)/);
assert.match(panel,/Core\.recoverTake\(await rootDir\(\),id\)/);
assert.match(panel,/Core\.previewWav\(recovered\)/);
assert.match(panel,/Core\.completeSmallWav\(recovered,\{maxSeconds:300\}\)/);
assert.match(panel,/Core\.createTake\(await rootDir\(\),\{id,sampleRate:ac\.sampleRate\}\)/);
assert.match(panel,/Core\.appendChunk\(take,index,pcm\)/);
assert.match(panel,/getUserMedia\(\{audio:/);
assert.match(panel,/ui\.download\.onclick=/);
assert.doesNotMatch(panel,/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|indexedDB|supabase)\b/i,'raw mic never sent over network');
assert.match(core,/const DIRECTORY='studio-wav-takes-v1'/);
assert.match(core,/MAX_MOBILE_DOWNLOAD_BYTES=32\*1024\*1024/);
assert.match(worklet,/registerProcessor\('studio-recording-wav'/);
assert.equal(C.DIRECTORY,'studio-wav-takes-v1');
assert.equal(typeof C.listTakes,'function');
assert.equal(typeof C.completeSmallWav,'function');
assert.doesNotThrow(()=>new vm.Script(panel,{filename:'studio-wav-panel.js'}));
assert.doesNotThrow(()=>new vm.Script(worklet,{filename:'studio-recording-wav-worklet.js'}));
console.log('STUDIO-WAV-INSIDE-019: baseline REC, project storage, OPFS engine, safe capture controls, no network PASS');
