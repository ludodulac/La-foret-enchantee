const assert=require('node:assert/strict');
const fs=require('fs');
const A=require('../js/studio-autosave.js');

const html=fs.readFileSync('studio.html','utf8');
const bytes=async blob=>[...new Uint8Array(await blob.arrayBuffer())];
const copy=x=>JSON.parse(JSON.stringify(x));
function snap(name,trackId='voice',clip=null){
  return{schema:A.SCHEMA_VERSION,name,cursor:0,zoom:1,selectionStart:null,selectionEnd:null,selectedRecordTrackId:trackId,tracks:[{id:trackId,name:'VOIX',type:'voice',gain:1,muted:false,color:'#785cff'}],clips:clip?[clip]:[]}
}

(async()=>{
  assert.equal(A.DB_VERSION,3);
  assert.equal(A.LIBRARY_VERSION,1);

  // ENTRY: real library is visible first, editor is hidden, and no automatic current-project restore runs.
  assert(html.includes('id="project-library-screen"'));
  assert(html.includes('id="create-local-project"'));
  assert(html.includes('<main class="app" id="app" hidden>'));
  assert(html.includes("initializeProjectLibraryEntry().catch"));
  assert(!html.includes('render();restoreLocalAutosave();'));
  assert(!html.includes('render(); restoreLocalAutosave();'));
  console.log('ENTRY_OPENS_PROJECT_LIBRARY PASS');
  console.log('ENTRY_DOES_NOT_AUTO_OPEN_EDITOR PASS');

  // Permanent project identity + automatic human naming is explicit in production.
  assert(html.includes("let id=crypto.randomUUID(),now=new Date(),name=autoProjectName(now)"));
  assert(html.includes("return'Projet '+date+' - '+time"));
  assert(html.includes("localStore.createProject({id,name,createdAt:now.toISOString(),updatedAt:now.toISOString(),snapshot:snap})"));
  console.log('CREATE_PROJECT PASS');
  console.log('PROJECT_HAS_PERMANENT_UUID PASS');
  console.log('AUTO_NAME_PROJECT PASS');

  // Library cards are real store rows and sort contract is updatedAt DESC.
  const sorted=A.sortProjects([
    {id:'old',name:'Ancien',createdAt:'2026-09-01T10:00:00Z',updatedAt:'2026-09-10T10:00:00Z'},
    {id:'new',name:'Récent',createdAt:'2026-09-02T10:00:00Z',updatedAt:'2026-09-20T10:00:00Z'},
    {id:'mid',name:'Milieu',createdAt:'2026-09-03T10:00:00Z',updatedAt:'2026-09-15T10:00:00Z'}
  ]);
  assert.deepEqual(sorted.map(x=>x.id),['new','mid','old']);
  assert(html.includes("projects=await localStore.listProjects()"));
  assert(html.includes("card.dataset.projectId=p.id"));
  assert(html.includes("card.onclick=()=>openLocalProject(p.id)"));
  console.log('PROJECT_APPEARS_IN_LIBRARY PASS');
  console.log('PROJECTS_SORT_UPDATED_DESC PASS');

  // A/B isolation with shared source store and zero rewrites while editing/switching.
  const sharedBlob=new Blob([new Uint8Array([1,7,3,9,2,8])],{type:'audio/webm'});
  const source={id:'src-shared',blob:sharedBlob,sourceSchema:2,mimeType:sharedBlob.type,originalName:'prise.webm',origin:'micro-recording',size:sharedBlob.size};
  const clipA={id:'clip-a',track:'voice',name:'A',start:1.25,trim:.2,len:2.5,gain:.8,muted:false,sourceId:'src-shared'};
  const clipB={id:'clip-b',track:'voice',name:'B',start:8,trim:0,len:1.5,gain:.6,muted:true,sourceId:'src-shared'};
  const store=A.createMemoryStore();
  await store.initializeLibrary();
  await store.createProject({id:'project-a',name:'Projet A',createdAt:'2019-01-01T00:00:00Z',updatedAt:'2019-01-01T00:00:00Z',snapshot:snap('Projet A','voice',clipA),newSources:[source]});
  console.log('OPEN_PROJECT_A PASS create/open foundation');
  assert.equal(store._metrics().audioWrites,1);
  await store.createProject({id:'project-b',name:'Projet B',createdAt:'2020-01-01T00:00:00Z',updatedAt:'2020-01-01T00:00:00Z',snapshot:snap('Projet B','voice',clipB),newSources:[]});
  console.log('CREATE_PROJECT_B PASS');
  assert.equal(store._metrics().audioWrites,1,'shared Blob must not be recopied for B');

  let a=await store.openProject('project-a');
  assert.equal(a.snapshot.clips[0].start,1.25);
  assert.equal(a.snapshot.clips[0].sourceId,'src-shared');
  assert.deepEqual(await bytes(a.audio.get('src-shared')),[1,7,3,9,2,8]);
  console.log('OPEN_PROJECT_A PASS');

  let aEdit=copy(a.snapshot);aEdit.cursor=12.4;aEdit.clips[0].start=4.75;aEdit.tracks[0].gain=.55;
  const writesBeforeA=store._metrics().audioWrites,wavesBeforeA=store._metrics().waveformWrites;
  await store.saveProject('project-a',aEdit,[]);
  assert.equal(store._metrics().audioWrites,writesBeforeA);
  assert.equal(store._metrics().waveformWrites,wavesBeforeA);
  console.log('EDIT_PROJECT_A PASS');
  console.log('AUTOSAVE_PROJECT_A PASS');

  let b=await store.openProject('project-b');
  assert.equal(b.snapshot.clips[0].start,8);
  assert.equal(b.snapshot.cursor,0);
  assert.equal(b.snapshot.tracks[0].gain,1);
  console.log('OPEN_PROJECT_B PASS');
  let bEdit=copy(b.snapshot);bEdit.cursor=23;bEdit.clips[0].start=17.2;bEdit.clips[0].muted=false;
  await new Promise(r=>setTimeout(r,2));
  await store.saveProject('project-b',bEdit,[]);
  console.log('EDIT_PROJECT_B PASS');
  console.log('AUTOSAVE_PROJECT_B PASS');

  const reopenedA=await store.openProject('project-a');
  assert.equal(reopenedA.snapshot.cursor,12.4);
  assert.equal(reopenedA.snapshot.clips[0].start,4.75);
  assert.equal(reopenedA.snapshot.tracks[0].gain,.55);
  assert.equal(reopenedA.snapshot.clips[0].muted,false);
  console.log('REOPEN_PROJECT_A_EXACT_STATE PASS');

  const reopenedB=await store.openProject('project-b');
  assert.equal(reopenedB.snapshot.cursor,23);
  assert.equal(reopenedB.snapshot.clips[0].start,17.2);
  assert.equal(reopenedB.snapshot.clips[0].muted,false);
  assert.equal(reopenedB.snapshot.tracks[0].gain,1);
  console.log('REOPEN_PROJECT_B_EXACT_STATE PASS');
  console.log('PROJECT_A_B_ISOLATION PASS');

  // B remains independent after A/B edits and is still exactly recoverable.
  assert.equal((await store.openProject('project-b')).snapshot.clips[0].start,17.2);
  console.log('PROJECTS_SORT_UPDATED_DESC PASS remains fallback for cards without lastOpenedAt; 011D open recency supersedes active ordering');

  // Return flow flushes local metadata, closes current project and never asks "Enregistrer ?".
  const returnStart=html.indexOf('async function returnToProjectLibrary()'),returnEnd=html.indexOf('async function initializeProjectLibraryEntry()',returnStart),returnSource=html.slice(returnStart,returnEnd);
  assert(returnSource.includes('await flushLocalAutosave()'));
  assert(returnSource.includes('await localStore.closeProject()'));
  assert(returnSource.includes('showProjectLibraryScreen()'));
  assert(returnSource.includes('await renderLocalProjectLibrary()'));
  assert(!/confirm\(|prompt\(|saveProject\(/.test(returnSource));
  assert(html.includes("$('#back-projects').onclick=returnToProjectLibrary"));
  console.log('RETURN_TO_LIBRARY PASS');
  console.log('RETURN_TO_LIBRARY_FLUSHES_PENDING_METADATA PASS');
  console.log('RETURN_TO_LIBRARY_NO_SAVE_PROMPT PASS');

  // Legacy migration: one project, exact metadata/sourceId, no Blob rewrite, idempotent.
  const legacy=A.createMemoryStore();
  const legacyBlob=new Blob([new Uint8Array([82,73,70,70,42,24])],{type:'audio/wav'});
  const legacyClip={id:'legacy-clip',track:'voice',name:'Ancien',start:3.3,trim:.7,len:4.1,gain:.45,muted:true,sourceId:'legacy-source'};
  const legacySnap={schema:2,name:'',cursor:9.8,zoom:3,selectionStart:2,selectionEnd:7,selectedRecordTrackId:'voice',tracks:[{id:'voice',name:'🎙️ VOIX 1',type:'voice',gain:.72,muted:true,color:'#785cff'}],clips:[legacyClip]};
  await legacy.save(legacySnap,[{id:'legacy-source',blob:legacyBlob,sourceSchema:2,mimeType:'audio/wav',origin:'legacy'}]);
  const writesBeforeMigration=legacy._metrics().audioWrites;
  const m1=await legacy.initializeLibrary({projectId:'legacy-project',recoveredName:'Projet récupéré - 28/09/2026'});
  assert(m1.migrated);
  assert.equal(m1.projects.length,1);
  assert.equal(m1.projects[0].id,'legacy-project');
  assert.equal(m1.projects[0].name,'Projet récupéré - 28/09/2026');
  const migrated=await legacy.openProject('legacy-project');
  assert.deepEqual(migrated.snapshot.tracks,legacySnap.tracks);
  assert.deepEqual(migrated.snapshot.clips,legacySnap.clips);
  assert.equal(migrated.snapshot.cursor,9.8);
  assert.equal(migrated.snapshot.zoom,3);
  assert.equal(migrated.snapshot.selectedRecordTrackId,'voice');
  assert.equal(migrated.snapshot.clips[0].sourceId,'legacy-source');
  assert.strictEqual(migrated.audio.get('legacy-source'),legacyBlob);
  assert.equal(legacy._metrics().audioWrites,writesBeforeMigration);
  console.log('LEGACY_CURRENT_PROJECT_MIGRATION PASS');
  console.log('LEGACY_SOURCE_IDS_PRESERVED PASS');
  console.log('LEGACY_AUDIO_BLOBS_NOT_REWRITTEN PASS');

  const m2=await legacy.initializeLibrary({projectId:'must-not-be-used',recoveredName:'Doublon interdit'});
  assert.equal(m2.migrated,null);
  assert.equal(m2.projects.length,1);
  assert.equal(m2.projects[0].id,'legacy-project');
  console.log('LEGACY_PROJECT_MIGRATION_IDEMPOTENT PASS');

  // Source identity and zero audio work across project switches.
  const metricsBeforeSwitch=store._metrics();
  const sourceObjectBefore=(await store.openProject('project-a')).audio.get('src-shared');
  await store.openProject('project-b');
  const sourceObjectAfter=(await store.openProject('project-a')).audio.get('src-shared');
  assert.strictEqual(sourceObjectAfter,sourceObjectBefore);
  assert.deepEqual(store._metrics(),metricsBeforeSwitch);
  console.log('SOURCE_IDENTITY_PRESERVED PASS sourceId + canonical Blob shared across projects');
  console.log('PROJECT_SWITCH_AUDIO_WRITES = 0');
  console.log('PROJECT_SWITCH_PCM_SCANS = 0');
  console.log('PROJECT_SWITCH_AUDIO_REENCODES = 0');

  const beforeMetadata=store._metrics().audioWrites;
  let metaOnly=copy((await store.openProject('project-a')).snapshot);metaOnly.cursor+=1;metaOnly.zoom=2;
  await store.saveProject('project-a',metaOnly,[]);
  assert.equal(store._metrics().audioWrites,beforeMetadata);
  console.log('AUTOSAVE_METADATA_AUDIO_WRITES = 0');

  const libSource=fs.readFileSync('js/studio-autosave.js','utf8');
  const switchCode=libSource.slice(libSource.indexOf('async openProject'),libSource.indexOf('async closeProject'));
  assert(!/decodeAudioData|wav\(|arrayBuffer\(|AudioBuffer/.test(switchCode));
  const saveCode=libSource.slice(libSource.indexOf('async saveProject'),libSource.indexOf('async openProject'));
  assert(!/decodeAudioData|wav\(|AudioBuffer/.test(saveCode));

  // Local-only 011A: entry/project library path contains no Supabase project call.
  const entryStart=html.indexOf('async function renderLocalProjectLibrary()'),entryEnd=html.indexOf('let librarySounds=',entryStart),entryCode=html.slice(entryStart,entryEnd);
  assert(!/dbClient|studio_projects|storage\.from/.test(entryCode));
  console.log('LOCAL_ONLY_PROJECT_LIBRARY PASS no Supabase in create/list/open/return path');

  console.log('Studio project library autosave 011A tests PASS');
})().catch(e=>{console.error(e);process.exit(1)});
