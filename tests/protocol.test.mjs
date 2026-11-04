import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {command,encode,decode,parseReports,validateSnapshot,demoSnapshot,equal,parseBlob,MODEL} from '../dist/protocol.js';
import {NiZDevice} from '../dist/hid.js';

test('756 records across nine layers and native JSON fixture are accepted',async()=>{
  assert.equal(validateSnapshot(demoSnapshot()).mappings.length,756);
  if(process.env.NIZ_NATIVE_FIXTURE){const fixture=validateSnapshot(JSON.parse(await readFile(process.env.NIZ_NATIVE_FIXTURE,'utf8')));assert.equal(fixture.mappings.length,756);assert.deepEqual(fixture.mappings[0].packets[0].slice(0,7),[0,0xf0,1,1,0,1,1]);}
});
test('encoding matches independently recovered NiZ byte offsets',()=>{
  assert.deepEqual(encode(1,47,{kind:0,codes:[68,58]}).packets[0].slice(0,8),[0,0xf0,1,47,0,2,68,58]);
  assert.deepEqual(encode(9,84,{kind:1,codes:[43],interval:0x1234}).packets[0].slice(0,9),[0,0xf0,9,84,1,0x12,0x34,1,43]);
  const macro=encode(2,7,{kind:2,codes:Array(110).fill(43),cycles:2,interval:100});
  assert.equal(macro.packets.length,3);assert.deepEqual(macro.packets[0].slice(0,11),[0,0xf0,2,7,2,2,0,0,100,0,110]);assert.equal(decode(macro).codes.length,110);
});
test('one edit preserves the other 755 records exactly',()=>{
  const before=demoSnapshot(),after=structuredClone(before);after.mappings[46]=encode(1,47,{kind:0,codes:[1]});
  assert.equal(after.mappings.filter((m,i)=>!equal(m,before.mappings[i])).length,1);assert.deepEqual(validateSnapshot(after),after);
});
test('rejects incomplete, duplicate, malformed and unsupported inputs at import',()=>{
  const p=demoSnapshot().mappings.flatMap(m=>m.packets);
  assert.throws(()=>parseReports(p.slice(1)),/全部 9 层/);
  const duplicate=structuredClone(p);duplicate[1]=duplicate[0];assert.throws(()=>parseReports(duplicate),/缺少按键|重复/);
  const short=structuredClone(p);short[0]=[0];assert.throws(()=>parseReports(short),/64 字节/);
  const badHeader=structuredClone(p);badHeader[0][2]=10;assert.throws(()=>parseReports(badHeader),/不支持/);
  const badModel=demoSnapshot();badModel.productID=0x1234;assert.throws(()=>validateSnapshot(badModel),/不属于/);
  const badTrigger=demoSnapshot();badTrigger.triggers=[];assert.throws(()=>validateSnapshot(badTrigger),/触发/);
  assert.throws(()=>validateSnapshot(null),/有效/);
});
test('macro split headers and custom delays are checked while opaque bytes are preserved',()=>{
  const profile=demoSnapshot(),macro=encode(1,1,{kind:2,codes:Array(60).fill(43),cycles:1,interval:20});profile.mappings[0]=macro;
  assert.deepEqual(validateSnapshot(profile).mappings[0],macro);
  macro.packets[1][3]=2;assert.throws(()=>validateSnapshot(profile),/宏分包/);
  const custom=encode(1,1,{kind:2,codes:[43,200,0,100,44],cycles:1,interval:0});custom.packets[0][6]=1;profile.mappings[0]=custom;
  assert.deepEqual(decode(validateSnapshot(profile).mappings[0]).codes,[43,44]);assert.deepEqual(decode(custom).delays,[100]);
  custom.packets[0][12]=199;assert.throws(()=>validateSnapshot(profile),/逐步延时/);
});
test('invalid editor values do not create device commands',()=>{
  assert.throws(()=>encode(1,1,{kind:0,codes:Array(59).fill(1)}),/容量/);
  assert.throws(()=>encode(1,1,{kind:2,codes:[],cycles:1,interval:1}),/序列为空/);
  assert.throws(()=>encode(1,1,{kind:2,codes:[1],cycles:256,interval:1}),/循环次数/);
  assert.throws(()=>encode(1,1,{kind:1,codes:[1],interval:0}),/间隔/);
  assert.throws(()=>command(0xf0,Array(63).fill(0)),/无效/);
  assert.throws(()=>parseBlob([command(0xd4,[62])],0xd4,252),/无效/);
});
class FakeHID extends EventTarget {
  constructor(profile=demoSnapshot()){
    super();this.profile=structuredClone(profile);this.vendorId=MODEL.vendorId;this.productId=MODEL.productId;this.opened=false;this.sent=[];
    this.collections=[{usagePage:MODEL.usagePage,outputReports:[{reportId:0,items:[{reportSize:8,reportCount:64}]}]}];
  }
  async open(){this.opened=true;}
  async close(){this.opened=false;}
  emit(packet){const event=new Event('inputreport');event.data=new DataView(Uint8Array.from(packet).buffer);this.dispatchEvent(event);}
  blob(op,data,end){const packets=Array.from({length:Math.ceil(data.length/61)},(_,i)=>command(op,[Math.min(61,data.length-i*61),...data.slice(i*61,i*61+61)]));packets.push(Array(64).fill(end));return packets;}
  async sendReport(id,data){
    assert.equal(id,0);const p=Array.from(data);this.sent.push(p);let reply;
    if(p[1]===0xf9)reply=[command(0xf9,Array.from(new TextEncoder().encode(this.profile.version)))];
    if(p[1]===0xf2)reply=[...this.profile.mappings.flatMap(m=>m.packets),Array(64).fill(0xf6)];
    if(p[1]===0xe2)reply=this.blob(0xe0,this.profile.lights,0xe6);
    if(p[1]===0xd3)reply=this.blob(0xd4,this.profile.triggers,0xd1);
    if(p[1]===0xe3){const bytes=new Uint8Array(336),view=new DataView(bytes.buffer);this.profile.counters.forEach((n,i)=>view.setUint32(i*4,n,true));reply=this.blob(0xe3,Array.from(bytes),0xe6);}
    if(p[1]===0xdb)reply=[command(0xda,[0xda])];
    if(p[1]===0xdd)reply=[command(0xde,[0xde])];
    if(p[1]===0xf1)this.writing=[];
    if(p[1]===0xf0)this.writing.push(p);
    if(p[1]===0xf6)this.profile.mappings=parseReports(this.writing);
    if(reply)queueMicrotask(()=>reply.forEach(packet=>this.emit(packet)));
  }
}
test('WebHID reads real report layout with full data and little-endian counters',async()=>{
  const fixture=demoSnapshot();fixture.counters[0]=0x12345678;
  const device=new FakeHID(fixture),channel=new NiZDevice(device);await channel.open();const result=await channel.snapshot();
  assert.deepEqual(result.mappings,fixture.mappings);assert.equal(result.counters[0],0x12345678);assert.equal(device.sent.some(p=>p[1]===0xf1),false);await channel.close();
});
test('WebHID write refuses to begin when durable backup fails',async()=>{
  const device=new FakeHID(),channel=new NiZDevice(device);await channel.open();const base=await channel.snapshot();
  await assert.rejects(()=>channel.write(base,base,async()=>{throw new Error('quota failed');}),/quota failed/);
  assert.equal(device.sent.some(p=>p[1]===0xf1),false);await channel.close();
});
test('WebHID writes all 756 records and verifies readback after a changed key',async()=>{
  const device=new FakeHID(),channel=new NiZDevice(device);await channel.open();const base=await channel.snapshot(),target=structuredClone(base);target.mappings[46]=encode(1,47,{kind:0,codes:[1]});let backedUp=false;
  const after=await channel.write(target,base,async(current,label)=>{assert.deepEqual(current.mappings,base.mappings);assert.equal(label,'写入前');backedUp=true;});
  assert.ok(backedUp);assert.deepEqual(after.mappings,target.mappings);assert.equal(device.sent.filter(p=>p[1]===0xf0).length,756);assert.ok(equal(after.triggers,base.triggers));await channel.close();
});
test('WebHID does not overwrite external edits after read',async()=>{
  const device=new FakeHID(),channel=new NiZDevice(device);await channel.open();const base=await channel.snapshot();device.profile.mappings[0]=encode(1,1,{kind:0,codes:[2]});
  await assert.rejects(()=>channel.write(base,base,async()=>{}),/配置已变化/);assert.equal(device.sent.some(p=>p[1]===0xf1),false);await channel.close();
});

