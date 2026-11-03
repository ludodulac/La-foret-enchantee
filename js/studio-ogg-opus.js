(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioOggOpus=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Mux Ogg Opus minimal. Entêtes + pages Ogg RFC 3533/7845, aucun paquet audio intégral mis en mémoire.
const CAPTURE=[79,103,103,83],POLY=0x04c11db7,FRAME_SAMPLES=960,MAX_PAGE_SEGMENTS=255;
const ascii=s=>new TextEncoder().encode(s);
const concat=parts=>{const n=parts.reduce((a,b)=>a+b.length,0),out=new Uint8Array(n);let i=0;for(const part of parts){out.set(part,i);i+=part.length}return out};
function crc32ogg(data){
  let reg=0;
  for(const octet of data){reg=(reg^((octet&255)<<24))>>>0;
    for(let i=0;i<8;i++)reg=((reg&0x80000000)?((reg<<1)^POLY):(reg<<1))>>>0}
  return reg>>>0;
}
function opusHead({channels=2,preSkip=312,inputRate=48000}={}){
  if(![1,2].includes(channels)||!Number.isInteger(preSkip)||preSkip<0||preSkip>65535||
     !Number.isInteger(inputRate)||inputRate<1)throw Error('OpusHead invalide');
  const b=new Uint8Array(19),v=new DataView(b.buffer);b.set(ascii('OpusHead'));
  b[8]=1;b[9]=channels;v.setUint16(10,preSkip,true);
  v.setUint32(12,inputRate,true);v.setInt16(16,0,true);b[18]=0;
  return b;
}
function opusTags(vendor='Studio Audio'){
  const name=ascii(vendor);
  if(name.length>200)throw Error('Vendor Opus trop long');
  const result=new Uint8Array(8+4+name.length+4),view=new DataView(result.buffer);
  result.set(ascii('OpusTags'));view.setUint32(8,name.length,true);
  result.set(name,12);view.setUint32(12+name.length,0,true);return result;
}
function segments(packet){
  if(!(packet instanceof Uint8Array)||packet.length===0||packet.length>65024)
    throw Error('Paquet Opus non valide');
  const lace=[];for(let i=0;i<Math.floor(packet.length/255);i++)lace.push(255);
  lace.push(packet.length%255);return lace;
}
function page({packets,serial,sequence,granule,bos=false,eos=false}){
  if(!Array.isArray(packets)||!packets.length||!Number.isInteger(serial)||serial<0||serial>0xffffffff||
    !Number.isInteger(sequence)||sequence<0||sequence>0xffffffff||
    typeof granule!=='bigint'||granule<0n)throw Error('Page Ogg invalide');
  const lace=packets.flatMap(segments),payload=concat(packets);
  if(lace.length>MAX_PAGE_SEGMENTS)throw Error('Page Ogg trop grande');
  const out=new Uint8Array(27+lace.length+payload.length),v=new DataView(out.buffer);
  out.set(CAPTURE);out[4]=0;out[5]=(bos?2:0)|(eos?4:0);
  v.setBigUint64(6,granule,true);v.setUint32(14,serial,true);
  v.setUint32(18,sequence,true);v.setUint32(22,0,true);
  out[26]=lace.length;out.set(lace,27);out.set(payload,27+lace.length);
  v.setUint32(22,crc32ogg(out),true);return out;
}
function createMuxer({channels=2,preSkip=312,inputRate=48000,serial=0x53545544,packetsPerPage=25}={}){
  if(!Number.isInteger(packetsPerPage)||packetsPerPage<1||packetsPerPage>40)
    throw Error('Taille page Ogg invalide');
  let started=false,finished=false,seq=0,count=0,group=[];
  const head=opusHead({channels,preSkip,inputRate});
  function begin(){
    if(started||finished)throw Error('Mux Opus déjà initialisé');
    started=true;
    return[page({packets:[head],serial,sequence:seq++,granule:0n,bos:true}),
      page({packets:[opusTags()],serial,sequence:seq++,granule:0n})];
  }
  function packet(raw){
    if(!started||finished)throw Error('Mux Opus non prêt');
    segments(raw);
    group.push(raw.slice());count++;
    if(group.length>=packetsPerPage)return flush(false);
    return[];
  }
  function flush(eos=false,finalGranule){
    if(!started||finished)throw Error('Mux Opus non prêt');
    if(eos&&count<1)throw Error('Aucun paquet Opus encodé');
    if(!group.length){
      if(!eos)return[];
      throw Error('Page finale Opus vide');
    }
    const granule=eos?BigInt(finalGranule):BigInt(count*FRAME_SAMPLES);
    if(eos&&(!Number.isSafeInteger(finalGranule)||finalGranule<preSkip||finalGranule>count*FRAME_SAMPLES))
      throw Error('Durée Opus encodée insuffisante');
    const packets=group;group=[];if(eos)finished=true;
    return[page({packets,serial,sequence:seq++,granule,eos})];
  }
  function finishWithPacket(raw,granule){
    if(!started||finished)throw Error('Mux Opus non prêt');
    segments(raw);group.push(raw.slice());count++;
    return flush(true,granule);
  }
  return{begin,packet,finish:granule=>flush(true,granule),finishWithPacket,flush:()=>flush(false),get packets(){return count},
    get pages(){return seq},get finished(){return finished}};
}
function readPage(data){
  const bytes=data instanceof Uint8Array?data:new Uint8Array(data),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length<27||String.fromCharCode(...bytes.slice(0,4))!=='OggS'||bytes[4]!==0)
    throw Error('En-tête Ogg invalide');
  const n=bytes[26];if(bytes.length<27+n)throw Error('Lacing Ogg tronqué');
  const size=bytes.slice(27,27+n).reduce((a,b)=>a+b,0);
  if(bytes.length!==27+n+size)throw Error('Taille page Ogg invalide');
  const want=v.getUint32(22,true),check=bytes.slice();new DataView(check.buffer).setUint32(22,0,true);
  if(want!==crc32ogg(check))throw Error('CRC Ogg incorrect');
  return{serial:v.getUint32(14,true),sequence:v.getUint32(18,true),granule:v.getBigUint64(6,true),
    bos:!!(bytes[5]&2),eos:!!(bytes[5]&4),size,laces:n};
}
return{FRAME_SAMPLES,crc32ogg,opusHead,opusTags,segments,page,createMuxer,readPage};
});
