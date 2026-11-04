import {assert} from './protocol.js';

// NiZ 1.0.8 ReadKeyTrack returns the physical key echo and a one-byte travel value.
export function parseTravel(packet,key){
  assert(packet.length===64&&packet[0]===0&&packet[1]===0xcf&&packet[2]===key,'实时行程回复与所选按键不一致。');
  assert(packet[3]<=40,'设备返回了超出范围的行程值。');
  return {key,raw:packet[3],mm:(packet[3]<=8?0:packet[3]>=36?40:packet[3])/10};
}

// Prefer a newly depressed key, then the largest motion; held keys do not steal focus.
export function chooseTravel(samples,previous,focused){
  const pressed=samples.filter(sample=>sample.mm>0);
  const newlyPressed=pressed.filter(sample=>(previous.get(sample.key)??0)===0).sort((a,b)=>b.mm-a.mm);
  const moving=pressed.map(sample=>({sample,delta:Math.abs(sample.mm-(previous.get(sample.key)??0))})).filter(item=>item.delta>0).sort((a,b)=>b.delta-a.delta);
  return {pressed,focused:newlyPressed[0]??moving[0]?.sample??pressed.find(sample=>sample.key===focused)??pressed[0]??samples.find(sample=>sample.key===focused)??null};
}
