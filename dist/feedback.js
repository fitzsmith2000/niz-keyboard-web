let draft={kind:'问题反馈',title:'',steps:'',expected:'',actual:'',contact:''},files=[];
export function renderFeedback(state,escapeHTML){
 const root=document.querySelector('#feedback-form');
 root.innerHTML=`<div class="feedback-heading"><h2>反馈与建议</h2><p>先描述问题，再附上能帮助复现的截图或日志。也可以提交功能建议。</p></div><form id="feedback-fields"><div class="feedback-grid"><label>反馈类型<select name="kind">${['问题反馈','功能建议','说明纠错'].map(t=>`<option ${draft.kind===t?'selected':''}>${t}</option>`).join('')}</select></label><label>标题<input name="title" required maxlength="100" placeholder="例如：停止监测后，行程柱仍保持高亮" value="${escapeHTML(draft.title)}"></label></div><label>操作步骤<textarea name="steps" required maxlength="2000" placeholder="1. 打开哪个页面？&#10;2. 点击什么或按下什么键？&#10;3. 何时出现问题？是否每次都出现？">${escapeHTML(draft.steps)}</textarea></label><div class="feedback-grid"><label>预期结果<textarea name="expected" required maxlength="1000" placeholder="你希望发生什么？">${escapeHTML(draft.expected)}</textarea></label><label>实际结果<textarea name="actual" required maxlength="2000" placeholder="实际发生了什么？如有报错，请复制完整文字。">${escapeHTML(draft.actual)}</textarea></label></div><label>联系方式（选填）<input name="contact" maxlength="150" placeholder="用于后续沟通；公开 Issue 中请避免填写私人联系方式" value="${escapeHTML(draft.contact)}"></label><div class="feedback-attachments"><label>附件<input id="feedback-files" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,text/plain,.log,.json,application/pdf"></label><small>截图、TXT / LOG / JSON 或 PDF；最多 5 个，总计不超过 12 MB。请遮挡邮箱、序列号和私人内容，不要附带完整键盘配置，除非复现确实需要。</small><ul id="feedback-file-list"></ul></div><details><summary>将包含哪些环境信息？</summary><p>网页版本 0.9.0、浏览器标识、连接状态和固件字符串。不自动收集按键记录、键位配置、本地备份或操作日志。</p></details><div class="feedback-actions"><button class="button" type="submit" value="preview">预览反馈</button><button class="button" type="submit" value="download">下载反馈与附件包</button><button class="button" type="submit" value="email">通过邮件反馈</button><button class="button button-primary" type="submit" value="github">创建 GitHub Issue</button></div><p class="feedback-note">邮件发往 fitzsmith112@gmail.com。按钮会打开默认邮件应用；GitHub 会打开预填 Issue，需登录后提交。附件仅在本机处理：先下载附件包，再手动附到邮件或拖入 GitHub 编辑框。此网页不会自动发送反馈或上传附件。草稿仅保留在当前页面，刷新或关闭前请下载留存。</p><p id="feedback-status" role="status"></p><pre id="feedback-preview" hidden></pre></form>`;
 const form=root.querySelector('form'),status=root.querySelector('#feedback-status');
 const paintFiles=()=>{root.querySelector('#feedback-file-list').innerHTML=files.map((f,i)=>`<li>${escapeHTML(f.name)} · ${(f.size/1024).toFixed(0)} KB <button type="button" class="text-button" data-remove-file="${i}" aria-label="移除 ${escapeHTML(f.name)}">移除</button></li>`).join('');};paintFiles();
 form.oninput=()=>{draft=Object.fromEntries(new FormData(form));};
 root.querySelector('#feedback-files').onchange=event=>{
  const selected=Array.from(event.target.files);
  if(selected.some(f=>!/[.](png|jpe?g|webp|gif|txt|log|json|pdf)$/i.test(f.name))||selected.length>5||selected.reduce((sum,f)=>sum+f.size,0)>12*1024*1024){status.textContent='附件未加入：请选择允许的格式，最多 5 个且总计不超过 12 MB。';event.target.value='';return;}
  files=selected;paintFiles();status.textContent='附件已选入本机反馈草稿，尚未上传。';
 };
 root.onclick=event=>{const button=event.target.closest('[data-remove-file]');if(button){files.splice(Number(button.dataset.removeFile),1);paintFiles();}};
 form.onsubmit=async event=>{
  event.preventDefault();
  if(['title','steps','expected','actual'].some(key=>!draft[key].trim())){status.textContent='请填写标题、操作步骤、预期结果和实际结果，内容不能只有空格。';return;}
  const body=`## ${draft.kind}\n${draft.title}\n\n### 操作步骤\n${draft.steps}\n\n### 预期结果\n${draft.expected}\n\n### 实际结果\n${draft.actual}\n\n### 联系方式\n${draft.contact||'未提供'}\n\n### 环境\nNiZ Web 0.9.0\n${state.channel?'USB 已连接':'未连接（离线参考）'}\n固件：${state.snapshot.version}\n浏览器：${navigator.userAgent}\n\n### 附件\n${files.map(f=>f.name).join('\n')||'无'}\n`;
  const action=event.submitter.value;
  if(action==='preview'){root.querySelector('#feedback-preview').hidden=false;root.querySelector('#feedback-preview').textContent=body;return;}
  if(action==='download'){
   const records=[new File([body],'feedback.md',{type:'text/markdown'}),...files],chunks=[],central=[];let offset=0;
   for(const [index,file] of records.entries()){
    const name=new TextEncoder().encode(index?`attachments/${index}-${file.name.replace(/[\\/]/g,'_')}`:'feedback.md'),data=new Uint8Array(await file.arrayBuffer());let crc=0xffffffff;
    data.forEach(byte=>{crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);});crc=(crc^0xffffffff)>>>0;
    const local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);local.set(name,30);
    const c=new Uint8Array(46+name.length),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);c.set(name,46);central.push(c);chunks.push(local,data);offset+=local.length+data.length;
   }
   const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,records.length,true);v.setUint16(10,records.length,true);v.setUint32(12,central.reduce((n,c)=>n+c.length,0),true);v.setUint32(16,offset,true);
   const url=URL.createObjectURL(new Blob([...chunks,...central,end],{type:'application/zip'})),link=document.createElement('a');link.href=url;link.download='niz-feedback.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='已生成本机反馈包；请将它附到邮件或 GitHub Issue。';return;
  }
  const outgoing=encodeURIComponent(body).length>6000?'完整反馈较长，请附上下载的反馈包（内含 feedback.md 和所选附件）。':body;
  const reminder=outgoing===body?'':'内容较长，请先下载完整反馈包并附上。';
  if(action==='email'){window.location.href=`mailto:fitzsmith112@gmail.com?subject=${encodeURIComponent('[NiZ Web] '+draft.title)}&body=${encodeURIComponent(outgoing)}`;status.textContent=reminder+'已请求打开邮件应用；请添加附件包并确认发送。';}
  if(action==='github'){window.open(`https://github.com/fitzsmith2000/niz-keyboard-web/issues/new?title=${encodeURIComponent(draft.title)}&body=${encodeURIComponent(outgoing)}`,'_blank','noopener,noreferrer');status.textContent=reminder+'已请求打开 GitHub；请核对内容、添加附件后提交。';}
 };
}
