const assert=require('node:assert/strict');
const fs=require('fs');
const A=require('../js/studio-autosave.js');

const html=fs.readFileSync('studio.html','utf8');
const lib=fs.readFileSync('js/studio-autosave.js','utf8');
const clone=x=>JSON.parse(JSON.stringify(x));

(async()=>{
  const store=A.createMemoryStore();
  await store.initializeLibrary();

  const blob=new Blob([new Uint8Array([1,2,3,4,5,6])],{type:'audio/webm'});
  const source={id:'source-rename',blob,sourceSchema:2,mimeType:'audio/webm',originalName:'prise.webm',origin:'micro-recording',size:blob.size};
  const snapshot={
    schema:A.SCHEMA_VERSION,
    name:'Projet 28 septembre - 11:40',
    cursor:12.5,zoom:2,selectionStart:null,selectionEnd:null,selectedRecordTrackId:'voice',
    tracks:[{id:'voice',name:'VOIX 1',type:'voice',gain:.8,muted:false,color:'#785cff'}],
    clips:[{id:'clip-1',track:'voice',name:'Voix',sourceId:'source-rename',start:4.2,trim:.3,len:2.1,gain:.9,muted:false}]
  };
  const created=await store.createProject({
    id:'project-fixed-id',
    name:'Projet 28 septembre - 11:40',
    createdAt:'2026-09-28T09:40:00.000Z',
    updatedAt:'2026-09-28T09:40:00.000Z',
    snapshot,
    newSources:[source]
  });
  assert.equal(created.id,'project-fixed-id');

  const beforeOpen=await store.openProject('project-fixed-id');
  const beforeSnapshot=clone(beforeOpen.snapshot);
  const beforeMetrics=store._metrics();
  const beforeSource=beforeOpen.audio.get('source-rename');

  await new Promise(r=>setTimeout(r,2));
  const renamed=await store.renameProject('project-fixed-id','   Histoire   forêt   ');
  assert.equal(renamed.name,'Histoire forêt');
  console.log('RENAME_PROJECT = PASS');
  assert.equal(renamed.id,'project-fixed-id');
  console.log('RENAME_PRESERVES_PROJECT_ID = PASS');

  const list=await store.listProjects();
  assert.equal(list.length,1);
  assert.equal(list[0].name,'Histoire forêt');
  assert.equal(list[0].id,'project-fixed-id');
  console.log('RENAME_VISIBLE_LIBRARY = PASS');

  // "Reload" proof at the persistence API boundary: reopen after close, using stored library metadata.
  await store.closeProject();
  const reopened=await store.openProject('project-fixed-id');
  assert.equal(reopened.card.name,'Histoire forêt');
  assert.equal(reopened.card.id,'project-fixed-id');
  console.log('RENAME_PERSISTS_RELOAD = PASS');

  // Rename must not touch editor state, clips or source identity.
  assert.deepEqual(clone(reopened.snapshot),beforeSnapshot);
  assert.equal(reopened.snapshot.clips[0].sourceId,'source-rename');
  assert.strictEqual(reopened.audio.get('source-rename'),beforeSource);
  assert.deepEqual(store._metrics(),beforeMetrics);
  console.log('RENAME_AUDIO_WRITES = 0');
  console.log('RENAME_SOURCE_ID_CHANGES = 0');

  const renameFns=lib.slice(lib.indexOf('async renameProject(projectId'),lib.indexOf('async deleteProject(projectId'));
  assert(!/decodeAudioData|wav\(|AudioBuffer|arrayBuffer\(|putSources|saveProject/.test(renameFns));
  console.log('RENAME_AUDIO_REENCODES = 0');

  // Empty/whitespace names preserve the previous real name.
  const empty=await store.renameProject('project-fixed-id','     ');
  assert.equal(empty.name,'Histoire forêt');
  assert.equal(empty.id,'project-fixed-id');
  console.log('RENAME_EMPTY_SAFE = PASS');

  // Mobile-safe max length is deterministic and UI also ellipsizes.
  const longRaw='  '+('Très long nom de projet '.repeat(8))+'  ';
  const long=await store.renameProject('project-fixed-id',longRaw);
  assert(long.name.length<=80);
  assert.equal(long.id,'project-fixed-id');
  assert(html.includes('id="project-rename-input" type="text" maxlength="80"'));
  assert(html.includes('.local-project-card b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'));
  assert(html.includes('.current-project-name{'));
  assert(html.includes('text-overflow:ellipsis'));
  console.log('LONG_NAME_MOBILE_SAFE = PASS');

  // Restore the scenario name and prove editor uses current card name, not stale snapshot name.
  await store.renameProject('project-fixed-id','Histoire forêt');
  assert(html.includes('id="current-project-name"'));
  assert(html.includes('function syncCurrentProjectName()'));
  assert(html.includes('currentProjectName=saved.card.name;syncCurrentProjectName()'));
  assert(html.includes("currentProjectName=next.name;syncCurrentProjectName()"));
  console.log('RENAME_VISIBLE_EDITOR = PASS');

  // Card UX: visible ⋯ button, explicit rename dialog, no card-open collision.
  assert(html.includes("more.textContent='⋯'"));
  assert(html.includes("more.onclick=e=>{e.preventDefault();e.stopPropagation();openProjectRename(p)}"));
  assert(html.includes('RENOMMER LE PROJET'));
  assert(html.includes('id="project-rename-save"'));
  assert(html.includes("$('#project-rename-save').onclick=commitProjectRename"));
  console.log('RENAME_UX_CARD_MENU = PASS');

  // Header remains the existing mobile height; rename adds no new bar.
  assert(html.includes('header{height:44px;flex:0 0 44px'));
  assert(html.includes('.current-project-name{display:block;max-width:min(42vw,190px);font-size:8px'));
  assert(!html.includes('project-name-banner'));
  console.log('EDITOR_PROJECT_NAME_DISCREET = PASS');

  console.log('Studio project rename 011B tests PASS');
})().catch(e=>{console.error(e);process.exit(1)});
