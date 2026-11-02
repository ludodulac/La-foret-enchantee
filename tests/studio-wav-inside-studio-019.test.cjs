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
assert.match(html,/id="studio-wav-attach" type="button" disabled/);
assert.match(html,/id="studio-wav-download" hidden/);
assert.match(html,/id="studio-wav-time"/);
assert.match(html,/id="studio-wav-player"/);
assert.match(html,/Les prises jusqu’à 5 minutes peuvent être ajoutées/);
assert.doesNotMatch(html,/experiments\/studio-recording-wav-001\.html/);

// La prévisualisation utilise REC et STOP directement avec l'enregistreur WAV.
// Le moteur MediaRecorder historique est conservé en solution de repli, sans suppression.
assert.match(html,/\$\('#record'\)\.onclick=recordSecurelyFromStudio/);
assert.match(html,/wavController\.stop\(\)/);
assert.match(html,/if\(recording&&recorder\?\.state!=='inactive'\)\{recorder\.stop\(\);return\}/);
assert.match(html,/wavController=StudioWavPanel\.mount\(\{/);
assert.match(html,/onStateChange:state=>/);
assert.match(html,/onImportTake:async item=>/);
assert.match(html,/secureCaptureInfo\?\.start\?\?cursor/);
assert.match(html,/secureCaptureInfo\?\.trackId\|\|recordTrackIdFor\(\)/);

// Scripts OPFS insérés avant la logique principale, sans mutation d'anciens projets.
assert.ok(html.indexOf('src="js/studio-recording-wav-core.js"')<html.indexOf('src="js/studio-wav-bridge.js"'));
assert.ok(html.indexOf('src="js/studio-wav-bridge.js"')<html.indexOf('src="js/studio-wav-long-source.js"'));assert.ok(html.indexOf('src="js/studio-wav-long-source.js"')<html.indexOf('src="js/studio-wav-long-playback.js"'));assert.ok(html.indexOf('src="js/studio-wav-long-playback.js"')<html.indexOf('src="js/studio-wav-panel.js"'));
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
assert.match(panel,/Bridge\.makeShortClipSource\(recovered\)/);assert.match(panel,/Long\.prepare\(recovered/);
assert.match(html,/await registerSourceBlob\(pointer,null,\{origin:isLong\?'opfs-wav-long':'opfs-wav-short'/);
assert.match(html,/await flushLocalAutosave\(\)/);assert.match(html,/await localStore\.saveWaveform\(sourceId,item\.waveform\)/);assert.match(html,/StudioWavLongPlayback\.start\(ctx,plan/);assert.match(html,/StudioWavLongPlayback\.prepare\(index,startFrame,endFrame\)/);assert.match(html,/const pointer=isLong\?new Blob/);assert.match(html,/return exportLongRange\(start,end,label,diagnostic\)/);assert.match(html,/StudioWavLongMix\.streamToOpfs\(mixInputs,plan/);
assert.match(panel,/await attach\(true\)/);
assert.match(panel,/recordingCompleted&&recovered/,'auto-import only after full stop acknowledgment');
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
