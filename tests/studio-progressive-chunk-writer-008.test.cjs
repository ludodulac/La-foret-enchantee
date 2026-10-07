const assert=require('node:assert/strict');const P=require('../experiments/studio-progressive-chunk-writer.js');
(async()=>{const rate=1000,store=new Map(),w=P.createChunkWriter({sourceId:'LONG',sampleRate:rate,channels:1,chunkSeconds:5,writeChunk:async(id,bytes)=>store.set(id,bytes.slice())});
for(let t=0;t<120;t+=.25){const x=new Float32Array(rate/4);for(let i=0;i<x.length;i++)x[i]=Math.sin((t*rate+i)/17)*.2;await w.push([x])}
const manifest=await w.finish();assert.equal(manifest.chunks.length,24);assert.equal(store.size,24);assert.equal(manifest.chunks[6].start,30);assert.equal(manifest.chunks[6].duration,5);
const m=w.metrics();assert(m.maxBufferedSamples<=rate*5);assert.equal(m.chunkCapacitySamples,rate*5);
// Reopen simulation: discard writer/PCM; direct lookup around 30 s reads one persisted autonomous RIFF/WAVE unit only.
const c=manifest.chunks.find(x=>x.start<=30.25&&x.start+x.duration>30.25);assert.equal(c.id,'LONG-000006.wav');const bytes=store.get(c.id);assert.equal(Buffer.from(bytes.slice(0,4)).toString(),'RIFF');assert.equal(Buffer.from(bytes.slice(8,12)).toString(),'WAVE');assert(bytes.byteLength<rate*5*2+100);
console.log('STUDIO-PLAYBACK-LONG-008 progressive independent WAV chunks PASS')})().catch(e=>{console.error(e);process.exit(1)});
