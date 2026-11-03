"""Browser checks with simulated HID only; never opens a physical keyboard."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('NIZ_TEST_URL', 'http://127.0.0.1:4180/'))
    page.wait_for_load_state('networkidle')
    page.locator('.nav-item[data-view="backups"]').click()
    page.get_by_role('heading', name='本地备份', exact=True).wait_for()
    assert '退路' not in page.locator('body').inner_text()
    page.locator('.nav-item[data-view="calibration"]').click()
    assert page.locator('#cal-begin').is_disabled()
    page.evaluate('''async()=>{
      const {demoSnapshot,command}=await import('./protocol.js');
      class Mock extends EventTarget {
        constructor(){super();this.profile=demoSnapshot();this.vendorId=0x0483;this.productId=0x5235;this.opened=false;this.sent=[];this.groups=0;this.collections=[{usagePage:0x8c,outputReports:[{reportId:0,items:[{reportSize:8,reportCount:64}]}]}];}
        async open(){this.opened=true;}
        async close(){this.opened=false;}
        blob(op,bytes,end){return [...Array.from({length:Math.ceil(bytes.length/61)},(_,i)=>command(op,[Math.min(61,bytes.length-i*61),...bytes.slice(i*61,i*61+61)])),Array(64).fill(end)];}
        async sendReport(id,data){
          const p=Array.from(data);this.sent.push(p);let reply;
          if(p[1]===0xf9)reply=[command(0xf9,Array.from(new TextEncoder().encode(this.profile.version)))];
          if(p[1]===0xf2)reply=[...this.profile.mappings.flatMap(m=>m.packets),Array(64).fill(0xf6)];
          if(p[1]===0xe2)reply=this.blob(0xe0,this.profile.lights,0xe6);
          if(p[1]===0xd3)reply=this.blob(0xd4,this.profile.triggers,0xd1);
          if(p[1]===0xe3)reply=this.blob(0xe3,Array(336).fill(0),0xe6);
          if(p[1]===0xdb){if(this.failRelease)throw Error('模拟 USB 错误');reply=[command(0xda,[0xda])];}
          if(p[1]===0xdd){this.groups++;reply=[command(0xde,[0xde])];}
          if(reply)queueMicrotask(()=>reply.forEach(packet=>{const event=new Event('inputreport');event.data=new DataView(new Uint8Array(packet).buffer);this.dispatchEvent(event);}));
        }
      }
      window._calMock=new Mock();const access=new EventTarget();access.requestDevice=async()=>[window._calMock];Object.defineProperty(navigator,'hid',{value:access,configurable:true});
    }''')
    page.locator('#connect').click()
    page.wait_for_function("!document.querySelector('#read').disabled")
    page.locator('#cal-begin').click()
    page.locator('#modal-confirm').click()
    page.wait_for_function("!document.querySelector('#cal-release').disabled")
    assert page.locator('#read').is_disabled()
    assert page.locator('.nav-item[data-view="backups"]').is_disabled()
    page.locator('#cal-release').click()
    page.wait_for_function("!document.querySelector('#cal-press').disabled")
    for group in range(1, 22):
        page.locator('#cal-press').click()
        page.wait_for_function("n=>document.querySelector('.calibration-progress>span').textContent.startsWith(`第 ${n} 组采集完成`)", arg=group)
    page.locator('#cal-finish').click()
    page.locator('#modal-confirm').click()
    page.wait_for_function("!document.querySelector('#read').disabled")
    assert page.evaluate('window._calMock.groups') == 21
    assert '已完成' in page.locator('.calibration-step-label').first.inner_text()
    assert page.locator('#cal-press').is_disabled()
    assert page.evaluate('window._calMock.sent.at(-1).slice(0,4)') == [0, 217, 1, 0]
    assert not page.evaluate('window._calMock.sent.some(p=>p[1]===0xf1)')
    page.screenshot(path=str(Path(__file__).resolve().parents[1]/'calibration-desktop.png'), full_page=True)
    page.locator('#cal-begin').click()
    page.locator('#modal-confirm').click()
    page.wait_for_function("!document.querySelector('#cal-release').disabled")
    page.evaluate('window._calMock.failRelease=true')
    page.locator('#cal-release').click()
    page.locator('#modal').wait_for(state='visible')
    assert '模拟 USB 错误' in page.locator('#modal-body').inner_text()
    assert page.evaluate('window._calMock.sent.at(-1).slice(0,4)') == [0, 217, 1, 0]
    assert not page.locator('#read').is_disabled()
    page.locator('#modal-cancel').click()
    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(Path(__file__).resolve().parents[1]/'calibration-mobile.png'), full_page=True)
    assert not errors, errors
    print(json.dumps({"result":"PASS","device":"simulated HID only","groups":21,"copyClean":True,"demoBlocked":True,"releaseAck":True,"pressAck":True,"unlockOnFinish":True,"unlockOnFailure":True,"completedReleaseStatusRetained":True,"captureDisabledAfterEnd":True,"noKeymapWrite":True,"mobileNoOverflow":True,"pageErrors":errors}))
    browser.close()
