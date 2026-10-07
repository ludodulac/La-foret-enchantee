const assert=require('node:assert/strict');const P=require('../experiments/studio-long-source-chunk-prototype.js');
const manifest={sourceId:'LONG',chunkDuration:5,chunks:Array.from({length:24},(_,i)=>({id:'LONG-'+i,start:i*5,duration:5,format:'audio/wav'}))};
// Direct seek near 30 s touches chunk 6 (30-35) and one look-ahead chunk; no 0-25 s chunk is needed.
let p=P.planClip({manifest,clipStart:0,trim:0,clipLength:120,cursor:30.25,contextStart:100,lookahead:1});
assert.deepEqual(p.needed.map(x=>x.id),['LONG-6','LONG-7','LONG-8','LONG-9','LONG-10','LONG-11','LONG-12','LONG-13','LONG-14','LONG-15','LONG-16','LONG-17','LONG-18','LONG-19','LONG-20','LONG-21','LONG-22','LONG-23']);
assert.equal(p.events[0].chunkId,'LONG-6');assert.equal(p.events[0].offset,.25);assert.equal(p.events[0].when,100);
// Scheduling is expressed only in AudioContext time; adjacent chunks meet exactly.
for(let i=1;i<p.events.length;i++)assert(Math.abs((p.events[i-1].when+p.events[i-1].duration)-p.events[i].when)<1e-9);
// A bounded playback horizon proves only local chunks need decode before first sound.
let local=P.chunksForRange(manifest,30.25,40,1);assert.deepEqual(local.map(x=>x.id),['LONG-6','LONG-7','LONG-8']);
// clip.start + trim mapping.
p=P.planClip({manifest,clipStart:20,trim:10,clipLength:20,cursor:25,contextStart:50,lookahead:0});assert.equal(p.events[0].chunkId,'LONG-3');assert.equal(p.events[0].offset,0);assert.equal(p.events[0].when,50);
// Two tracks and a short FX can share one AudioContext anchor; planner yields deterministic when values.
const a=P.planClip({manifest,clipStart:0,trim:0,clipLength:120,cursor:30,contextStart:200,lookahead:0});
const b=P.planClip({manifest:{chunks:Array.from({length:24},(_,i)=>({id:'B-'+i,start:i*5,duration:5}))},clipStart:32,trim:0,clipLength:20,cursor:30,contextStart:200,lookahead:0});
assert.equal(a.events[0].when,200);assert.equal(b.events[0].when,202);const fxWhen=200+Math.max(0,32-30);assert.equal(fxWhen,b.events[0].when);
console.log('STUDIO-PLAYBACK-LONG-007 chunk architecture prototype PASS');
