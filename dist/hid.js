import {MODEL,assert,command,parseReports,parseBlob,equal} from './protocol.js';
const pause = ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class NiZDevice {
  constructor(device) {
    assert(device.vendorId===MODEL.vendorId&&device.productId===MODEL.productId&&device.collections.some(c=>c.usagePage===MODEL.usagePage&&c.outputReports.some(r=>r.reportId===0&&r.items.reduce((bits,item)=>bits+item.reportSize*item.reportCount,0)===512)), '所选设备没有受支持的 mini84 配置接口。');
    this.device=device;
    this.pending=null;
    this.input=event=>{
      if(!this.pending) return;
      const p=Array.from(new Uint8Array(event.data.buffer,event.data.byteOffset,event.data.byteLength));
      const job=this.pending;
      if(p.length!==64) return job.reject(new Error('设备返回了长度异常的报告。'));
      if(job.end!==null&&(p[0]===job.end||(p[0]===0&&p[1]===job.end))) return job.resolve(job.packets);
      job.packets.push(p);
      if(job.packets.length>8192) return job.reject(new Error('设备返回的数据超过支持容量。'));
      if(job.end===null&&p[0]===0&&p[1]===job.op) job.resolve(job.packets);
    };
    device.addEventListener('inputreport',this.input);
  }
  async open() { if(!this.device.opened) await this.device.open(); }
  async close() {
    this.pending?.reject(new Error('设备连接已关闭。'));
    this.device.removeEventListener('inputreport',this.input);
    if(this.device.opened) await this.device.close();
  }
  async query(op,end=null) {
    await pause(80); // Confirmed mini84 needs a pause after each stream terminator.
    assert(!this.pending,'另一项读取正在进行中。');
    let timer;
    const result=new Promise((resolve,reject)=>{
      this.pending={op,end,packets:[],resolve,reject};
      timer=setTimeout(()=>reject(new Error('键盘响应超时。请关闭其他配置工具，检查数据线后重试。')),12000);
    });
    // Attach a rejection handler before sendReport so a USB failure cannot leave an unhandled receiver.
    const sending=this.device.sendReport(0,new Uint8Array(command(op))).catch(error=>this.pending?.reject(error));
    try { const packets=await result; await sending; return packets; }
    finally { clearTimeout(timer); this.pending=null; }
  }
  async snapshot(progress=()=>{}) {
    progress('识别键盘',0.03);
    const versionBytes=(await this.query(0xf9))[0].slice(2);
    const end=versionBytes.indexOf(0);
    const version=new TextDecoder().decode(new Uint8Array(end===-1?versionBytes:versionBytes.slice(0,end)));
    assert(version.startsWith(MODEL.versionPrefix),`已连接 ${version}，该型号或固件尚未适配。`);
    progress('读取全部键位',0.15);
    const mappings=parseReports(await this.query(0xf2,0xf6));
    progress('读取灯光备份',0.6);
    const lights=parseBlob(await this.query(0xe2,0xe6),0xe0,252);
    progress('读取触发参数',0.75);
    const triggers=parseBlob(await this.query(0xd3,0xd1),0xd4,252);
    progress('读取按键计数',0.9);
    const bytes=parseBlob(await this.query(0xe3,0xe6),0xe3,336);
    const data=new DataView(new Uint8Array(bytes).buffer);
    return {schema:1,capturedAt:new Date().toISOString(),vendorID:MODEL.vendorId,productID:MODEL.productId,locationID:0,version,mappings,lights,triggers,counters:Array.from({length:84},(_,i)=>data.getUint32(i*4,true))};
  }
  async write(target,baseline,saveBackup,progress=()=>{}) {
    let began=false;
    try {
      const current=await this.snapshot((phase,ratio)=>progress(`写入前检查 · ${phase}`,ratio*0.3));
      assert(current.version===baseline.version&&equal(current.mappings,baseline.mappings),'键盘配置已变化，请重新读取后再编辑。');
      await saveBackup(current,'写入前');
      const reports=target.mappings.flatMap(m=>m.packets);
      progress('正在写入',0.32);
      await this.device.sendReport(0,new Uint8Array(command(0xf1))); began=true;
      for(let i=0;i<reports.length;i++) {
        await this.device.sendReport(0,new Uint8Array(reports[i]));
        if(i%20===0) progress(`正在写入 · ${i+1}/${reports.length}`,0.32+0.38*(i+1)/reports.length);
        await pause(3);
      }
      await this.device.sendReport(0,new Uint8Array([0,...Array(63).fill(0xf6)]));
      await pause(600);
      const after=await this.snapshot((phase,ratio)=>progress(`读回核对 · ${phase}`,0.72+ratio*0.27));
      assert(equal(after.mappings,target.mappings)&&equal(after.triggers,current.triggers)&&equal(after.lights,current.lights),'读回配置与预期不一致，请重新读取并检查；写入前备份已保存。');
      return after;
    } catch(error) {
      if(began) throw new Error(`写入未完成或核对未通过，键盘可能已更新部分配置。写入前备份已保存在「备份」中。${error.message}`,{cause:error});
      throw error;
    }
  }
}
