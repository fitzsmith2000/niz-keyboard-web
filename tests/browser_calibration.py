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
        constructor(){super();this.profile=demoSnapshot();this.vendorId=0x0483;this.productId=0x5235;this.opened=false;this.sent=[];this.samples=0;this.collections=[{usagePage:0x8c,outputReports:[{reportId:0,items:[{reportSize:8,reportCount:64}]}]}];}
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
          if(p[1]===0xdd){this.samples++;reply=[command(0xde,[0xde])];}
          if(reply)queueMicrotask(()=>reply.forEach(packet=>{const event=new Event('inputreport');event.data=new DataView(new Uint8Array(packet).buffer);this.dispatchEvent(event);}));
        }
      }
      window._calMock=new Mock();const access=new EventTarget();access.requestDevice=async()=>[window._calMock];Object.defineProperty(navigator,'hid',{value:access,configurable:true});
    }''')
    page.locator('#connect').click()
    page.wait_for_function("!document.querySelector('#read').disabled")
    def begin():
        page.locator('#cal-begin').click()
        page.locator('#modal-confirm').click()
        page.wait_for_function("document.querySelector('.calibration-stage').dataset.stage==='1' && !document.querySelector('#cal-release').disabled")
        assert page.locator('.calibration-stage').count() == 1
        assert page.locator('#cal-press').count() == 0
        assert not page.locator('#cal-finish').is_disabled()
        assert page.locator('#read').is_disabled()
        assert page.locator('.nav-item[data-view="backups"]').is_disabled()

    def release():
        page.locator('#cal-release').click()
        page.wait_for_function("document.querySelector('.calibration-stage').dataset.stage==='2' && !document.querySelector('#cal-press').disabled")
        assert page.locator('#cal-release').count() == 0
        assert not page.locator('#cal-finish').is_disabled()
        assert '任意' in page.locator('.calibration-stage').inner_text()
        assert page.locator('.calibration-group,.calibration-steps,.calibration-card').count() == 0

    def sample(count):
        page.locator('#cal-press').click()
        page.wait_for_function("n=>document.querySelector('.calibration-sample-count>strong').textContent===String(n) && !document.querySelector('#cal-press').disabled", arg=count)

    def finish():
        page.locator('#cal-finish').click()
        page.locator('#modal-confirm').click()
        page.wait_for_function("!document.querySelector('#read').disabled")
        assert page.locator('.calibration-stage').get_attribute('data-stage') == '0'
        assert page.locator('#cal-press,#cal-release,#cal-finish').count() == 0
        assert page.evaluate('window._calMock.sent.at(-1).slice(0,4)') == [0, 217, 1, 0]

    begin()
    release()
    sample(1)
    finish()
    assert '本次完成 1 次按下采样' in page.locator('.calibration-progress').inner_text()
    assert page.evaluate('window._calMock.samples') == 1

    begin()
    release()
    for count in range(1, 23):
        sample(count)
    assert '22' in page.locator('.calibration-sample-count>strong').inner_text()
    assert not page.locator('#cal-press').is_disabled()
    page.screenshot(path=str(Path(__file__).resolve().parents[1]/'calibration-desktop.png'), full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(Path(__file__).resolve().parents[1]/'calibration-mobile.png'), full_page=True)
    finish()
    assert page.evaluate('window._calMock.samples') == 23

    # Neither a held-key sample nor release sampling is required to exit safely.
    begin()
    release()
    finish()
    assert '本次完成 0 次按下采样' in page.locator('.calibration-progress').inner_text()
    begin()
    finish()

    begin()
    page.evaluate('window._calMock.failRelease=true')
    page.locator('#cal-release').click()
    page.locator('#modal').wait_for(state='visible')
    assert '模拟 USB 错误' in page.locator('#modal-body').inner_text()
    assert page.evaluate('window._calMock.sent.at(-1).slice(0,4)') == [0, 217, 1, 0]
    assert not page.locator('#read').is_disabled()
    page.locator('#modal-cancel').click()
    assert not page.evaluate('window._calMock.sent.some(p=>p[1]===0xf1)')
    assert not errors, errors
    print(json.dumps({"result":"PASS","device":"simulated HID only","linearStage":True,"samples":23,"canRepeatBeyond21":True,"finishAfterSingleSample":True,"finishWithoutPress":True,"exitBeforeRelease":True,"copyClean":True,"demoBlocked":True,"releaseAck":True,"pressAck":True,"unlockOnFinish":True,"unlockOnFailure":True,"captureUnavailableAfterEnd":True,"noKeymapWrite":True,"mobileNoOverflow":True,"pageErrors":errors}))
    browser.close()
