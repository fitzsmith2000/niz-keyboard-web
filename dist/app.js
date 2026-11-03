import {MODEL,DEFAULT_CODES,ROWS,assert,recordId,decode,encode,equal,validateSnapshot,demoSnapshot} from './protocol.js';
import {KEY_NAMES,keyName} from './keycodes.js';
import {NiZDevice} from './hid.js';
import {saveBackup,backups,download} from './storage.js';
const $=selector=>document.querySelector(selector);
const $$=selector=>Array.from(document.querySelectorAll(selector));
const escapeHTML=text=>String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const shortName=code=>({0:'—',27:'⌫',28:'Tab',42:'Caps',54:'Enter',55:'Shift',66:'Shift',67:'Ctrl',68:'⌘ / Win',69:'⌥ / Alt',70:'Space',71:'⌥ / Alt',72:'⌘ / Win',74:'Ctrl',78:'PrtSc',79:'ScrLk',83:'PgUp',84:'Del',86:'PgDn',156:'Fn',166:'Fn'}[code]??keyName(code));
const widths={30:2,32:1.5,45:1.5,47:1.75,59:2.25,61:2.25,72:1.75,75:1.25,76:1.25,77:1.25,78:6.25};
const sample=demoSnapshot();
const state={view:'keymap',mode:'demo',snapshot:sample,baseline:structuredClone(sample),channel:null,layer:1,key:47,definition:{kind:0,codes:[42],interval:30,cycles:1},category:'basic',search:'',append:false,busy:false,logs:[],backupItems:[],calibrationGroups:0,calibrationReleaseDone:false,calibrationMessage:''};
let modalAction=null, toastTimer;
const summary=mapping=>{const d=decode(mapping);return d.kind<2?(d.kind===1?'连发 · ':'')+(d.codes.length?d.codes.map(keyName).join(' + '):'未分配'):`宏 · ${d.codes.length} 个动作`;};
const selected=()=>state.snapshot.mappings[(state.layer-1)*84+state.key-1];
const changed=()=>state.snapshot.mappings.filter((m,i)=>!equal(m,state.baseline.mappings[i]));
function log(text) {state.logs.push({time:new Date().toLocaleTimeString('zh-CN',{hour12:false}),text});$('#status-text').textContent=text;}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3000);}
function progress(phase,ratio){$('#progress-label').textContent=phase;$('#progress-number').textContent=`${Math.round(ratio*100)}%`;$('#progress-bar').style.width=`${ratio*100}%`;$('#status-text').textContent=phase;}
function showDialog(title,body,action=null,confirmLabel='确认') {
  $('#modal-title').textContent=title;$('#modal-body').innerHTML=body;$('#modal-confirm').textContent=confirmLabel;$('#modal-confirm').disabled=false;$('#modal-confirm').hidden=!action;$('#modal-cancel').textContent=action?'取消':'知道了';modalAction=action;
  if(!$('#modal').open)$('#modal').showModal();
}
function closeDialog(){$('#modal').close();modalAction=null;}
async function run(action){
  if(state.busy)return;
  state.busy=true;$('#progress-wrap').hidden=false;progress('准备中',0);renderControls();
  try{await action();}
  catch(error){if(state.view==='calibration')state.calibrationMessage=`操作未完成：${error.message}`;log(error.message);showDialog('操作未完成',`<p>${escapeHTML(error.message)}</p>`);}
  finally{state.busy=false;$('#progress-wrap').hidden=true;renderControls();}
}
function loadSelection(){state.definition=decode(selected());state.append=state.definition.codes.length>1;renderEditor();}
function renderControls(){
  const count=changed().length,calibrating=state.channel?.calibrationActive===true;
  $('#connect').disabled=state.busy;$('#connect').hidden=!!state.channel;
  $('#disconnect').hidden=!state.channel;$('#disconnect').disabled=state.busy||calibrating;
  $('#connection-badge').classList.toggle('connected',!!state.channel);
  $('#connection-badge').innerHTML=`<i></i> ${state.channel?'USB 已连接':'未连接'}`;
  $('#read').disabled=state.busy||calibrating||!state.channel;
  $('#review').disabled=state.busy||calibrating||!state.channel||count===0;
  $('#undo-all').disabled=state.busy||calibrating||count===0;
  $('#export').disabled=state.busy;
  $('#change-count').textContent=count;
  $('#changes-title').textContent=count?`${count} 个键位待保存`:'没有待保存的修改';
  $('#changes-description').textContent=state.mode==='demo'?'当前是演示配置，修改不会发送到键盘。':count?'先检查变更。写入前自动备份，完成后读取核对。':'修改会先留在页面中，检查确认后才会更新键盘。';
  const mode=state.mode==='demo'?'离线演示':state.channel?'正在编辑真实键盘':'正在编辑离线配置';
  $('#mode-label').textContent=mode;
  $('#mode-detail').textContent=state.mode==='demo'?'演示修改不会写入设备。连接后读取键盘配置。':state.channel?'已读取 84 键 × 9 层，原始配置已在本机备份。':'连接并读取键盘后，可导入此配置写入。请先导出页面中的修改。';
  $('#notice').classList.toggle('live',!!state.channel);
  $('#notice-action').textContent=state.channel?'导出备份':'连接键盘';
  $('#firmware-label').textContent=state.mode==='demo'?'标准布局 · 演示配置':state.snapshot.version;
  $('#keyboard').inert=state.busy||calibrating;$('.editor').inert=state.busy||calibrating;
  $('#device-mode').textContent=state.channel?'已连接设备':state.mode==='demo'?'演示设备':'离线配置';
  $('#profile-label').textContent=state.mode==='demo'?'演示配置':'键盘配置';
  $$('.nav-item').forEach(button=>button.disabled=state.busy||calibrating);
  $$('[data-rail]').forEach(button=>button.disabled=state.busy||calibrating);
  $('#device-connect').disabled=state.busy||calibrating;
  $$('#layers button').forEach(button=>button.disabled=state.busy);
  $('#notice-action').disabled=state.busy;
  if(state.view==='calibration')renderCalibration();
}
function renderBoard(){
  $('#layers').innerHTML=Array.from({length:9},(_,i)=>`<button aria-label="配置层 ${i+1}" aria-pressed="${state.layer===i+1}" data-layer="${i+1}"><span class="layer-prefix">层 </span>${i+1}</button>`).join('');
  $('#keyboard').innerHTML=ROWS.map(row=>`<div class="keyboard-row">${row.map(key=>{
    const mapping=state.snapshot.mappings[(state.layer-1)*84+key-1],d=decode(mapping),label=d.kind>=2?'宏':d.kind===1?'连发':d.codes.length===1?shortName(d.codes[0]):d.codes.length?d.codes.map(shortName).join('+'):'—';
    const physical=shortName(DEFAULT_CODES[key-1]);
    return `<button class="key ${key>=75||[30,32,45,47,59,61,72].includes(key)?'key-modifier':''} ${!equal(mapping,state.baseline.mappings[(state.layer-1)*84+key-1])?'changed':''}" data-key="${key}" style="--width:${widths[key]??1}" aria-pressed="${key===state.key}" aria-label="按键 ${key} ${escapeHTML(physical)}，当前 ${escapeHTML(summary(mapping))}"><span class="key-main">${escapeHTML(label)}</span>${d.codes.length!==1||d.codes[0]!==DEFAULT_CODES[key-1]?`<span class="key-physical">${escapeHTML(physical)}</span>`:''}</button>`;
  }).join('')}</div>`).join('');
}
function renderPalette(){
  const search=state.search.trim().toLowerCase();
  const aliases={1:'escape esc 退出',27:'backspace 退格',42:'caps lock 大写',54:'enter return 回车',55:'shift 左',66:'shift 右',67:'control ctrl 左',68:'command cmd win meta 左',69:'option alt 左',71:'option alt 右',72:'command cmd win meta 右',74:'control ctrl 右',111:'play pause 播放 暂停',112:'mute volume 静音 音量',113:'volume up 音量',114:'volume down 音量'};
  const basic=[...Array.from({length:26},(_,i)=>DEFAULT_CODES.find(code=>keyName(code)===String.fromCharCode(65+i))).filter(code=>code!==undefined),...Array.from({length:10},(_,i)=>i+15),25,26,39,40,41,52,53,14,63,64,65,1,27,28,42,54,70,84,82,85,83,86,87,88,89,90,...Array.from({length:12},(_,i)=>i+2)];
  const codes=search||state.category==='all'?Object.keys(KEY_NAMES).map(Number).filter(code=>code!==0):state.category==='basic'?basic:state.category==='modifier'?[67,68,69,55,74,72,71,66,156,166]:Array.from({length:18},(_,i)=>108+i);
  const results=codes.filter(code=>!search||`${keyName(code)} ${aliases[code]??''} ${code}`.toLowerCase().includes(search));
  $('#palette-title').textContent=search?'搜索结果':({basic:'基本字符',modifier:'修饰键与 Fn',media:'媒体及音频控制',all:'全部功能'}[state.category]);
  $('#palette').innerHTML=results.length?results.map(code=>`<button draggable="true" data-code="${code}" title="${escapeHTML(keyName(code))}" aria-label="选择功能 ${escapeHTML(keyName(code))}">${escapeHTML(shortName(code))}</button>`).join(''):'<span class="palette-empty">没有匹配的功能。</span>';
}
function renderEditor(){
  const d=state.definition;
  $('#selected-id').textContent=`KEY ${String(state.key).padStart(2,'0')} / LAYER ${state.layer}`;
  $('#selected-physical').textContent=shortName(DEFAULT_CODES[state.key-1]);
  $('#selected-current').textContent=summary(selected());
  $$('.editor-tabs button').forEach(button=>button.setAttribute('aria-selected',Number(button.dataset.kind)===(d.kind>=2?2:d.kind)));
  $('#sequence-label').textContent=d.kind>=2?'宏动作序列':'将此键设为';
  $('#combo').innerHTML=d.codes.length?d.codes.map((code,i)=>`<button class="code-chip" data-remove="${i}" aria-label="移除第 ${i+1} 个功能 ${escapeHTML(keyName(code))}">${escapeHTML(shortName(code))}<span>×</span></button>`).join(''):'<span>未分配 · 从上方选择功能</span>';
  $('#add-mode').textContent=d.kind>=2?'＋ 按顺序加入动作':state.append?'✓ 组合模式已开启':'＋ 组合多个键';
  $('#add-mode').setAttribute('aria-pressed',state.append);
  $('#add-mode').disabled=d.kind>=2;
  $('#timing').hidden=d.kind===0;$('#cycles-field').hidden=d.kind<2;
  $('#interval').min=d.kind===1?'1':'0';$('#interval').value=d.interval;$('#cycles').value=Math.max(1,d.cycles);
  $('#editor-note').textContent=d.kind>=2?'按顺序选择动作，可设置固定间隔和循环次数。编辑现有复杂宏会转换为固定间隔宏；未编辑的宏完整保留。':d.kind===1?'连发间隔使用原厂协议数值。此设备上的连发实际行为尚待验证。':'选择功能后点击应用。组合键可加入 ⌘、⌥、Shift 等修饰键。';
  renderPalette();
}
async function renderBackups(){
  state.backupItems=await backups();
  $('#view-backups').innerHTML=`<div class="section-actions"><button class="button button-primary" id="import-button">导入 JSON 配置 ↑</button><button class="button" id="backup-export">导出当前配置 ↓</button></div><div class="panel section-panel"><h2>本地备份</h2><p>读取后与写入前自动备份，保存在当前浏览器。原生 Mac 版的 JSON 备份也可以直接导入。下载到本机的文件可以长期保存。</p><p>备份属于当前网址和浏览器。更换网址、浏览器或清除站点数据后，需要导入已下载的备份。</p></div><div class="backup-list">${state.backupItems.length?state.backupItems.map(item=>`<article class="backup-item"><div><strong>${escapeHTML(item.label)} · mini84</strong><small>${escapeHTML(new Date(item.createdAt).toLocaleString('zh-CN'))} / 756 条按键定义</small></div><div><button class="button" data-backup-download="${escapeHTML(item.id)}">下载 ↓</button><button class="button" data-backup-restore="${escapeHTML(item.id)}">恢复到编辑器</button></div></article>`).join(''):'<div class="empty-state">暂无备份。读取键盘或写入前会自动保存。</div>'}</div>`;
}
function renderCounters(){
  const counts=state.snapshot.counters,total=counts.reduce((a,b)=>a+b,0),max=Math.max(1,...counts);
  $('#view-counters').innerHTML=`<div class="panel section-panel"><div class="eyebrow">KEYSTROKE COUNTER</div><div class="stat-summary">${total.toLocaleString('zh-CN')}</div><p>${state.mode==='demo'?'演示配置不包含真实按键计数。连接键盘后查看设备累计数据。':'键盘累计按键次数。重新读取键盘后刷新，不记录网页之外的输入内容。'}</p>${counts.map((count,i)=>({count,key:i+1})).sort((a,b)=>b.count-a.count).slice(0,20).map(item=>`<div class="counter-row"><span class="counter-key">${escapeHTML(shortName(DEFAULT_CODES[item.key-1]))} <small>#${item.key}</small></span><div class="counter-track"><span style="width:${item.count/max*100}%"></span></div><b>${item.count.toLocaleString('zh-CN')}</b></div>`).join('')}</div>`;
}
function renderCalibration(){
  const channel=state.channel,active=channel?.calibrationActive===true,released=state.calibrationReleaseDone;
  const groups=state.calibrationGroups,complete=groups===21;
  $('#view-calibration').innerHTML=`<div class="calibration-overview panel section-panel"><div><h2>校准步骤</h2><p>校准模式会暂停键盘输入。请使用鼠标操作，结束后恢复输入。</p><p>开始前自动备份键位配置。键位备份不包含电容采样值，无法撤销电容校准。</p></div><div class="calibration-overview-actions"><button class="button button-primary" id="cal-begin" ${state.busy||active||!channel||changed().length?'disabled':''}>进入校准模式</button><button class="button" id="cal-recover" ${state.busy||active||!channel?'disabled':''}>恢复键盘输入</button></div></div>
  ${!channel?'<p class="calibration-status">连接并读取 mini84 后可进行校准。演示模式不会发送校准指令。</p>':changed().length?'<p class="calibration-status">有未保存的改键，请先保存或撤销。</p>':''}
  <div class="calibration-steps"><article class="panel calibration-card ${active&&!released?'current':''}"><div class="calibration-step-label">01 <span>${released?'已完成':'释放状态'}</span></div><h3>释放校准</h3><p>松开全部按键，保持键盘不受按压，再点击采集。</p><p class="calibration-step-detail">采集过程中不要触碰键盘，等设备返回完成结果。</p><button class="button ${active&&!released?'button-primary':''}" id="cal-release" ${state.busy||!active||released?'disabled':''}>${released?'释放状态已采集':'采集释放状态'}</button></article>
  <article class="panel calibration-card ${released&&!complete?'current':''}"><div class="calibration-step-label">02 <span>${groups}/21 组</span></div><h3>按下校准</h3><p>${complete?'21 组采集已完成。请松开全部按键，再结束校准。':'把下方标出的按键全部按到底，并保持按住，再用鼠标点击采集。收到完成结果后再松开。'}</p><div class="calibration-group">${complete?'<span class="calibration-group-complete">分组采集已完成</span>':Array.from({length:4},(_,i)=>groups*4+i).map(i=>`<span title="物理按键 ${i+1}">${escapeHTML(shortName(DEFAULT_CODES[i]))}<small>#${i+1}</small></span>`).join('')}</div><p class="calibration-step-detail">${complete?'请检查每个按键能否正常输入。':`当前第 ${groups+1} 组，共 21 组。进度按分组记录，请按页面标出的键操作。`}</p><button class="button ${released&&!complete?'button-primary':''}" id="cal-press" ${state.busy||!active||!released||complete?'disabled':''}>采集第 ${Math.min(21,groups+1)} 组</button></article>
  <article class="panel calibration-card ${complete&&active?'current':''}"><div class="calibration-step-label">03 <span>恢复输入</span></div><h3>结束校准</h3><p>松开全部按键后，结束校准并恢复键盘输入。</p><p class="calibration-step-detail">结束后逐键检查输入。如果某些键仍异常，可重新校准。</p><button class="button ${complete&&active?'button-primary':''}" id="cal-finish" ${state.busy||!active||!complete?'disabled':''}>结束校准并恢复输入</button>${active&&!complete?`<button class="text-button" id="cal-stop" ${state.busy?'disabled':''}>提前结束并恢复输入</button>`:''}</article></div>
  <div class="calibration-progress panel"><span>${escapeHTML(state.calibrationMessage||(active?'校准模式已开启。':'未开始校准。'))}</span><small>若页面关闭或连接中断后键盘无法输入，重新连接后点击「恢复键盘输入」，或重新插拔 USB。</small></div>
  <p class="calibration-footnote">校准流程依据所附官方工具接入。当前版本尚未执行真实的电容采样验收。</p>`;
}
function renderParameters(){
  const snapshot=state.snapshot;
  $('#view-parameters').innerHTML=`<div class="panel section-panel"><h2>触发参数 <span class="tiny-badge">只读</span></h2><p>${state.mode==='demo'?'当前为演示数据。连接键盘后显示真实参数。':'已读取 84 组原始参数，每键 3 字节。字节单位尚未确认，不将其标成毫米或触发压力。'}</p><div class="parameter-grid">${Array.from({length:84},(_,i)=>`<div class="parameter-cell"><small>KEY ${i+1}</small><code>${snapshot.triggers.slice(i*3,i*3+3).map(n=>n.toString(16).toUpperCase().padStart(2,'0')).join(' ')}</code></div>`).join('')}</div></div><div class="panel section-panel"><h2>灯光与设备信息</h2><p>当前为 mini84EC(S) 非 RGB 型号。灯光区域的 252 字节数据随完整备份保留，目前不提供灯光写入。</p><p>${escapeHTML(snapshot.version)}</p><p>USB 0483:5235 · 84 键 · 9 层 · 756 条定义</p></div>`;
}
function renderHelp(){
  $('#view-help').innerHTML=`<div class="help-grid"><div class="panel section-panel help-card"><h3>01 / 连接与读取</h3><p>使用桌面版 Chrome 或 Edge 打开本页，用 USB 数据线连接 mini84。点击「连接键盘」，在浏览器授权窗口选择 mini84。关闭其他键盘配置工具。</p><p>当前适配 mini84EC(S) V2.3.3，USB 标识 0483:5235。其他型号、蓝牙和 2.4G 尚未适配。</p></div><div class="panel section-panel help-card"><h3>02 / 改键与组合键</h3><p>先选择配置层，再点击键帽。在右侧选择一个新功能，点击「应用此键」。开启组合模式后，可加入 Command / Win、Option / Alt 等修饰键。</p><p>页面上的修改会暂存在编辑器中，检查并确认写入后才会发送给键盘。关闭页面前请导出未写入的修改。</p><button class="text-button" id="record-shortcut">按下快捷键来录入 →</button></div><div class="panel section-panel help-card"><h3>03 / 写入与恢复</h3><p>写入前自动保存本地备份，并完整保留全部 9 层。写入后读取核对。写入期间请保持数据线连接。</p><p>如果写入中断，可能已有部分配置改变。重新读取键盘后，从「配置备份」恢复先前配置，再检查并写入。</p></div><div class="panel section-panel help-card"><h3>04 / 关于 QMK 与功能范围</h3><p>本工具借鉴 QMK / VIA 的可视化配置方式，通过 NiZ 原厂协议直接通信，使用原厂固件。它不是 QMK 固件，也不声明兼容 VIA 协议。</p><p>原生版和网页 WebHID 传输层均已完成实机原样回写，756 条定义读回一致。实际改键行为、宏播放和断电持久化仍待进一步测试。</p><p>静电容校准提供释放采样和按下分组采样。刷固件、触发参数修改与 RGB 控制尚未开放。</p></div><div class="panel section-panel help-card"><h3>05 / 数据留在你的浏览器</h3><p>键位、宏和按键计数都通过 USB 在浏览器与键盘之间传递，不上传到服务器。备份保存在当前浏览器，也可以下载为 JSON 文件。</p></div><div class="panel section-panel help-card"><h3>06 / 配置层编号</h3><p>读取确认设备共有 9 层。各层对应的用户配置组、左右 Fn 关系尚未完成实物核对，因此保留数字编号，不把未验证的层标成已确认的功能。</p><p>灯光与触发原始数据随完整备份保存；当前仅写入按键映射。</p></div></div>`;
}
async function showView(view){
  state.view=view;document.body.dataset.view=view;
  const titles={keymap:['自定义按键','自定义按键','选择键帽后编辑，或拖动功能到键盘。'],counters:['按键计数','按键计数','查看设备内保存的累计计数，重新读取后刷新。'],backups:['备份与恢复','备份与恢复','自动保存在浏览器，也可以导出到本机。'],calibration:['静电容校准','静电容校准','先采集释放状态，再按分组采集按下状态。'],parameters:['设备参数','设备参数','读取原厂参数，保留完整备份。当前仅提供查看。'],help:['使用帮助','使用帮助','连接、编辑、保存到键盘与恢复配置。']};
  $('#page-name').textContent=titles[view][0];$('#main-title').textContent=titles[view][1];$('#subtitle').textContent=titles[view][2];
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  ['keymap','counters','backups','calibration','parameters','help'].forEach(name=>$(`#view-${name}`).hidden=name!==view);
  if(view==='calibration')renderCalibration();if(view==='parameters')renderParameters();if(view==='counters')renderCounters();if(view==='help')renderHelp();if(view==='backups')await renderBackups();
}
function render(){renderBoard();loadSelection();renderControls();if(state.view==='counters')renderCounters();}
async function connect(){
  if(!('hid' in navigator))return showDialog('请在 Chrome 或 Edge 中连接','<p>当前浏览器不提供 WebHID。请使用桌面版 Chrome 或 Edge 打开此网页，即可通过 USB 配置 mini84。离线编辑、导入与导出仍可使用。</p>');
  if(changed().length)return showDialog('先保存页面中的修改？','<p>连接并读取键盘会替换当前编辑内容。请先导出配置，或选择继续读取。</p>',()=>{state.snapshot=structuredClone(state.baseline);connect();},'继续连接并读取');
  await run(async()=>{
    const [device]=await navigator.hid.requestDevice({filters:[{vendorId:MODEL.vendorId,productId:MODEL.productId,usagePage:MODEL.usagePage}]});
    if(!device){log('已取消连接，编辑内容保持不变。');return;}
    const channel=new NiZDevice(device);
    try{
      await channel.open();const snapshot=await channel.snapshot(progress);await saveBackup(snapshot,'读取键盘');
      state.channel=channel;state.snapshot=snapshot;state.baseline=structuredClone(snapshot);state.mode='live';state.calibrationGroups=0;state.calibrationReleaseDone=false;state.calibrationMessage='';render();log('读取完成 · 84 键 × 9 层 · 已自动备份');toast('键盘已连接，原始配置已备份。');
    }catch(error){await channel.close();throw error;}
  });
}
async function read(){
  if(changed().length)return showDialog('重新读取会替换当前编辑','<p>请先导出未写入的配置，或继续读取键盘当前状态。</p>',()=>{state.snapshot=structuredClone(state.baseline);read();},'继续读取');
  await run(async()=>{const snapshot=await state.channel.snapshot(progress);await saveBackup(snapshot,'读取键盘');state.snapshot=snapshot;state.baseline=structuredClone(snapshot);render();log('已重新读取完整配置并保存备份。');});
}
function importSnapshot(snapshot){
  assert(snapshot.version===state.baseline.version,'配置固件版本与当前编辑的配置不同，请选择相同版本的备份。');
  if(state.channel)state.snapshot={...state.snapshot,mappings:structuredClone(snapshot.mappings)};
  else {state.snapshot=structuredClone(snapshot);state.baseline=structuredClone(snapshot);state.mode='offline';}
  render();showView('keymap');log(`已导入 ${changed().length} 项键位差异，尚未写入键盘。`);toast('已恢复到编辑器，检查后才会写入。');
}
function review(){
  const changes=changed();
  if(!state.channel||!changes.length)return;
  const body=`<p>将完整写入全部 9 层，保留其他键位与宏。写入前自动备份，完成后读取核对。</p>${changes.map(m=>{const p=m.packets[0];return `<div class="review-row"><small>层 ${p[2]} / 键 ${p[3]}</small><span>${escapeHTML(summary(state.baseline.mappings[(p[2]-1)*84+p[3]-1]))}</span><span>→</span><b>${escapeHTML(summary(m))}</b></div>`;}).join('')}<p class="review-note">写入期间请保持 USB 连接。如果中断，请重新读取设备并从备份恢复。</p>`;
  showDialog(`检查 ${changes.length} 项修改`,body,()=>run(async()=>{
    const after=await state.channel.write(state.snapshot,state.baseline,saveBackup,progress);
    state.snapshot=after;state.baseline=structuredClone(after);render();log('写入完成 · 全部 756 条定义读回核对通过');toast('已写入键盘，全部定义核对通过。');
  }),'备份并写入键盘');
}
function recordShortcut(){
  let captured=null;
  showDialog('按下一个快捷键','<p>在下方区域按下快捷键，例如 ⌘ + C。系统保留的快捷键请从功能列表选择。</p><div class="combo" id="shortcut-capture" tabindex="0">等待按键…</div>',()=>{state.definition=captured;state.append=captured.codes.length>1;showView('keymap');renderEditor();},'使用这个快捷键');
  $('#modal-confirm').disabled=true;
  const capture=$('#shortcut-capture');capture.focus();
  const codes={Escape:1,Backquote:14,Minus:25,Equal:26,Backspace:27,Tab:28,BracketLeft:39,BracketRight:40,Backslash:41,CapsLock:42,Semicolon:52,Quote:53,Enter:54,Comma:63,Period:64,Slash:65,Space:70,Insert:81,Home:82,PageUp:83,Delete:84,End:85,PageDown:86,ArrowUp:87,ArrowLeft:88,ArrowDown:89,ArrowRight:90};
  Array.from({length:12},(_,i)=>codes[`F${i+1}`]=i+2);
  DEFAULT_CODES.forEach(code=>{if(/^[A-Z]$/.test(keyName(code)))codes[`Key${keyName(code)}`]=code;if(/^\d$/.test(keyName(code)))codes[`Digit${keyName(code)}`]=code;});
  capture.onkeydown=event=>{
    event.preventDefault();event.stopPropagation();if(event.repeat||codes[event.code]===undefined)return;
    const combination=[...(event.ctrlKey?[67]:[]),...(event.metaKey?[68]:[]),...(event.altKey?[69]:[]),...(event.shiftKey?[55]:[]),codes[event.code]];
    captured={kind:0,codes:combination,interval:30,cycles:1};$('#modal-confirm').disabled=false;capture.textContent=combination.map(keyName).join(' + ');
  };
}
$('#record-current').onclick=recordShortcut;
$('#device-connect').onclick=()=>state.channel?toast('mini84 已连接。'):connect();
$$('[data-rail]').forEach(button=>button.onclick=()=>showView(button.dataset.rail));
$('#macro-nav').onclick=()=>{showView('keymap');state.definition.kind=2;renderEditor();$('.editor').scrollIntoView({behavior:'smooth',block:'start'});};
$('#palette').ondragstart=event=>{const button=event.target.closest('[data-code]');if(!button)return;event.dataTransfer.setData('application/x-niz-code',button.dataset.code);event.dataTransfer.effectAllowed='copy';};
$('#keyboard').ondragover=event=>{if(!event.dataTransfer.types.includes('application/x-niz-code'))return;const button=event.target.closest('[data-key]');if(button){event.preventDefault();event.dataTransfer.dropEffect='copy';button.classList.add('drag-over');}};
$('#keyboard').ondragleave=event=>event.target.closest('[data-key]')?.classList.remove('drag-over');
$('#keyboard').ondrop=event=>{const button=event.target.closest('[data-key]');if(!button)return;event.preventDefault();const code=Number(event.dataTransfer.getData('application/x-niz-code'));if(!Object.hasOwn(KEY_NAMES,code))return;state.key=Number(button.dataset.key);state.snapshot.mappings[(state.layer-1)*84+state.key-1]=encode(state.layer,state.key,{kind:0,codes:[code]});render();toast('已更新页面键位，保存到键盘后生效。');};
$('#keyboard').oncontextmenu=event=>{const button=event.target.closest('[data-key]');if(!button)return;event.preventDefault();const key=Number(button.dataset.key),index=(state.layer-1)*84+key-1;showDialog('撤销这个键的修改？',`<p>将按键 ${key} 恢复为上次读取的功能：${escapeHTML(summary(state.baseline.mappings[index]))}。</p>`,()=>{state.snapshot.mappings[index]=structuredClone(state.baseline.mappings[index]);render();},'撤销此键');};
$('#connect').onclick=connect;
$('#notice-action').onclick=()=>state.channel?download(state.snapshot):connect();
$('#disconnect').onclick=()=>run(async()=>{await state.channel.close();state.channel=null;state.mode='offline';renderControls();log('已断开设备；页面中的配置仍可导出。');});
$('#read').onclick=read;
$('#layers').onclick=event=>{const button=event.target.closest('[data-layer]');if(!button)return;state.layer=Number(button.dataset.layer);render();};
$('#keyboard').onclick=event=>{const button=event.target.closest('[data-key]');if(!button)return;state.key=Number(button.dataset.key);renderBoard();loadSelection();};
$('#palette').onclick=event=>{const button=event.target.closest('[data-code]');if(!button)return;const code=Number(button.dataset.code);state.definition.codes=state.append||state.definition.kind>=2?[...state.definition.codes,code]:[code];renderEditor();};
$('#combo').onclick=event=>{const button=event.target.closest('[data-remove]');if(button){state.definition.codes=state.definition.codes.filter((_,i)=>i!==Number(button.dataset.remove));renderEditor();}};
$('#function-search').oninput=event=>{state.search=event.target.value;renderPalette();};
$$('[data-category]').forEach(button=>button.onclick=()=>{state.category=button.dataset.category;$$('[data-category]').forEach(b=>b.classList.toggle('active',b===button));renderPalette();});
$$('[data-kind]').forEach(button=>button.onclick=()=>{state.definition.kind=Number(button.dataset.kind);if(state.definition.kind===1&&state.definition.interval<1)state.definition.interval=30;renderEditor();});
$('#add-mode').onclick=()=>{state.append=!state.append;renderEditor();};
$('#clear-codes').onclick=()=>{state.definition.codes=[];renderEditor();};
$('#interval').onchange=event=>state.definition.interval=Number(event.target.value);
$('#cycles').onchange=event=>state.definition.cycles=Number(event.target.value);
$('#apply-key').onclick=()=>{
  const result=(()=>{try{return encode(state.layer,state.key,{...state.definition,kind:Math.min(state.definition.kind,2)});}catch(error){showDialog('无法应用此键',`<p>${escapeHTML(error.message)}</p>`);return null;}})();
  if(!result)return;state.snapshot.mappings[(state.layer-1)*84+state.key-1]=result;renderBoard();renderControls();$('#selected-current').textContent=summary(selected());toast('已应用到页面，尚未写入键盘。');
};
$('#revert-key').onclick=()=>{const index=(state.layer-1)*84+state.key-1;state.snapshot.mappings[index]=structuredClone(state.baseline.mappings[index]);render();toast('已撤销这个键的修改。');};
$('#undo-all').onclick=()=>showDialog('撤销全部修改？','<p>页面将恢复为上次读取或加载的配置，键盘内的配置不会改变。</p>',()=>{state.snapshot=structuredClone(state.baseline);render();toast('已撤销全部修改。');},'撤销全部');
$('#export').onclick=()=>{download(state.snapshot,state.mode==='demo'?'NiZ-demo':'NiZ-mini84');toast('配置已导出。');};
$('#review').onclick=review;
$('#layer-help').onclick=()=>showDialog('配置层 1–9','<p>这把 mini84 的原厂固件返回 9 层、756 条按键定义。各层与用户配置组、左右 Fn 的对应关系还在核对，因此目前保留原始编号。</p><p>每次写入都完整保留 9 层；编辑当前层不会自动复制到其他层。</p>');
$$('.nav-item[data-view]').forEach(button=>button.onclick=()=>showView(button.dataset.view).catch(error=>showDialog('无法打开此页',`<p>${escapeHTML(error.message)}</p>`)));
$('#view-backups').onclick=event=>{
  if(event.target.closest('#import-button'))$('#import-file').click();
  if(event.target.closest('#backup-export'))download(state.snapshot);
  const button=event.target.closest('[data-backup-download],[data-backup-restore]');if(!button)return;
  const item=state.backupItems.find(item=>item.id===(button.dataset.backupDownload??button.dataset.backupRestore));
  if(button.dataset.backupDownload)return download(item.snapshot);
  showDialog('将这份备份恢复到编辑器？','<p>这会替换页面中的按键编辑，尚未向键盘写入。请先导出你需要保留的修改。</p>',()=>importSnapshot(validateSnapshot(item.snapshot)),'恢复到编辑器');
};
$('#view-calibration').onclick=event=>{
  if(event.target.closest('#cal-begin'))showDialog('进入校准模式？','<p>将暂停键盘输入。请使用鼠标完成释放采样和 21 组按下采样，结束后恢复输入。</p><p>校准会更新设备的电容采样值。开始前保存的键位备份不包含这些采样值。</p>',()=>run(async()=>{
    const snapshot=await state.channel.beginCalibration(saveBackup,progress);
    state.snapshot=snapshot;state.baseline=structuredClone(snapshot);state.calibrationGroups=0;state.calibrationReleaseDone=false;state.calibrationMessage='校准模式已开启。松开全部按键，然后采集释放状态。';log(state.calibrationMessage);
  }),'进入校准模式');
  if(event.target.closest('#cal-release'))run(async()=>{
    progress('释放状态采集中，请勿按键',0.2);await state.channel.calibrate('release');state.calibrationReleaseDone=true;state.calibrationMessage='释放状态采集完成。请按住第 1 组的 4 个按键。';log(state.calibrationMessage);
  });
  if(event.target.closest('#cal-press'))run(async()=>{
    progress(`第 ${state.calibrationGroups+1} 组采集中，请保持按住`,(state.calibrationGroups+1)/21);
    await state.channel.calibrate('press');state.calibrationGroups+=1;state.calibrationMessage=`第 ${state.calibrationGroups} 组采集完成，可以松开这些按键。`;log(state.calibrationMessage);
  });
  if(event.target.closest('#cal-finish')||event.target.closest('#cal-stop'))showDialog('结束校准？',`<p>已采集 ${state.calibrationGroups}/21 组。请先松开所有按键，再恢复键盘输入。</p>`,()=>run(async()=>{
    await state.channel.endCalibration();state.calibrationMessage=`校准已结束，本次采集 ${state.calibrationGroups}/21 组。已发送恢复输入指令，请逐键检查。`;log(state.calibrationMessage);
  }),'松开按键并恢复输入');
  if(event.target.closest('#cal-recover'))run(async()=>{await state.channel.endCalibration();state.calibrationMessage='已发送恢复键盘输入指令。';log(state.calibrationMessage);});
};
$('#view-help').onclick=event=>{if(event.target.closest('#record-shortcut'))recordShortcut();};
$('#import-file').onchange=()=>run(async()=>{
  const file=$('#import-file').files[0];if(!file)return;
  assert(file.size<=4*1024*1024,'配置文件超过 4MB，请选择有效的备份文件。');
  const snapshot=validateSnapshot(JSON.parse(await file.text()));
  showDialog('导入这份配置？','<p>将替换页面中的按键编辑。不会立即写入键盘，灯光和触发参数保持当前值。请先导出你需要保留的修改。</p>',()=>importSnapshot(snapshot),'导入到编辑器');
  $('#import-file').value='';
});
$('#show-log').onclick=()=>showDialog('本次操作日志',state.logs.length?state.logs.map(item=>`<div class="log-line"><span class="log-time">${escapeHTML(item.time)}</span>${escapeHTML(item.text)}</div>`).join(''):'<p>还没有操作。键盘数据仅在当前浏览器处理。</p>');
$('#modal-close').onclick=closeDialog;$('#modal-cancel').onclick=closeDialog;
$('#modal-confirm').onclick=()=>{const action=modalAction;closeDialog();Promise.resolve().then(()=>action?.()).catch(error=>showDialog('操作未完成',`<p>${escapeHTML(error.message)}</p>`));};
$('#modal').addEventListener('cancel',()=>modalAction=null);
window.addEventListener('beforeunload',event=>{if(changed().length||state.busy||state.channel?.calibrationActive){event.preventDefault();event.returnValue='';}});
if('hid' in navigator)navigator.hid.addEventListener('disconnect',event=>{
  if(state.channel?.device!==event.device)return;
  state.channel.close().catch(()=>{});state.channel=null;state.mode='offline';renderControls();log('USB 连接已断开。请重新连接、读取后检查；页面中的修改仍可导出。');
});
window.addEventListener('pagehide',()=>{if(state.channel?.calibrationActive)state.channel.close().catch(()=>{});});
render();log('未连接键盘。可使用离线演示。');
