"""Tracking UI checks with simulated HID; physical observations are documented separately."""
import ast
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
source=ast.parse(Path(__file__).with_name('browser_calibration.py').read_text())
mock=next(n.args[0].value for n in ast.walk(source) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='evaluate' and n.args and isinstance(n.args[0],ast.Constant) and isinstance(n.args[0].value,str) and 'class Mock' in n.args[0].value)
mock=mock.replace('if(reply)queueMicrotask', '''if(p[1]===0xcf){this.trackRequests=(this.trackRequests??0)+1;if(this.failTrack)throw Error('模拟 USB 跟踪失败');reply=[command(0xcf,[this.wrongTrack?p[2]+1:p[2],this.trackValues?.[p[2]]??2])];}if(reply)queueMicrotask''')
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1100})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:4180/')
    page.wait_for_load_state('networkidle')
    page.locator('.nav-item[data-view="rt"]').click()
    assert page.locator('#rt-live-toggle').is_disabled()
    assert page.locator('#rt-live-value').inner_text()=='—'
    page.evaluate(mock)
    page.locator('#connect').click()
    page.wait_for_function('!document.querySelector("#read").disabled')
    assert page.locator('#rt-live-key').count()==0
    page.locator('#rt-live-toggle').click()
    page.wait_for_function('document.querySelector("#rt-live-message").textContent.includes("84 键扫描中")')
    assert page.locator('#rt-live-value').inner_text()=='—'
    page.evaluate('window._calMock.trackValues={48:23}')
    page.wait_for_function('document.querySelector("#rt-live-value").textContent==="2.3"')
    assert '#48' in page.locator('#rt-live-name').inner_text()
    assert page.locator('#read').is_disabled()
    page.evaluate('window._calMock.trackValues={48:40}')
    page.wait_for_function('document.querySelector("#rt-live-value").textContent==="4.0"')
    assert page.locator('#rt-live-peak').inner_text()=='4.0'
    page.evaluate('window._calMock.trackValues={48:40,49:16}')
    page.wait_for_function('document.querySelector("#rt-live-name").textContent.includes("#49") && document.querySelector("#rt-live-value").textContent==="1.6"')
    assert page.locator('#rt-live-active>span').count()==2
    assert page.locator('#rt-live-peak').inner_text()=='1.6'
    assert page.locator('[data-rt-key="48"]').evaluate('(el)=>el.classList.contains("travel-active")')
    page.screenshot(path='tracking-desktop.png',full_page=True)
    page.evaluate('window._calMock.trackValues={48:40}')
    page.wait_for_function('document.querySelector("#rt-live-name").textContent.includes("#48")')
    assert page.locator('#rt-live-peak').inner_text()=='4.0'
    page.evaluate('window._calMock.trackValues={}')
    page.wait_for_function('document.querySelector("#rt-live-value").textContent==="0.0"')
    assert page.locator('#rt-live-peak').inner_text()=='4.0'
    assert page.locator('#rt-live-raw').inner_text()=='2'
    assert page.locator('#rt-live-curve').get_attribute('points')
    page.set_viewport_size({'width':390,'height':1000})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert page.locator('#rt-live').is_visible()
    page.screenshot(path='tracking-mobile.png',full_page=True)
    page.locator('#rt-live-toggle').click()
    page.wait_for_function('document.querySelector("#rt-live-toggle").textContent==="开始全键监测"')
    count=page.evaluate('window._calMock.trackRequests')
    page.wait_for_timeout(250)
    assert page.evaluate('window._calMock.trackRequests')==count
    assert page.locator('#rt-live-label').inner_text()=='最后读数'
    assert not page.locator('#read').is_disabled()
    page.evaluate('window._calMock.trackValues={84:16}')
    page.locator('#rt-live-toggle').click()
    page.wait_for_function('document.querySelector("#rt-live-value").textContent==="1.6"')
    assert "#84" in page.locator('#rt-live-name').inner_text()
    page.locator('.nav-item[data-view="backups"]').click()
    page.get_by_role('heading',name='本地备份',exact=True).wait_for()
    count=page.evaluate('window._calMock.trackRequests')
    page.wait_for_timeout(250)
    assert page.evaluate('window._calMock.trackRequests')==count
    page.locator('.nav-item[data-view="rt"]').click()
    page.evaluate('window._calMock.failTrack=true')
    page.locator('#rt-live-toggle').click()
    page.wait_for_function('document.querySelector("#rt-live-message").textContent.includes("模拟 USB 跟踪失败")')
    assert page.locator('#rt-live-value').inner_text()=='—'
    assert not page.locator('#read').is_disabled()
    page.evaluate('window._calMock.failTrack=false;window._calMock.wrongTrack=true')
    page.locator('#rt-live-toggle').click()
    page.wait_for_function('document.querySelector("#rt-live-message").textContent.includes("超时")')
    assert page.locator('#rt-live-value').inner_text()=='—'
    page.evaluate('window._calMock.wrongTrack=false')
    page.locator('#rt-live-toggle').click()
    page.wait_for_function('document.querySelector("#rt-live-value").textContent==="1.6"')
    page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"))')
    page.wait_for_function('document.querySelector("#rt-live-toggle").textContent==="开始全键监测"')
    count=page.evaluate('window._calMock.trackRequests')
    page.wait_for_timeout(250)
    assert page.evaluate('window._calMock.trackRequests')==count
    assert not page.evaluate('window._calMock.sent.some(p=>[0xf1,0xf0,0xd2,0xd4,0xd9,0xdb,0xdd].includes(p[1]))')
    assert set(page.evaluate('window._calMock.sent.filter(p=>p[1]===0xcf).map(p=>p[2])'))==set(range(1,85))
    assert not errors,errors
    print(json.dumps({'result':'PASS','demoBlocked':True,'all84AutoScan':True,'automaticFocus':True,'simultaneousKeys':True,'independentPeaks':True,'realReplyDrivenRendering':True,'rawAndNativeDisplay':True,'peak':True,'stopAndNavigationCleanup':True,'hiddenStops':True,'wrongKeyTimesOut':True,'usbFailureClearsLiveValue':True,'readOnlyCommands':True,'mobile':True,'pageErrors':errors}))
    browser.close()
