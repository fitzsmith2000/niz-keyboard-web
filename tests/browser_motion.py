"""Real browser frame checks for travel easing; no hardware or sensor interpolation."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page()
    page.goto('http://127.0.0.1:4180/')
    result=page.evaluate('''async()=>{
      const {animateTravel}=await import('/travel-motion.js');
      const root=document.createElement('div');root.innerHTML='<strong id="rt-live-value"></strong><div id="rt-live-fill"></div>';document.body.append(root);
      animateTravel(root,null,false,null);
      if(root.querySelector('strong').textContent!=='—')throw Error('Empty state');
      const samples=[],start=performance.now();
      animateTravel(root,{key:48,mm:4},true,175);
      await new Promise(resolve=>{const frame=()=>{
        samples.push({t:performance.now()-start,value:Number(root.querySelector('strong').textContent),scale:Number(root.querySelector('div').style.transform.slice(7,-1))});
        if(performance.now()-start<180)requestAnimationFrame(frame);else resolve();
      };requestAnimationFrame(frame);});
      animateTravel(root,{key:48,mm:0},true,175);
      await new Promise(resolve=>setTimeout(resolve,45));
      const before=Number(root.querySelector('strong').textContent);
      animateTravel(root,{key:48,mm:3},true,175);
      const after=Number(root.querySelector('strong').textContent);
      await new Promise(resolve=>setTimeout(resolve,170));
      const settled=Number(root.querySelector('strong').textContent);
      animateTravel(root,{key:49,mm:2},true,175);
      const differentKey=Number(root.querySelector('strong').textContent);
      animateTravel(root,{key:49,mm:2},false,175);
      const stopped=Number(root.querySelector('strong').textContent);
      return {samples,before,after,settled,differentKey,stopped};
    }''')
    samples=result['samples']
    assert len(samples)>=5,result
    assert all(0<=s['value']<=4 and 0<=s['scale']<=1 for s in samples),result
    assert all(a['value']<=b['value'] for a,b in zip(samples,samples[1:])),result
    assert len(set(s['value'] for s in samples))>=4,result
    middle=[s for s in samples if 50<=s['t']<=90]
    assert middle and all(s['value']>4*s['t']/140+.35 for s in middle),result
    assert samples[-1]['value']==4,result
    assert result['before']==result['after'] and result['settled']==3,result
    assert result['differentKey']==0 and result['stopped']==2,result
    page.emulate_media(reduced_motion='reduce')
    assert page.evaluate('''async()=>{const {animateTravel}=await import('/travel-motion.js');const root=document.createElement('div');root.innerHTML='<strong id="rt-live-value"></strong><div id="rt-live-fill"></div>';document.body.append(root);animateTravel(root,{key:48,mm:3.1},true,175);return root.querySelector('strong').textContent}''')=='3.1'
    print('PASS: intermediate frames, cubic ease-out, no overshoot, continuous retarget, key reset, stop, reduced motion')
    browser.close()