test('calibration backs up before locking and uses official DB / DA DA, DD / DE DE commands',async()=>{
  const device=new FakeHID(),channel=new NiZDevice(device);await channel.open();
  let backup=false;
  const snapshot=await channel.beginCalibration(async(current,label)=>{assert.equal(device.sent.some(p=>p[1]===0xd9),false);assert.equal(label,'校准前键位备份');assert.equal(current.mappings.length,756);backup=true;});
  assert.ok(backup);assert.equal(snapshot.mappings.length,756);assert.equal(channel.calibrationActive,true);
  assert.deepEqual(device.sent.at(-1).slice(0,4),[0,0xd9,0,0]);
  await assert.rejects(()=>channel.calibrate('press'),/先完成释放/);
  await channel.calibrate('release');assert.equal(channel.calibrationReleased,true);
  assert.equal(device.sent.at(-1)[1],0xdb);
  await channel.calibrate('press');assert.equal(device.sent.at(-1)[1],0xdd);
  await assert.rejects(()=>channel.snapshot(),/结束校准/);
  await assert.rejects(()=>channel.write(snapshot,snapshot,async()=>{}),/校准期间/);
  await channel.endCalibration();assert.equal(channel.calibrationActive,false);assert.deepEqual(device.sent.at(-1).slice(0,4),[0,0xd9,1,0]);await channel.close();
});
test('calibration cannot lock when backup storage fails',async()=>{
  const device=new FakeHID(),channel=new NiZDevice(device);await channel.open();
  await assert.rejects(()=>channel.beginCalibration(async()=>{throw Error('backup failed');}),/backup failed/);
  assert.equal(device.sent.some(p=>p[1]===0xd9),false);assert.equal(channel.calibrationActive,false);await channel.close();
});
test('calibration ignores unrelated reply prefixes instead of claiming success',async()=>{
  const device=new FakeHID(),channel=new NiZDevice(device);await channel.open();
  await assert.rejects(()=>channel.query(0xf9,null,{reply:[0,0xda,0xda],timeout:20}),/响应超时/);
  assert.equal(channel.pending,null);await channel.close();
});
test('failed calibration command sends unlock before returning the error',async()=>{
  const device=new FakeHID(),channel=new NiZDevice(device);await channel.open();await channel.beginCalibration(async()=>{});
  const send=device.sendReport.bind(device);device.sendReport=async(id,p)=>{if(p[1]===0xdb)throw Error('USB failed');return send(id,p);};
  await assert.rejects(()=>channel.calibrate('release'),/USB failed/);
  assert.equal(channel.calibrationActive,false);assert.deepEqual(device.sent.at(-1).slice(0,4),[0,0xd9,1,0]);await channel.close();
});
test('closing an idle calibration session unlocks before closing USB',async()=>{
  const device=new FakeHID(),channel=new NiZDevice(device);await channel.open();await channel.beginCalibration(async()=>{});await channel.close();
  assert.equal(device.opened,false);assert.equal(channel.calibrationActive,false);assert.deepEqual(device.sent.at(-1).slice(0,4),[0,0xd9,1,0]);
});
test('closing during capture cancels the receiver and attempts keyboard unlock',async()=>{
  const device=new FakeHID(),channel=new NiZDevice(device);await channel.open();await channel.beginCalibration(async()=>{});
  const query=channel.query(0xf9,null,{reply:[0,0xda,0xda],timeout:1000});
  const rejected=assert.rejects(()=>query,/连接已关闭/);
  await new Promise(resolve=>setTimeout(resolve,100));await channel.close();await rejected;
  assert.equal(device.opened,false);assert.deepEqual(device.sent.at(-1).slice(0,4),[0,0xd9,1,0]);
});

