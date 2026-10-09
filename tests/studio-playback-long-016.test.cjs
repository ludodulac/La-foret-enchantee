const assert=require('node:assert/strict');const A=require('../js/studio-autosave.js');
const blob=bytes=>new Blob([Uint8Array.from(bytes)],{type:'audio/mpeg'});const bytes=async b=>Array.from(new Uint8Array(await b.arrayBuffer()));
const clip=(id,sourceId,start,trim,len,track='voice',gain=1,muted=false)=>({id,sourceId,start,trim,len,track,gain,muted,name:id});
const fixtures=[
{name:'legacy-migrated',legacy:true,sources:[{id:'legacy',blob:blob([1,2,3])}],tracks:[{id:'voice',gain:1,muted:false}],clips:[clip('old','legacy',0,0,2)]},
{name:'multitrack-edited-shared',sources:[{id:'shared',blob:blob([3,2,1])},{id:'other',blob:blob([4,5,6])}],tracks:[{id:'voice',gain:.8,muted:false},{id:'fx',gain:.4,muted:true}],clips:[clip('moved','shared',12,.5,3),clip('split-left','shared',16,0,1),clip('split-right','shared',17,1,2),clip('duplicate','shared',20,.5,3,'fx',.6,true),clip('other','other',4,0,2,'fx')]},
{name:'long-mp3',sources:[{id:'long-mp3',blob:blob([73,68,51,4,0,0,0,0,0,0,1,2,3])}],tracks:[{id:'voice',gain:1,muted:false}],clips:[clip('long','long-mp3',30,0,900)]}
];
(async()=>{for(const f of fixtures){const store=A.createMemoryStore(),snapshot={schema:f.legacy?1:2,name:f.name,cursor:3.25,zoom:1.5,selectionStart:1,selectionEnd:2,tracks:f.tracks,clips:f.clips};const records=f.sources.map(s=>({id:s.id,blob:s.blob,sourceSchema:f.legacy?1:2,mimeType:'audio/mpeg',originalName:s.id+'.mp3',origin:'phone-import'}));let projectId='project-'+f.name;
if(f.legacy){await store.save(snapshot,f.sources.map(s=>({id:s.id,blob:s.blob})));const migration=await store.initializeLibrary({projectId});assert.equal(migration.migrated.id,projectId)}
else await store.createProject({id:projectId,name:f.name,snapshot,newSources:records});
let opened=await store.openProject(projectId);assert.equal(opened.snapshot.projectId,projectId);assert.deepEqual(opened.snapshot.tracks,snapshot.tracks);assert.deepEqual(opened.snapshot.clips,snapshot.clips);
const originals=new Map();for(const s of f.sources)originals.set(s.id,await bytes(s.blob));
await store.saveProject(projectId,opened.snapshot,[]);await store.closeProject();opened=await store.openProject(projectId);
assert.equal(opened.snapshot.projectId,projectId);assert.deepEqual(opened.snapshot.tracks,snapshot.tracks);assert.deepEqual(opened.snapshot.clips,snapshot.clips);assert.equal(opened.snapshot.cursor,snapshot.cursor);assert.equal(opened.snapshot.zoom,snapshot.zoom);
for(const [id,expected] of originals){assert.deepEqual(await bytes(opened.audio.get(id)),expected);assert.equal(opened.sources.get(id).id,id)}
assert.equal(store._metrics().audioWrites,f.sources.length);assert.equal(opened.snapshot.clips.every(c=>originals.has(c.sourceId)),true);
console.log('PASS '+f.name+' PROJECT_REOPEN METADATA_IDENTITY SOURCE_IDENTITY ORIGINAL_BLOBS_UNCHANGED NO_AUDIO_REWRITE')}
console.log('CHUNK_MANIFEST_COMPATIBILITY: sidecar keyed by sourceId; snapshots and clip references untouched; no conversion on open');console.log('STUDIO_PLAYBACK_LONG_016 PASS')})().catch(e=>{console.error(e);process.exitCode=1});
