"""Offline macro editing checks; never opens a physical HID device."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright

with sync_playwright() as p, TemporaryDirectory() as tmp:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:4180/')
    page.wait_for_load_state('networkidle')
    page.locator('[data-category="mouse"]').click()
    assert page.locator('#palette button').count()==10
    page.locator('[data-kind="2"]').click()
    page.locator('#clear-codes').click()
    for code in [130,131,199]:
        page.locator(f'#palette [data-code="{code}"]').click()
    page.locator('#macro-custom-delay').check()
    for index,value in [(0,'257'),(1,'65535')]:
        page.locator(f'[data-step-delay="{index}"]').fill(value)
        page.locator(f'[data-step-delay="{index}"]').press('Tab')
    page.locator('#apply-key').click()
    with page.expect_download() as download:
        page.locator('#export').click()
    data=json.loads(Path(download.value.path()).read_text())
    packet=data['mappings'][46]['packets'][0]
    assert packet[4:7]==[2,1,1]
    assert packet[11:20]==[130,200,1,1,131,200,255,255,199]
    packet[4]=4
    packet[5]=0
    fixture=Path(tmp)/'mode4.json'
    fixture.write_text(json.dumps(data))
    page.locator('.nav-item[data-view="backups"]').click()
    page.locator('#import-file').set_input_files(str(fixture))
    page.locator('#modal-confirm').click()
    page.locator('[data-key="47"]').click()
    assert page.locator('#macro-custom-delay').is_checked()
    page.locator('[data-kind="2"]').click()
    page.locator('#apply-key').click()
    with page.expect_download() as download:
        page.locator('#export').click()
    retained=json.loads(Path(download.value.path()).read_text())['mappings'][46]['packets'][0]
    assert retained==packet
    for width in [1440,768,390]:
        page.set_viewport_size({'width':width,'height':1000})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not errors,errors
    print(json.dumps({'result':'PASS','stepDelays':[257,65535],'mouseActions':10,'mode4BytesPreserved':True,'responsive':True,'pageErrors':errors}))
    browser.close()
