const assert=require('node:assert/strict'),C=require('../js/studio-export-core.js');
function buf(d,sr=44100,ch=1,fn=i=>Math.sin(2*Math.PI*440*i/sr)*.25){let n=Math.round(d*sr),a=Array.from({length:ch},(_,channel)=>{let x=new Float32Array(n);for(let i=0;i<n;i++)x[i]=fn(i,channel);return x});return{duration:n/sr,length:n,sampleRate:sr,numberOfChannels:ch,getChannelData:i=>a[i]}}
function ramp(d,sr=44100){return buf(d,sr,1,i=>i/Math.round(d*sr))}
function clip(o={}){let b=o.buffer||buf(o.duration||1);return{start:o.start??0,trim:o.trim??0,len:o.len??b.duration,gain:o.gain??1,trackGain:o.trackGain??1,muted:o.muted??false,trackMuted:o.trackMuted??false,buffer:b}}
async function mix(cs,start,end){let p=C.validatePlan(cs,start,end),m=await C.mixPcmCooperative(cs,p);return{p,m}}
async function run(name,cs,start,end,check,{requireSound=true}={}){let {p,m}=await mix(cs,start,end),blob=await C.encodeWavCooperative(m.left,m.right,p.sampleRate),ab=await blob.arrayBuffer(),v=new DataView(ab);assert.equal(v.getUint32(24,true),44100);assert.equal(v.getUint32(40,true),p.frames*4);assert.equal(blob.size,44+p.frames*4);assert.ok(m.left.every(Number.isFinite)&&m.right.every(Number.isFinite));if(requireSound)assert.ok(m.left.some(x=>x!==0));if(check)check({p,m,blob});console.log('PASS',name,p.frames,blob.size)}
function near(actual,expected,tol=2e-5){assert.ok(Math.abs(actual-expected)<=tol,'attendu '+expected+', obtenu '+actual)}
(async()=>{
 await run('NR export complet 0-fin',[clip({duration:5.5})],0,5.5,({p})=>assert.equal(p.frames,242550));
 let timeline=ramp(10);
 await run('A sélection 2-5 = 3s',[clip({buffer:timeline,len:10})],2,5,({p})=>assert.equal(p.frames,132300));
 await run('B début sélection devient frame 0',[clip({buffer:timeline,len:10})],2,5,({m})=>near(m.left[0],timeline.getChannelData(0)[2*44100]));
 await run('C clip commence avant sélection',[clip({buffer:timeline,start:1,len:6})],3,5,({m})=>near(m.left[0],timeline.getChannelData(0)[2*44100]));
 await run('D clip finit après sélection',[clip({buffer:timeline,start:2,len:6})],3,5,({m})=>near(m.left[m.left.length-1],timeline.getChannelData(0)[Math.floor((5-2)*44100)-1]));
 await run('E clip hors sélection',[clip({buffer:buf(1),start:0,len:1})],2,5,({m})=>assert.ok(m.left.every(x=>x===0)),{requireSound:false});
 await run('F seulement clips intersectants',[clip({buffer:buf(1,44100,1,()=>.1),start:0}),clip({buffer:buf(2,44100,1,()=>.2),start:3,len:2}),clip({buffer:buf(1,44100,1,()=>.4),start:8})],2,5,({m})=>{near(m.left[0],0);near(m.left[44100],.2);near(m.left[m.left.length-1],.2)});
 await run('G sélection + trim',[clip({buffer:timeline,start:1,trim:2,len:5})],3,5,({m})=>near(m.left[0],timeline.getChannelData(0)[4*44100]));
 await run('H sélection + gains',[clip({buffer:buf(5,44100,1,()=>.4),start:0,len:5,gain:.5,trackGain:.25})],2,4,({m})=>near(m.left[0],.05));
 assert.throws(()=>C.validatePlan([clip()],5,5));assert.throws(()=>C.validatePlan([clip()],5,2));console.log('PASS I sélection invalide');
 for(let [n,fn] of [['NaN',()=>C.validatePlan([clip()],0,NaN)],['trim hors buffer',()=>C.validatePlan([clip({buffer:buf(1),trim:.8,len:.5})],0,1)],['mémoire',()=>C.validatePlan([clip()],0,600)]]){assert.throws(fn);console.log('PASS garde-fou',n)}
 console.log('ALL PASS')
})().catch(e=>{console.error(e);process.exit(1)});
