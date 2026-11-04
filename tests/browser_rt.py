"""RT UI + end-to-end transport with a simulated keyboard only."""
import ast
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

# Share the existing simulated read/calibration device, adding RT write handling.
source=ast.parse(Path(__file__).with_name('browser_calibration.py').read_text())
mock=next(n.args[0].value for n in ast.walk(source) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='evaluate' and n.args and isinstance(n.args[0],ast.Constant) and isinstance(n.args[0].value,str) and 'class Mock' in n.args[0].value)
mock=mock.replace('const p=Array.from(data);','const p=Array.from(data);if(p[1]===0xd2)this.triggerWriting=[];if(p[1]===0xd4)this.triggerWriting.push(...p.slice(3,3+p[2]));if(p[1]===0xd1)this.profile.triggers=this.triggerWriting;')
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1100})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:4180/')
    page.wait_for_load_state('networkidle')
    page.locator('.nav-item[data-view="rt"]').click()
    assert page.locator('[data-rt-key]').count()==84
    page.locator('[data-rt-select="wasd"]').click()
    assert page.locator('[data-rt-key][aria-pressed="true"]').count()==4
    page.locator('[data-rt-preset="drt"]').evaluate('(e)=>e.closest("details").open=true')
    page.locator('[data-rt-preset="drt"]').click()
    page.locator('#rt-value-2').fill('0.6')
    page.locator('#rt-value-2').press('Tab')
    assert page.locator('#rt-range-2').input_value()=='5'
    page.locator('#rt-apply').click()
    assert page.locator('#change-count').inner_text()=='4'
    assert page.locator('#review').is_disabled()
    page.locator('#undo-all').click()
    page.locator('#modal-confirm').click()
    assert page.locator('#change-count').inner_text()=='0'
    page.evaluate(mock)
    page.locator('#connect').click()
    page.wait_for_function('!document.querySelector("#read").disabled')
    page.locator('[data-rt-select="all"]').click()
    page.locator('[data-rt-preset="drt"]').evaluate('(e)=>e.closest("details").open=true')
    page.locator('[data-rt-preset="drt"]').click()
    page.locator('#rt-apply').click()
    assert page.locator('#change-count').inner_text()=='84'
    page.locator('#review').click()
    assert 'RT / 物理键 1' in page.locator('#modal-body').inner_text()
    page.locator('#modal-confirm').click()
    page.wait_for_function('!document.querySelector("#read").disabled && document.querySelector("#change-count").textContent==="0"')
    assert page.evaluate('window._calMock.profile.triggers.every((n,i)=>n===[16,24,4][i%3])')
    assert not page.evaluate('window._calMock.sent.some(p=>p[1]===0xf1||p[1]===0xf0)')
    page.screenshot(path='rt-desktop.png',full_page=True)
    page.locator('[data-rt-select="none"]').click()
    assert page.locator('#rt-apply').is_disabled()
    for width in [1440,1024,768,390]:
        page.set_viewport_size({'width':width,'height':1000})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
    page.screenshot(path='rt-mobile.png',full_page=True)
    assert not errors,errors
    print(json.dumps({'result':'PASS','wasdSelection':True,'demoCannotWrite':True,'undoTriggers':True,'full84TriggerSaveReadback':True,'noKeymapWrite':True,'responsive':True,'pageErrors':errors}))
    browser.close()
