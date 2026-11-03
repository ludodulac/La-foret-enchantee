const assert=require('node:assert/strict');
const O=require('../js/studio-ogg-opus.js');
const enc=new TextEncoder();
function independCRC(buf){
  let crc=0;
  for(let b of buf){crc^=b<<24;for(let k=0;k<8;k++)crc=((crc&0x80000000)?((crc<<1)^0x04c11db7):(crc<<1))>>>0}
  return crc>>>0;
}
const head=O.opusHead({channels:2,preSkip:312,inputRate:48000});
assert.equal(new TextDecoder().decode(head.slice(0,8)),'OpusHead');
assert.equal(new DataView(head.buffer).getUint16(10,true),312);
assert.equal(head[18],0);
const tags=O.opusTags();assert.equal(new TextDecoder().decode(tags.slice(0,8)),'OpusTags');
assert.deepEqual(O.segments(new Uint8Array(255).fill(1)),[255,0]);
assert.deepEqual(O.segments(new Uint8Array(256).fill(1)),[255,1]);
assert.deepEqual(O.segments(new Uint8Array(51).fill(1)),[51]);
assert.throws(()=>O.segments(new Uint8Array(0)),/non valide/);
assert.throws(()=>O.segments(new Uint8Array(65536)),/non valide/);
const mux=O.createMuxer({packetsPerPage:4});
const pages=mux.begin();assert.equal(pages.length,2);
for(let i=0;i<12;i++)pages.push(...mux.packet(new Uint8Array(95+i).fill(i+1)));
pages.push(...mux.packet(new Uint8Array(255).fill(7)));
assert.equal(mux.packets,13);
pages.push(...mux.finish(13*960-300));
assert.equal(pages.length,2+3+1);
const serials=new Set(),sequences=[],granules=[];
for(let i=0;i<pages.length;i++){
  const parsed=O.readPage(pages[i]);serials.add(parsed.serial);
  sequences.push(parsed.sequence);granules.push(Number(parsed.granule));
  const c=pages[i].slice();new DataView(c.buffer).setUint32(22,0,true);
  assert.equal(new DataView(pages[i].buffer).getUint32(22,true),independCRC(c));
  assert.equal(parsed.bos,i===0);assert.equal(parsed.eos,i===pages.length-1);
}
assert.equal(serials.size,1);
assert.deepEqual(sequences,sequences.map((_,i)=>i));
assert.deepEqual(granules,[0,0,3840,7680,11520,13*960-300]);
assert.throws(()=>O.readPage(new Uint8Array(40)),/invalide/);
const corrupt=pages[3].slice();corrupt[corrupt.length-1]^=1;assert.throws(()=>O.readPage(corrupt),/CRC/);
assert.throws(()=>mux.packet(new Uint8Array([1])),/non prêt/);
assert.throws(()=>mux.finish(100),/non prêt/);
const few=O.createMuxer({packetsPerPage:25});few.begin();few.packet(new Uint8Array([1]));
assert.throws(()=>few.finish(1200),/insuffisante/);
console.log('STUDIO-OPUS-025: Ogg header, CRC, granule, BOS/EOS, Ogg lacing, packet preservation PASS');
