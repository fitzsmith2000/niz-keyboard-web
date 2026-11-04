// Presentation only: sensor samples, peaks and history remain unmodified.
let motion=null;
export function animateTravel(root,sample,active,scanMs){
  const target=sample?.mm??0;
  if(motion?.root===root&&motion.key===sample?.key&&motion.target===target&&motion.active===active)return;
  if(motion)cancelAnimationFrame(motion.frame);
  const from=motion&&motion.key===sample?.key?motion.value:0;
  const value=root.querySelector('#rt-live-value'),fill=root.querySelector('#rt-live-fill');
  motion={root,key:sample?.key,target,active,value:from,frame:0};
  const duration=active&&sample&&!matchMedia('(prefers-reduced-motion: reduce)').matches?Math.min(140,Math.max(60,(scanMs??175)*.8)):0;
  const started=performance.now();
  const paint=time=>{
    if(!root.isConnected)return;
    const progress=duration?Math.min(1,(time-started)/duration):1;
    motion.value=from+(target-from)*(1-(1-progress)**3);
    value.textContent=sample?motion.value.toFixed(1):'—';
    fill.style.transform=`scaleY(${motion.value/4})`;
    if(progress<1)motion.frame=requestAnimationFrame(paint);
  };
  paint(started);
}
