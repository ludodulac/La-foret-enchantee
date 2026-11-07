/* Timeline geometry and tap-versus-pan decisions for Ludodio Studio. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.StudioTimelineNavigation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MIN_ZOOM=0.005,MAX_ZOOM=30;
  function clampZoom(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,n)):1;
  }
  function pixelsPerSecond(viewport,zoom){
    return Math.max(1,Number(viewport)||1)/15*clampZoom(zoom);
  }
  function fitZoom(viewport,duration){
    const seconds=Math.max(1,Number(duration)||15);
    return clampZoom((15/seconds)*0.96);
  }
  function rulerStep(pps){
    return Math.max(5,5*Math.ceil(80/Math.max(0.00001,pps*5)));
  }
  function isTap(x0,y0,x1,y1,initialScroll,finalScroll){
    return Number.isFinite(x0)&&Math.hypot(x1-x0,y1-y0)<=7&&Math.abs(finalScroll-initialScroll)<=5;
  }
  return{MIN_ZOOM,MAX_ZOOM,clampZoom,pixelsPerSecond,fitZoom,rulerStep,isTap};
});
