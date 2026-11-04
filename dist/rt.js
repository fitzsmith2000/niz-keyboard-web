import {animateTravel} from './travel-motion.js';
import {chooseTravel} from './tracking.js';
import {ROWS,DEFAULT_CODES,assert,command} from './protocol.js';
import {keyName} from './keycodes.js';

// NiZ 1.0.8 mini84 limits; threshold is an index into 0.1–0.7 mm.
export function triggerPackets(target,baseline){
  assert(Array.isArray(target)&&target.length===252&&target.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'触发配置必须包含 252 个字节。');
  target.filter((_,i)=>i%3===0).forEach((_,key)=>{
    const [upper,lower,threshold]=target.slice(key*3,key*3+3);
    if(baseline&&target.slice(key*3,key*3+3).every((n,i)=>n===baseline[key*3+i]))return;
    assert(upper>=6&&upper<=34&&lower>=8&&lower<=36&&upper<lower&&threshold<=6,`按键 ${key+1} 的触发参数超出 mini84 原厂范围。`);
  });
  return [command(0xd2),...Array.from({length:Math.ceil(target.length/61)},(_,i)=>command(0xd4,[target.slice(i*61,i*61+61).length,...target.slice(i*61,i*61+61)])),[0,...Array(63).fill(0xd1)]];
}
let travel={sample:null,history:[],peak:0,message:'连接键盘后开始全键监测。',stopping:false,previous:new Map(),byKey:new Map(),pressed:[],scanMs:null};
export function resetTravel(){travel={sample:null,history:[],peak:0,message:'开始全键监测后，按任意实体键即可显示行程。',stopping:false,previous:new Map(),byKey:new Map(),pressed:[],scanMs:null};}
function paintTravel(state,escapeHTML){
  const root=document.querySelector('#rt-live');
  if(!root)return;
  const active=state.channel?.trackingActive===true;
  root.dataset.active=String(active);
  root.querySelector('#rt-live-label').textContent=active?'当前行程':'最后读数';
  root.querySelector('#rt-live-name').textContent=travel.sample?`${keyName(DEFAULT_CODES[travel.sample.key-1])} · #${travel.sample.key}`:'等待按键';
  animateTravel(root,travel.sample,active,travel.scanMs);
  root.querySelector('#rt-live-peak').textContent=travel.sample?travel.peak.toFixed(1):'—';
  root.querySelector('#rt-live-raw').textContent=travel.sample?String(travel.sample.raw):'—';
  root.querySelector('#rt-live-message').textContent=travel.message;
  root.querySelector('#rt-live-rate').textContent=travel.scanMs===null?'按设备回复更新':`84 键 / ${Math.round(travel.scanMs)} ms`;
  root.querySelector('#rt-live-active').innerHTML=travel.pressed.map(sample=>`<span>${escapeHTML(keyName(DEFAULT_CODES[sample.key-1]))}<b>${sample.mm.toFixed(1)} mm</b></span>`).join('');
  document.querySelectorAll('[data-rt-key]').forEach(button=>{const key=Number(button.dataset.rtKey);button.classList.toggle('travel-active',active&&travel.pressed.some(sample=>sample.key===key));button.querySelector('small').textContent=active?(travel.previous.get(key)??0).toFixed(1):(state.snapshot.triggers[(key-1)*3]/10).toFixed(1);});
  const caption=document.querySelector('#rt-board-readout');if(caption)caption.textContent=active?'监测中 · 键帽数值为当前实机行程 mm':'点击键帽多选 · 数值为触发上限 mm';
  root.querySelector('#rt-live-curve').setAttribute('points',travel.history.map(point=>`${Math.max(0,600-(travel.history.at(-1).time-point.time)/10)},${130-point.mm*30}`).join(' '));
}
let selection=new Set(),values=[8,35,2];
export function renderRT(state,refresh,dialog,escapeHTML,widths){
  const root=document.querySelector('#view-rt'),labels=['触发上限','触发下限','动态阈值'],limits=[[6,34],[8,36],[0,6]];
  const mm=(n,i)=>((n+(i===2?1:0))/10).toFixed(1);
  root.innerHTML=`<div class="rt-board"><div class="rt-selection"><span>已选择 <b>${selection.size}</b> 个按键</span><div><button class="button" data-rt-select="all">选择全部按键</button><button class="button" data-rt-select="wasd">WASD</button><button class="text-button" data-rt-select="none">清除选择</button></div></div><div class="board-scroller"><div class="keyboard rt-keyboard">${ROWS.map(row=>`<div class="keyboard-row">${row.map(key=>{const changed=state.snapshot.triggers.slice((key-1)*3,key*3).some((n,i)=>n!==state.baseline.triggers[(key-1)*3+i]);return `<button class="key ${changed?'changed':''}" style="--width:${widths[key]??1}" data-rt-key="${key}" aria-pressed="${selection.has(key)}" aria-label="选择物理按键 ${key} ${escapeHTML(keyName(DEFAULT_CODES[key-1]))}"><span class="key-main">${escapeHTML(keyName(DEFAULT_CODES[key-1]))}</span><small>${(state.snapshot.triggers[(key-1)*3]/10).toFixed(1)}</small></button>`;}).join('')}</div>`).join('')}</div></div><div class="board-footer"><span id="rt-board-readout">点击键帽多选 · 数值为触发上限 mm</span><span>按物理键设置，适用于全部配置层</span></div></div>
  <section id="rt-live" class="panel rt-live" aria-label="实机实时行程"><div class="rt-live-heading"><div><h2>实机实时行程</h2><p>按任意实体键，自动显示发生变化的按键；同时按下多个键可查看各键行程。</p></div><div class="rt-live-controls"><span class="rt-live-scan-badge">84 键自动扫描</span><button class="button ${state.channel?.trackingActive?'':'button-primary'}" id="rt-live-toggle" ${!state.channel||state.busy||travel.stopping?'disabled':''}>${travel.stopping?'正在停止…':state.channel?.trackingActive?'停止监测':'开始全键监测'}</button></div></div><div class="rt-live-body"><div class="rt-live-meter"><span>4.0 mm</span><div class="rt-live-rail"><div id="rt-live-fill"></div></div><span>0.0 mm</span></div><div class="rt-live-reading"><span id="rt-live-name" class="rt-live-name">等待按键</span><small id="rt-live-label">当前行程</small><div><strong id="rt-live-value">—</strong><span>mm</span></div><p>峰值 <b id="rt-live-peak">—</b> mm <button class="text-button" id="rt-live-reset">重置</button></p><small>设备原始值 <span id="rt-live-raw">—</span></small></div><div class="rt-live-history"><svg viewBox="0 0 600 140" role="img" aria-label="最近六秒的设备行程曲线" preserveAspectRatio="none"><path d="M0 10H600M0 70H600M0 130H600"/><polyline id="rt-live-curve" points=""/></svg><div><span>最近 6 秒</span><span id="rt-live-rate">按设备回复更新</span></div></div></div><div id="rt-live-active" class="rt-live-active" aria-label="当前有行程的按键"></div><p id="rt-live-message" class="rt-live-message" role="status">${escapeHTML(travel.message)}</p><small class="rt-live-note">行程柱与大号读数使用缓动显示；原始值、峰值和曲线保留设备采样。行程按原厂显示规则换算。跟踪使用已保存的设备设置；页面中的修改需保存到键盘后生效。</small></section>
  <div class="remap-heading"><h2>动态快速触发 <span>RT</span></h2><span>NiZ 原厂参数</span></div><div class="rt-workspace"><div class="panel rt-travel"><div class="rt-travel-title">触发区间</div><div class="rt-travel-track"><div class="rt-window" style="top:${values[0]/40*100}%;height:${(values[1]-values[0])/40*100}%"></div><span style="top:${values[0]/40*100}%">上限 ${mm(values[0],0)} mm</span><span style="top:${values[1]/40*100}%">下限 ${mm(values[1],1)} mm</span></div><small>0 mm 释放 · 4 mm 按到底</small></div><div class="panel rt-settings"><h3>设置所选按键</h3><p>NiZ 使用上限、下限和一个共用动态阈值。先选键，调整参数，再应用到页面。多选时三项参数会统一应用到所选键。</p>${labels.map((label,i)=>`<div class="rt-field"><div><label for="rt-range-${i}">${label}</label><span><input id="rt-value-${i}" data-rt-mm="${i}" aria-label="${label}毫米" type="number" min="${mm(limits[i][0],i)}" max="${mm(limits[i][1],i)}" step="0.1" value="${mm(values[i],i)}"> mm</span></div><input id="rt-range-${i}" data-rt-field="${i}" type="range" min="${limits[i][0]}" max="${limits[i][1]}" step="1" value="${values[i]}"><small>${i===0?'可调整 0.6–3.4 mm':i===1?'可调整 0.8–3.6 mm，必须大于上限':'可调整 0.1–0.7 mm；按下与释放使用共用阈值'}</small></div>`).join('')}<div class="rt-actions"><button class="button button-primary" id="rt-apply" ${!selection.size?'disabled':''}>应用到所选按键</button><button class="button" id="rt-revert" ${!selection.size?'disabled':''}>撤销所选按键</button></div><details class="rt-presets"><summary>赛事附件中的参数参考</summary><p>以下仅填入标准固件编辑器，不会刷入赛事固件；具体按键效果尚待实机验收。</p><button class="button" data-rt-preset="narrow">窄区间 1.6–1.7 mm</button><button class="button" data-rt-preset="drt">DRT 1.6–2.4 mm / 0.5 mm</button></details></div></div><p class="calibration-footnote">标准固件的固定触发三档为 1.0 / 2.0 / 2.8 mm，可通过「自定义按键」中的「固定触发行程切换」功能切换。本页编辑动态触发区间。<br>页面调整后，点击顶部「保存到键盘」检查变更、自动备份并读回核对。当前版本的参数写入及实际触发效果尚未完成实机验收。</p>`;
  paintTravel(state,escapeHTML);
  root.inert=state.busy||state.channel?.calibrationActive===true;
  root.oninput=event=>{
    if(!event.target.matches('[data-rt-field],[data-rt-mm]')||event.target.value==='')return;
    const i=Number(event.target.dataset.rtField??event.target.dataset.rtMm);values[i]=event.target.hasAttribute('data-rt-mm')?Math.round(Number(event.target.value)*10)-(i===2?1:0):Number(event.target.value);
    document.querySelector(`#rt-value-${i}`).value=mm(values[i],i);document.querySelector(`#rt-range-${i}`).value=values[i];
    const window=root.querySelector('.rt-window');window.style.top=`${values[0]/40*100}%`;window.style.height=`${Math.max(0,values[1]-values[0])/40*100}%`;
    root.querySelectorAll('.rt-travel-track>span').forEach((span,j)=>{span.style.top=`${values[j]/40*100}%`;span.textContent=`${j?'下限':'上限'} ${mm(values[j],j)} mm`;});
  };
  root.onclick=async event=>{
    if(event.target.closest('#rt-live-reset')){travel.byKey.clear();travel.peak=travel.sample?.mm??0;travel.history=[];paintTravel(state,escapeHTML);return;}
    if(event.target.closest('#rt-live-toggle')){
      if(state.channel.trackingActive){travel.stopping=true;refresh();await state.channel.stopTracking();travel.stopping=false;refresh();return;}
      travel.sample=null;travel.history=[];travel.peak=0;travel.previous.clear();travel.byKey.clear();travel.pressed=[];travel.scanMs=null;travel.message='正在扫描全部按键，等待设备回复…';
      const error=(()=>{try{state.channel.startTracking(frame=>{
        const time=Date.now(),result=chooseTravel(frame.samples,travel.previous,travel.sample?.key);
        frame.samples.forEach(sample=>{
          const prior=travel.byKey.get(sample.key);
          travel.byKey.set(sample.key,{peak:Math.max(prior?.peak??0,sample.mm),history:[...(prior?.history??[]).filter(point=>time-point.time<=6000),{time,mm:sample.mm}]});
        });
        travel.previous=new Map(frame.samples.map(sample=>[sample.key,sample.mm]));
        travel.sample=result.focused;
        travel.peak=travel.sample?travel.byKey.get(travel.sample.key).peak:0;
        travel.history=travel.sample?travel.byKey.get(travel.sample.key).history:[];
        travel.message=result.pressed.length?`已检测到 ${result.pressed.length} 个按键有行程 · ${new Date(time).toLocaleTimeString('zh-CN',{hour12:false})}`:`84 键扫描中，等待按键 · ${new Date(time).toLocaleTimeString('zh-CN',{hour12:false})}`;
        travel.pressed=result.pressed;travel.scanMs=frame.scanMs;paintTravel(state,escapeHTML);
      },error=>{travel.stopping=false;travel.message=error?`跟踪已停止：${error.message}`:'已停止全键监测，显示最后一次设备读数。';if(error){travel.sample=null;travel.history=[];travel.pressed=[];}refresh();});}catch(error){return error;}})();
      if(error){travel.message=error.message;dialog('无法开始跟踪',`<p>${escapeHTML(error.message)}</p>`);}
      refresh();return;
    }

    const key=event.target.closest('[data-rt-key]'),select=event.target.closest('[data-rt-select]'),preset=event.target.closest('[data-rt-preset]');
    if(key){const n=Number(key.dataset.rtKey);if(selection.has(n))selection.delete(n);else {selection.add(n);values=state.snapshot.triggers.slice((n-1)*3,n*3);}refresh();}
    if(select){selection=new Set(select.dataset.rtSelect==='all'?Array.from({length:84},(_,i)=>i+1):select.dataset.rtSelect==='wasd'?[34,48,49,50]:[]);refresh();}
    if(preset){values=preset.dataset.rtPreset==='drt'?[16,24,4]:[16,17,2];refresh();}
    if(event.target.closest('#rt-apply')){
      const target=[...state.snapshot.triggers];selection.forEach(n=>target.splice((n-1)*3,3,...values));
      const error=(()=>{try{triggerPackets(target,state.snapshot.triggers);}catch(error){return error;}})();
      if(error)return dialog('无法应用触发参数',`<p>${escapeHTML(error.message)}</p>`);
      state.snapshot.triggers=target;refresh();
    }
    if(event.target.closest('#rt-revert')){selection.forEach(n=>state.snapshot.triggers.splice((n-1)*3,3,...state.baseline.triggers.slice((n-1)*3,n*3)));refresh();}
  };
}
