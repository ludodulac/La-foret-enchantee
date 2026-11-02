(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./studio-ogg-opus.js'):root.StudioOggOpus);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioOpusCompact=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Ogg){
'use strict';
// Encodage Opus Ogg non destructif, depuis un WAV stéréo PCM16 44,1 kHz validé.
// Encodage par paquets de 20 ms ; jamais de decodeAudioData() ni de WAV entier en RAM.
// Attention : compatibilité AudioEncoder/Opus à vérifier sur le téléphone cible.
const SOURCE_RATE=44100,TARGET_RATE=48000,CHANNELS=2,PRE_SKIP=312,FRAMES_PER_PACKET=960;
const MAX_SECONDS=60*60,MAX_SOURCE_BYTES=44+MAX_SECONDS*SOURCE_RATE*4;
const invalid=msg=>{throw Error(msg)};
function cancelled(signal){if(signal?.aborted){const e=Error('Encodage Opus annulé');e.name='AbortError';throw e}}
function inspectWav(file){
  if(!(file instanceof Blob)||file.size<48||file.size>MAX_SOURCE_BYTES)invalid('WAV source trop grand ou illisible');
  return file.slice(0,44).arrayBuffer().then(raw=>{
    const b=new Uint8Array(raw),v=new DataView(raw),word=(a,n)=>String.fromCharCode(...b.slice(a,a+n));
    if(word(0,4)!=='RIFF'||word(8,4)!=='WAVE'||word(12,4)!=='fmt '||word(36,4)!=='data'||
      v.getUint32(16,true)!==16||v.getUint16(20,true)!==1||v.getUint16(22,true)!==2||
      v.getUint32(24,true)!==SOURCE_RATE||v.getUint16(32,true)!==4||
      v.getUint16(34,true)!==16||v.getUint32(28,true)!==SOURCE_RATE*4||
      v.getUint32(40,true)+44!==file.size||v.getUint32(4,true)+8!==file.size)
      invalid('WAV non pris en charge : stéréo PCM16 44,1 kHz requis');
    const frames=v.getUint32(40,true)/4;
    if(!Number.isSafeInteger(frames)||frames<1||frames/SOURCE_RATE>MAX_SECONDS)
      invalid('Durée WAV non prise en charge');
    return{frames,seconds:frames/SOURCE_RATE,bytes:file.size};
  });
}
async function encoderConfig(Encoder){
  if(typeof Encoder?.isConfigSupported!=='function')invalid('WebCodecs AudioEncoder indisponible');
  const base={codec:'opus',sampleRate:TARGET_RATE,numberOfChannels:CHANNELS,bitrate:96000};
  const candidates=[{...base,opus:{format:'opus',frameDuration:20000}},{...base}];
  for(const candidate of candidates){
    try{const res=await Encoder.isConfigSupported(candidate);if(res?.supported)return candidate}catch{}
  }
  invalid('L’encodage Opus WebCodecs n’est pas disponible sur ce navigateur');
}
function verifyOpusDescription(meta){
  const description=meta?.decoderConfig?.description;
  if(!description)return;
  const data=new Uint8Array(description instanceof ArrayBuffer?description:description.buffer||description);
  if(data.length<12)return;
  const tag=String.fromCharCode(...data.slice(0,8));
  if(tag==='OpusHead'&&new DataView(data.buffer,data.byteOffset,data.byteLength).getUint16(10,true)!==PRE_SKIP)
    invalid('Délai du codec Opus inattendu : qualité non vérifiée, fichier conservé en WAV');
}
async function encodeWav(file,{AudioEncoderType=globalThis.AudioEncoder,AudioDataType=globalThis.AudioData,
  navigator:nav=typeof navigator!=='undefined'?navigator:null,directory,signal,
  onProgress=()=>{},yieldFn=()=>new Promise(resolve=>setTimeout(resolve,0)),
  filename}={}){
  cancelled(signal);
  const {frames,seconds}=await inspectWav(file);
  const config=await encoderConfig(AudioEncoderType);
  if(typeof AudioDataType!=='function')invalid('AudioData WebCodecs indisponible');
  const root=directory||await nav?.storage?.getDirectory?.();
  if(!root)invalid('OPFS indispensable pour encoder sans bloquer le téléphone');
  const name=filename||'.studio-opus-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.tmp.ogg';
  if(!/^\.studio-opus-[a-z0-9-]+\.tmp\.ogg$/.test(name))invalid('Nom de fichier temporaire incorrect');
  let handle=null,writer=null,encoder=null,closed=false,removed=false;
  const cleanup=async()=>{if(removed)return;removed=true;await root.removeEntry(name)};
  const targetFrames=Math.round(frames*TARGET_RATE/SOURCE_RATE);
  const originalTargetFrames=targetFrames;
  const totalFrames=targetFrames+PRE_SKIP;
  const packetInputs=Math.ceil(totalFrames/FRAMES_PER_PACKET);
  const mux=Ogg.createMuxer({channels:2,preSkip:PRE_SKIP,inputRate:SOURCE_RATE,packetsPerPage:25,
    serial:0x53545544});
  let writeChain=Promise.resolve(),lastPacket=null,encoderFault=null,outputPackets=0;
  const writePages=pages=>{for(const p of pages)writeChain=writeChain.then(()=>writer.write(p)).catch(e=>{encoderFault=e;throw e})};
  try{
    handle=await root.getFileHandle(name,{create:true});
    writer=await handle.createWritable();
    writePages(mux.begin());
    encoder=new AudioEncoderType({
      output(chunk,metadata){
        try{
          verifyOpusDescription(metadata);
          const b=new Uint8Array(chunk.byteLength);
          chunk.copyTo(b);
          if(lastPacket)writePages(mux.packet(lastPacket));
          lastPacket=b;outputPackets++;
        }catch(e){encoderFault=e}
      },
      error(e){encoderFault=e instanceof Error?e:Error(String(e))}
    });
    encoder.configure(config);
    // Every block reads <= 885 input frames (3.6 KiB), not a 35-minute audio buffer.
    for(let packet=0;packet<packetInputs;packet++){
      cancelled(signal);if(encoderFault)throw encoderFault;
      const base=packet*FRAMES_PER_PACKET,end=base+FRAMES_PER_PACKET;
      const firstInput=Math.max(0,Math.floor(Math.max(0,base-PRE_SKIP)*SOURCE_RATE/TARGET_RATE));
      const lastInput=Math.min(frames-1,Math.ceil(Math.max(0,end-PRE_SKIP)*SOURCE_RATE/TARGET_RATE)+1);
      const startByte=44+firstInput*4,endByte=44+(lastInput+1)*4;
      const raw=await file.slice(startByte,endByte).arrayBuffer(),view=new DataView(raw);
      if(raw.byteLength!==(lastInput-firstInput+1)*4)invalid('Échantillons WAV tronqués');
      const samples=new Float32Array(FRAMES_PER_PACKET*CHANNELS);
      for(let f=0;f<FRAMES_PER_PACKET;f++){
        const absolute=base+f;
        if(absolute<PRE_SKIP||absolute>=totalFrames)continue;
        const pos=(absolute-PRE_SKIP)*SOURCE_RATE/TARGET_RATE;
        const i=Math.min(frames-1,Math.floor(pos)),j=Math.min(frames-1,i+1);
        const w=pos-i,ai=(i-firstInput)*4,aj=(j-firstInput)*4;
        for(let ch=0;ch<2;ch++){
          const val=(view.getInt16(ai+ch*2,true)*(1-w)+view.getInt16(aj+ch*2,true)*w)/32768;
          samples[ch*FRAMES_PER_PACKET+f]=Math.max(-1,Math.min(1,val));
        }
      }
      const audio=new AudioDataType({format:'f32-planar',sampleRate:TARGET_RATE,
        numberOfFrames:FRAMES_PER_PACKET,numberOfChannels:CHANNELS,
        timestamp:packet*20000,data:samples});
      try{encoder.encode(audio)}finally{audio.close()}
      if(packet%40===39||packet===packetInputs-1){
        await encoder.flush();await writeChain;
        if(encoderFault)throw encoderFault;
        onProgress((packet+1)/packetInputs);
        await yieldFn();
      }
    }
    await encoder.flush();await writeChain;if(encoderFault)throw encoderFault;
    if(!lastPacket||outputPackets!==packetInputs)invalid('Paquets Opus manquants : fichier compact refusé');
    // The final packet is held back to guarantee a true Ogg EOS page.
    const lastGranule=originalTargetFrames+PRE_SKIP;
    writePages(mux.finishWithPacket(lastPacket,lastGranule));
    await writeChain;
    cancelled(signal);if(encoderFault)throw encoderFault;
    await writer.close();closed=true;
    const out=await handle.getFile();
    if(out.size<150||out.size>=file.size)invalid('Compression Opus absente ou fichier incomplet');
    const first=Ogg.readPage(new Uint8Array(await out.slice(0,47).arrayBuffer()).slice(0,47));
    if(!first.bos)invalid('Entête Ogg non certifié');
    return{file:out,blob:out,filename:name,cleanup,seconds,bytes:out.size,rate:TARGET_RATE,
      bitrate:config.bitrate,packetCount:outputPackets};
  }catch(e){
    if(writer&&!closed)try{await writer.abort?.(e)}catch{}
    try{await cleanup()}catch{}
    throw e;
  }finally{try{encoder?.close()}catch{}}
}
const TEMP_PATTERN=/^\.studio-opus-[a-z0-9-]+\.tmp\.ogg$/;
async function listTemporaryExports(dir){
  if(!dir||typeof dir.entries!=='function')invalid('Stockage local inaccessible');
  const items=[];
  for await(const [name,handle] of dir.entries()){
    if(handle.kind!=='file'||!TEMP_PATTERN.test(name))continue;
    const file=await(await dir.getFileHandle(name)).getFile();
    items.push({name,size:file.size});
  }
  return items.sort((a,b)=>a.name.localeCompare(b.name));
}
async function removeTemporaryExports(dir,names){
  if(!Array.isArray(names)||new Set(names).size!==names.length||
     names.some(name=>typeof name!=='string'||!TEMP_PATTERN.test(name)))
    invalid('Suppression refusée : seuls les exports Opus temporaires sont autorisés');
  for(const name of names)await dir.removeEntry(name);
  return names.length;
}
return{SOURCE_RATE,TARGET_RATE,PRE_SKIP,FRAMES_PER_PACKET,inspectWav,encoderConfig,verifyOpusDescription,encodeWav,listTemporaryExports,removeTemporaryExports};
});