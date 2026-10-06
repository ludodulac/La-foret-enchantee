(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioPlaybackPreload=api})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const DEFAULT_LIMIT=8;
function buildPreloadPlan({clips=[],tracks=[],cursor=0,limit=DEFAULT_LIMIT,sourceIdFor=c=>c.sourceId}={}){
  const trackById=new Map(tracks.map(t=>[t.id,t]));
  const active=new Map(),future=new Map();
  for(const c of clips){
    const t=trackById.get(c.track);
    if(c.muted||t?.muted)continue;
    const end=c.start+c.len;
    if(!(end>cursor))continue;
    const id=sourceIdFor(c);
    if(!id)continue;
    if(c.start<=cursor){
      if(!active.has(id))active.set(id,{id,at:cursor});
      future.delete(id);
    }else if(!active.has(id)){
      const prev=future.get(id);
      if(!prev||c.start<prev.at)future.set(id,{id,at:c.start});
    }
  }
  const ordered=[...active.values(),...[...future.values()].sort((a,b)=>a.at-b.at)];
  return ordered.slice(0,Math.max(0,Math.floor(limit))).map(x=>x.id);
}
async function runSequentialPreload(ids,load,isCurrent=()=>true){for(const id of ids){if(!isCurrent())return;try{await load(id)}catch(e){if(isCurrent())throw e}if(!isCurrent())return}}\nreturn{DEFAULT_LIMIT,buildPreloadPlan,runSequentialPreload};
});