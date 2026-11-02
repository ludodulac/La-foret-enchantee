'use strict';
// Real Chromium gate: native WebCodecs encode -> Ogg/Opus -> independent decode.
const assert=require('node:assert/strict'),http=require('node:http'),
  fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),ROOT=path.resolve(__dirname,'..');
const FILES=new Set(['/js/studio-ogg-opus.js','/js/studio-opus-compact.js']);
const server=http.createServer((req,res)=>{
  const url=(req.url||'/').split('?')[0];
  if(url==='/'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><script src="/js/studio-ogg-opus.js"></script><script src="/js/studio-opus-compact.js"></script></body></html>');
    return;
  }
  if(!FILES.has(url)){res.writeHead(404);res.end('Not found');return}
  res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
  fs.createReadStream(path.resolve(ROOT,url.slice(1))).pipe(res);
});
const listen=()=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=()=>new Promise(resolve=>server.close(resolve));
(async()=>{
  let browser;
  try{
    const port=await listen();
    browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
    const page=await browser.newPage();
    page.on('console',msg=>{if(msg.type()==='error')console.error('[browser console]',msg.text())});
    page.on('pageerror',err=>console.error('[browser pageerror]',err.message));
    await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'load',timeout:30000});
    const result=await page.evaluate(async()=>{
      if(typeof AudioEncoder==='undefined'||typeof AudioData==='undefined')
        return{supported:false,reason:'AudioEncoder or AudioData unavailable'};
      let supported=false;
      try{supported=(await AudioEncoder.isConfigSupported({
        codec:'opus',sampleRate:48000,numberOfChannels:2,bitrate:96000
      })).supported}catch(e){return{supported:false,reason:e.message}}
      if(!supported)return{supported:false,reason:'Opus AudioEncoder unsupported'};
      const duration=1.5,rate=44100,frames=Math.round(rate*duration);
      const bytes=new Uint8Array(44+frames*4),v=new DataView(bytes.buffer);
      const tag=(at,s)=>{for(let j=0;j<s.length;j++)bytes[at+j]=s.charCodeAt(j)};
      tag(0,'RIFF');v.setUint32(4,bytes.length-8,true);tag(8,'WAVEfmt ');
      v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
      v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);
      v.setUint16(32,4,true);v.setUint16(34,16,true);tag(36,'data');
      v.setUint32(40,frames*4,true);
      for(let i=0;i<frames;i++){
        const t=i/rate;
        v.setInt16(44+i*4,Math.round(19000*Math.sin(t*Math.PI*2*440)),true);
        v.setInt16(46+i*4,Math.round(18000*Math.sin(t*Math.PI*2*330)),true);
      }
      const source=new Blob([bytes],{type:'audio/wav'});
      let encoded,report={supported:true,bytes:source.size};
      try{
        encoded=await StudioOpusCompact.encodeWav(source,{onProgress:p=>{report.lastProgress=p}});
        report.oggBytes=encoded.file.size;
        report.packetCount=encoded.packetCount;
        report.oggType=encoded.file.type;
      }catch(e){report.stage='encode';report.error=e.name+': '+e.message;return report}
      const ac=new AudioContext({sampleRate:48000});
      try{
        const encodedBytes=await encoded.file.arrayBuffer();
        const decoded=await ac.decodeAudioData(encodedBytes.slice(0));
        report.decodedDuration=decoded.duration;
        report.sampleRate=decoded.sampleRate;
        report.channels=decoded.numberOfChannels;
        function rms(channel,start,end){
          const data=decoded.getChannelData(channel),a=Math.floor(start*decoded.sampleRate);
          const b=Math.min(data.length,Math.floor(end*decoded.sampleRate));let e=0;
          for(let i=a;i<b;i++)e+=data[i]*data[i];
          return Math.sqrt(e/Math.max(1,b-a));
        }
        report.rmsStart=rms(0,.08,.20);
        report.rmsMiddle=rms(0,.60,.90);
        report.rmsEnd=rms(0,1.25,1.42);
        report.rmsRight=rms(1,.60,.90);
        report.stage='ok';
      }catch(e){report.stage='decode';report.error=e.name+': '+e.message}
      finally{await ac.close();await encoded.cleanup()}
      return report;
    });
    console.log('NATIVE_BROWSER_RESULT='+JSON.stringify(result));
    assert.equal(result.supported,true,'Browser needs native Opus encoder');
    assert.equal(result.stage,'ok','Ogg file must independently decode in real Chromium');
    assert(result.oggBytes<result.bytes/3,'Output should be substantially smaller than WAV');
    assert(Math.abs(result.decodedDuration-1.5)<.025,'decoded duration must match source');
    assert.equal(result.channels,2);
    for(const name of ['rmsStart','rmsMiddle','rmsEnd','rmsRight'])
      assert(result[name]>.06,name+' must contain audible sound');
    assert.equal(result.lastProgress,1);
    console.log('STUDIO-OPUS-BROWSER-028: native encode -> Ogg -> independent decode, duration and nonzero audio PASS');
  }finally{
    try{await browser?.close()}catch{}
    if(server.listening)await close();
  }
})().catch(e=>{console.error(e);process.exitCode=1});
