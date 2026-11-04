from playwright.sync_api import sync_playwright
from zipfile import ZipFile
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',headless=True);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:4180/',wait_until='networkidle');assert page.locator('#macro-nav').count()==0
 page.locator('button[data-view="settings"]').click();page.wait_for_function('document.querySelector("#main-title").textContent==="设置"');assert page.locator('#main-title').inner_text()=='设置';page.locator('[data-settings-view="parameters"]').click();page.wait_for_function('document.querySelector("#main-title").textContent==="设备参数"');assert page.locator('#main-title').inner_text()=='设备参数'
 page.locator('button[data-view="help"]').click();assert page.locator('#feedback-form').is_visible();assert page.locator('button[data-view="help"]').get_attribute('class').endswith('active')
 for name,value in [('title','测试标题'),('steps','1. 点击帮助'),('expected','可以反馈'),('actual','测试附件包')]:page.locator('[name="'+name+'"]').fill(value)
 page.locator('#feedback-files').set_input_files({'name':'测试.txt','mimeType':'text/plain','buffer':b'attachment proof'})
 page.get_by_role('button',name='预览反馈',exact=True).click();assert '测试标题' in page.locator('#feedback-preview').inner_text()
 with page.expect_download() as info:page.get_by_role('button',name='下载反馈与附件包').click()
 info.value.save_as('/tmp/niz-feedback-test.zip')
 with ZipFile('/tmp/niz-feedback-test.zip') as z:
  assert z.testzip() is None;assert z.read('attachments/1-测试.txt')==b'attachment proof';assert '测试标题' in z.read('feedback.md').decode()
 page.get_by_role('button',name='创建 GitHub Issue').scroll_into_view_if_needed()
 page.context.route('https://github.com/**',lambda route:route.fulfill(status=200,body='Issue preview'))
 with page.expect_popup() as info:page.get_by_role('button',name='创建 GitHub Issue').click()
 popup=info.value;popup.wait_for_url('https://github.com/**');assert 'github.com/fitzsmith2000/niz-keyboard-web/issues/new?' in popup.url;popup.close()
 page.locator('button[data-view="settings"]').click();page.locator('button[data-view="help"]').click();assert page.locator('[name="title"]').input_value()=='测试标题';assert '测试.txt' in page.locator('#feedback-file-list').inner_text()
 page.set_viewport_size({'width':390,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='/tmp/niz-feedback-mobile.png',full_page=True);assert not errors,errors;b.close();print('PASS navigation, feedback draft, preview, ZIP contents/CRC/Unicode, GitHub prefill, mobile, no page errors')