test('per-step delays match native C8 markers across packet boundaries and retain playback type',()=>{
  const codes=Array.from({length:60},(_,i)=>i+1),delays=Array.from({length:59},(_,i)=>i*257);
  const mapping=encode(2,7,{kind:2,codes,customDelay:1,delays,cycles:3,interval:30});
  assert.deepEqual(mapping.packets[0].slice(0,15),[0,240,2,7,2,3,1,0,30,0,237,1,200,0,0]);
  assert.equal(mapping.packets.length,5);
  assert.deepEqual(decode(mapping).codes,codes);assert.deepEqual(decode(mapping).delays,delays);
  const profile=demoSnapshot();profile.mappings[90]=mapping;assert.deepEqual(validateSnapshot(profile).mappings[90],mapping);
  for(const kind of [3,4]){const retained=encode(2,7,{kind,codes,customDelay:1,delays,cycles:0});assert.equal(decode(retained).kind,kind);assert.equal(decode(retained).cycles,0);}
  assert.throws(()=>encode(1,1,{kind:2,codes:[43,44],customDelay:1,delays:[]}),/延时/);
  assert.throws(()=>encode(1,1,{kind:2,codes:[43,44],customDelay:1,delays:[65536]}),/延时/);
  assert.equal(decode(encode(1,1,{kind:2,codes:[43],customDelay:1,delays:[]})).codes.length,1);
});
