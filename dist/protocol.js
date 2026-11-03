export const MODEL = {vendorId: 0x0483, productId: 0x5235, usagePage: 0x8c, keyCount: 84, layerCount: 9, versionPrefix: 'mini84EC(S);V2.3.3;'};
export const DEFAULT_CODES = [1,2,3,4,5,6,7,8,9,10,11,12,13,78,79,84,14,15,16,17,18,19,20,21,22,23,24,25,26,27,82,28,29,30,31,32,33,34,35,36,37,38,39,40,41,83,42,43,44,45,46,47,48,49,50,51,52,53,54,86,55,56,57,58,59,60,61,62,63,64,65,66,87,85,67,68,69,70,71,156,74,88,89,90];
export const ROWS = [Array.from({length:16},(_,i)=>i+1),Array.from({length:15},(_,i)=>i+17),Array.from({length:15},(_,i)=>i+32),Array.from({length:14},(_,i)=>i+47),Array.from({length:14},(_,i)=>i+61),Array.from({length:10},(_,i)=>i+75)];
export const assert = (condition, message) => { if (!condition) throw new Error(message); };
const byte = n => Number.isInteger(n) && n >= 0 && n <= 255;
export const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export const recordId = mapping => `${mapping.packets[0][2]}:${mapping.packets[0][3]}`;
export function command(op, payload = []) {
  assert(byte(op) && payload.length <= 62 && payload.every(byte), '命令数据无效。');
  return [0,op,...payload,...Array(62-payload.length).fill(0)];
}
export function decode(mapping) {
  const p = mapping.packets[0];
  if (p[4] === 0) return {kind:0,codes:p.slice(6,6+p[5]),interval:30,cycles:1,delays:[]};
  if (p[4] === 1) return {kind:1,codes:p.slice(8,8+p[7]),interval:p[5]*256+p[6],cycles:1,delays:[]};
  const bytes = mapping.packets.flatMap(packet=>packet.slice(11)).slice(0,p[9]*256+p[10]);
  return {kind:p[4],interval:p[7]*256+p[8],cycles:p[5],customDelay:p[6],
    codes:bytes.filter((_,i)=>p[6]===0 || i%4===0),
    delays:p[6]===0?[]:bytes.flatMap((_,i)=>i%4===1?[bytes[i+1]*256+bytes[i+2]]:[])};
}
export function encode(layer, key, definition) {
  assert(Number.isInteger(layer)&&layer>=1&&layer<=9&&Number.isInteger(key)&&key>=1&&key<=84, '键位或层编号无效。');
  const {kind,codes,interval=30,cycles=1} = definition;
  assert([0,1,2].includes(kind) && Array.isArray(codes) && codes.every(byte), '功能定义无效。');
  if (kind===0) {
    assert(codes.length<=58,'组合键超过设备容量。');
    return {packets:[command(0xf0,[layer,key,0,codes.length,...codes])]};
  }
  assert(Number.isInteger(interval)&&interval>=(kind===1?1:0)&&interval<=65535,'间隔必须在有效范围内。');
  assert(codes.length>0&&codes.length<=(kind===1?56:2048),'动作数量超过设备容量，或动作序列为空。');
  if (kind===1) return {packets:[command(0xf0,[layer,key,1,interval>>8,interval&255,codes.length,...codes])]};
  assert(Number.isInteger(cycles)&&cycles>=1&&cycles<=255,'循环次数必须为 1–255。');
  const header = command(0xf0,[layer,key,2,cycles,0,interval>>8,interval&255,codes.length>>8,codes.length&255]);
  return {packets:Array.from({length:Math.ceil(codes.length/53)},(_,i)=>{
    const packet=[...header]; packet.splice(11,Math.min(53,codes.length-i*53),...codes.slice(i*53,i*53+53)); return packet;
  })};
}
export function parseReports(reports) {
  assert(Array.isArray(reports)&&reports.length>=756&&reports.length<=8192,'配置必须包含全部 9 层，且报告数量有效。');
  assert(reports.every(p=>Array.isArray(p)&&p.length===64&&p.every(byte)),'配置中存在无效的 64 字节报告。');
  const records=[];
  for (let index=0;index<reports.length;) {
    const p=reports[index];
    assert(p[0]===0&&p[1]===0xf0&&p[2]>=1&&p[2]<=9&&p[3]>=1&&p[3]<=84&&p[4]<=4,'配置包含不支持的键位或功能类型。');
    const size=p[9]*256+p[10], count=p[4]<2?1:Math.ceil(size/53);
    assert(count>0&&count<=155&&index+count<=reports.length,'宏数据不完整。');
    const packets=reports.slice(index,index+count).map(packet=>[...packet]);
    if (p[4]===0) assert(p[5]<=58,'组合键长度无效。');
    else if (p[4]===1) assert(p[7]<=56,'连发动作长度无效。');
    else {
      assert(size<=8192&&p[6]<=1&&packets.every(packet=>equal(packet.slice(0,11),p.slice(0,11))),'宏分包头或长度不一致。');
      if (p[6]===1) {
        const data=packets.flatMap(packet=>packet.slice(11)).slice(0,size);
        assert((data.length+3)%4===0&&data.every((value,i)=>i%4!==1||value===200),'宏的逐步延时数据无效。');
      }
    }
    records.push({packets}); index+=count;
  }
  assert(records.length===756&&new Set(records.map(recordId)).size===756,'配置缺少按键，或包含重复定义。');
  return records.sort((a,b)=>(a.packets[0][2]-b.packets[0][2])*84+a.packets[0][3]-b.packets[0][3]);
}
export function validateSnapshot(input) {
  assert(input!==null&&typeof input==='object'&&!Array.isArray(input),'请选择有效的 NiZ JSON 配置。');
  assert(input.schema===1&&input.vendorID===MODEL.vendorId&&input.productID===MODEL.productId&&typeof input.version==='string'&&input.version.startsWith(MODEL.versionPrefix),'此配置不属于已适配的 mini84EC(S) V2.3.3。');
  assert(Array.isArray(input.mappings)&&input.mappings.every(m=>m!==null&&typeof m==='object'&&Array.isArray(m.packets)),'按键定义格式无效。');
  const mappings=parseReports(input.mappings.flatMap(m=>m.packets));
  assert(Array.isArray(input.lights)&&input.lights.length===252&&input.lights.every(byte),'灯光备份长度无效。');
  assert(Array.isArray(input.triggers)&&input.triggers.length===252&&input.triggers.every(byte),'触发参数备份长度无效。');
  assert(Array.isArray(input.counters)&&input.counters.length===84&&input.counters.every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff),'计数备份长度无效。');
  return {schema:1,capturedAt:input.capturedAt??new Date().toISOString(),vendorID:input.vendorID,productID:input.productID,
    locationID:Number.isInteger(input.locationID)?input.locationID:0,version:input.version,mappings,lights:[...input.lights],triggers:[...input.triggers],counters:[...input.counters]};
}
export function parseBlob(reports,op,length) {
  const data=reports.flatMap(p=>{
    assert(p.length===64&&p[0]===0&&p[1]===op&&p[2]>=1&&p[2]<=61,'设备返回了无效的数据分包。');
    return p.slice(3,3+p[2]);
  });
  assert(data.length===length,'设备返回的数据不完整，请重新读取。'); return data;
}
export function demoSnapshot() {
  return {schema:1,capturedAt:new Date().toISOString(),vendorID:MODEL.vendorId,productID:MODEL.productId,locationID:0,version:'mini84EC(S);V2.3.3;V1.0;',
    mappings:Array.from({length:756},(_,i)=>encode(Math.floor(i/84)+1,i%84+1,{kind:0,codes:Math.floor(i/84)%3===0?[DEFAULT_CODES[i%84]]:[]})),
    lights:Array(252).fill(0),triggers:Array(252).fill(0),counters:Array(84).fill(0)};
}
