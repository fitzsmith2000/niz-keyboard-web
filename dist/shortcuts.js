const entries=[
 ['system','Win / Mac 模式','Fn + 左 Alt','按住 3 秒',['同时按住 Fn 和左 Alt（Win/Mac），保持 3 秒。','Win/Mac 指示灯亮表示 Mac 模式，熄灭表示 Windows 模式；断电记忆。','Mac 模式下，按键布局按说明书的 Command / Option 标识使用；PrtSc 位置的苹果 fn 为 macOS 专用 fn。']],
 ['profile','切换键盘模式','Fn + Delete（M）','短按',['Delete 键下方标注 M。按住 Fn，再短按该键，循环切换 Office、Program1、Program2、Program3。','指示灯闪 1 / 2 / 3 次分别代表三个可编程模式，常亮 3 秒代表回到 Office；断电记忆。','说明书的四种模式与网页读取的 9 个原始配置层不是同一套编号，不能直接逐项对应。']],
 ['swap','交换 Ctrl / Caps Lock','Fn + 左 Ctrl','按住 3 秒',['同时按住 Fn 和左 Ctrl，保持 3 秒，在左 Ctrl 与 Caps Lock 互换、恢复正常之间切换。','状态灯闪 2 次表示互换，闪 1 次表示恢复；断电记忆。']],
 ['backslash','交换反斜杠 / Backspace','Fn + \\','按住 3 秒',['同时按住 Fn 和反斜杠键，保持 3 秒。','状态灯闪 2 次表示反斜杠与 Backspace 互换，闪 1 次表示恢复；断电记忆。']],
 ['polling','USB 回报率','Fn + R','按住 3 秒',['按住 Fn 和 R 3 秒，循环切换回报率。','状态灯闪 1 / 2 / 3 / 4 次分别表示 1 / 2 / 4 / 8 kHz；说明书标注默认 8 kHz，断电记忆。','仅 USB 模式有效。说明书给出的是可选档位，网页当前未读取或确认你正在使用的档位。']],
 ['media','音量与媒体','Fn + F1–F6','按住 Fn 后短按',['Fn + F1 静音；Fn + F2 减小音量；Fn + F3 增大音量。','Fn + F4 上一曲；Fn + F5 播放 / 暂停；Fn + F6 下一曲。','对应原厂默认布局；如果相关按键已被改写，应以当前映射和系统媒体支持为准。']],
 ['mouse','鼠标移动与点击','Fn + S / F / E / D','按住 Fn',['原厂键帽标识：S 向左、F 向右、E 向上、D 向下移动鼠标。','Fn + Z / X / C 分别为鼠标左键 / 中键 / 右键；Fn + V / G 为滚轮下滚 / 上滚。','移动键在 500 ms 内松开为点动，超过 500 ms 后连动；Fn + 左 Shift + 移动键为加速连动。适用于原厂默认鼠标键映射。']],
 ['interface','USB / PS/2 识别','Fn + Backspace','按住 5 秒',['同时按住 Fn 和 Backspace，保持 5 秒。','状态灯闪 1 次为 USB；闪 2 次为 PS/2 自动识别加 USB 手动识别。','关机断电、重启电脑后，需要重新插拔 USB 接口。切换接口识别可能使网页连接中断。']],
 ['reset','恢复出厂设置','Esc + 左 Ctrl + Delete + →','按住 5 秒',['同时按住键盘四角的 Esc、左 Ctrl、Delete、右方向键，保持 5 秒。','此操作会恢复出厂设置并改变已保存的键位配置。操作前请先导出备份。','说明书标注恢复后 Office / Program1 / Program2 / Program3 四种模式的键值相同。此页面仅提供说明，不会执行重置。']]
];
export function renderShortcuts(state,escapeHTML){
 const root=document.querySelector('#view-shortcuts');
 const matched=state.channel&&/^mini84EC\(S\);V2\.3\.3;V1\.0;?$/.test(state.snapshot.version);
 const status=matched?'当前设备适用 · mini84v6pro 有线版 / V2.3.3':state.channel?'固件未匹配 · 以下为有线版说明书参考':'离线参考 · 连接后核对当前固件';
 const show=id=>{
  const item=entries.find(entry=>entry[0]===id);
  root.innerHTML=`<div class="shortcut-status">${escapeHTML(status)}</div>${item?`<button class="text-button" id="shortcut-back">返回组合键</button><article class="panel section-panel shortcut-detail"><small>${escapeHTML(item[3])}</small><h2>${escapeHTML(item[1])}</h2><div class="shortcut-keys">${escapeHTML(item[2])}</div>${item[4].map(p=>`<p>${escapeHTML(p)}</p>`).join('')}<small>依据：mini84（84PRO V6）有线版功能说明，2025.09.18，第 1–2 页。组合键需在实体键盘上操作。</small></article>`:`<div class="shortcut-list">${entries.map(entry=>`<button class="shortcut-row" data-shortcut="${entry[0]}"><span><strong>${escapeHTML(entry[1])}</strong><small>${escapeHTML(entry[3])}</small></span><span class="shortcut-keys">${escapeHTML(entry[2])}</span><span aria-hidden="true">›</span></button>`).join('')}</div><p class="calibration-footnote">依据 mini84（84PRO V6）有线版说明书（2025.09.18）。仅为有线标准版整理；蓝牙、RGB、其他固件的适用性未确认。固件匹配表示说明书适用，不表示网页已读取每项开关状态。</p>`}`;
 };
 root.onclick=event=>{const row=event.target.closest('[data-shortcut]');if(row)show(row.dataset.shortcut);if(event.target.closest('#shortcut-back'))show(null);};show(null);
}
