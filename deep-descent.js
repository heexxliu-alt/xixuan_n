/* Deep Sea world coordinates are viewport heights. No perspective or scale in
   the descent: screenY = anchor + (worldDepth - cameraDepth) * layerSpeed.
   Writing begins at 9.5H; its existing Z renderer owns everything thereafter. */
window.createVerticalDescent = (world, legacy, tracker) => {
  const clamp = (x,a=0,b=1) => Math.max(a,Math.min(b,x));
  world.classList.add('vertical-descent');
  const environment = document.createElement('div');
  environment.className = 'vertical-environment';
  environment.innerHTML = '<img class="vertical-water" src="assets/deep-descent/water.png" alt=""><div class="vertical-darkness"></div>';
  world.prepend(environment);
  const near = document.createElement('div');
  near.className = 'vertical-near'; near.setAttribute('aria-hidden','true'); world.append(near);
  const objects = [];
  const rock = (name,depth,speed,x,width,height,front=false,flip=false) => {
    const el=document.createElement('div'); el.className=`vertical-rock vertical-rock--${name}`;
    el.style.cssText=`left:${x}%;width:${width}vw;height:${height}vh;`;
    (front?near:environment).append(el);
    const image=document.createElement('img');
    image.src=`assets/deep-descent/${name}-transparent.png`; image.alt='';
    el.append(image);
    objects.push({el,depth,speed,flip});
  };
  rock('middle',.7,.48,50,110,240);
  rock('middle',4.5,.48,54,120,250,false,true);
  rock('middle',7,.48,45,118,230);
  rock('arch',2.8,.82,50,108,125);
  rock('foreground',.6,1.2,44,125,250,true);
  rock('foreground',3.2,1.2,59,136,265,true,true);
  rock('foreground',2.8,1.2,70,160,200,true);
  rock('foreground',5.7,1.2,42,133,255,true);
  rock('foreground',7.1,1.2,58,130,220,true,true);
  const intro=world.querySelector('.quiet-professional');
  const profile=world.querySelector('.profile-coordinates');
  const content=world.querySelector('.descent-layer-content');
  content.classList.add('vertical-content');
  const cases=[...legacy.querySelectorAll('.v2-case-site')];
  cases.forEach((el,i)=>{el.classList.add('vertical-case');el.dataset.descentDepth=[3.8,5.2,6.6,8][i];content.append(el);});
  legacy.querySelectorAll('.v2-depth-node').forEach(el=>{if(+el.dataset.v2Z<10600)el.style.display='none';});
  const nodes=[{el:intro,depth:0,x:48},{el:profile,depth:1.55,x:50},...cases.map((el,i)=>({el,depth:+el.dataset.descentDepth,x:[48,61,48,59][i]}))];
  const archive = document.createElement('section');
  archive.className = 'seabed-writing';
  archive.setAttribute('aria-label','Writing Archive');
  const articles = [
    ['京东方邵喜斌：液晶显示仍在迭代进化','https://www3.xinhuanet.com/tech/20240510/cecf2c08512246eabf4010481f505ba2/c.html'],
    ['ADS Pro+Mini LED“黄金搭档”：高端显示时代的新答案','https://finance.sina.com.cn/wm/2026-03-30/doc-inhsttre6554441.shtml'],
    ['BOE（京东方）重磅发布 ADS Pro 新品 携手创维打造比 OLED 更好的 Mini LED 电视新品 A5F Pro','https://www.boe.com/company/dynamic-d08ae95aad03414eb679837241b2c705'],
    ['执笔绘荣光，这是属于Ta们的热辣滚烫','https://mp.weixin.qq.com/s/QZYiFJhveEcypIL6ukwIdw']
  ];
  archive.innerHTML = `<div class="seabed-scene" aria-hidden="true"><img class="seabed-background" src="public/images/writing/seabed-background.png" alt=""><img class="seabed-floor" src="public/images/writing/seabed-floor.png" alt=""><img class="seabed-foreground" src="public/images/writing/seabed-foreground.png" alt=""></div>
    <header class="seabed-writing-heading"><span>WRITING ARCHIVE</span></header>
    <div class="seabed-covers">${articles.map(([title,url],i)=>`<a class="seabed-cover" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="${title}（新标签页打开）"><img src="public/images/writing/newsroom-0${i+1}.png" alt="${title}" width="1600" height="2000"><span class="seabed-cover-caption"><span>WRITING 0${i+1}</span><span>VIEW ORIGINAL ↗</span></span></a>`).join('')}</div>
    <div class="seabed-contact"><i class="contact-ripple" aria-hidden="true"></i><i class="contact-ripple" aria-hidden="true"></i><span>LET’S MAKE SOMETHING RESONATE</span><a href="tel:13718937300"><strong>Let’s Talk<span aria-hidden="true">↗</span></strong><span class="contact-number">137 1893 7300</span></a></div>`;
  world.querySelector('.descent-stage').append(archive);
  const covers=[...archive.querySelectorAll('.seabed-cover')];
  const heading=archive.querySelector('header'), contact=archive.querySelector('.seabed-contact');
  const scene=archive.querySelector('.seabed-background');
  const writingCursor=world.querySelector('.cursor-layer');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  tracker.setSwimMap(null,null);
  tracker.setCalm(true);
  covers.forEach((cover) => {
    cover.addEventListener('pointerenter', () => {
      if (world.classList.contains('is-writing-archive')) writingCursor.dataset.cursorKind = 'link';
    });
    cover.addEventListener('pointerleave', () => {
      if (world.classList.contains('is-writing-archive')) writingCursor.dataset.cursorKind = 'body';
    });
  });
  return {render(depth,v){
    const d=depth/v.height, camera=Math.min(d,9.5), writing=smooth((d-8.85)/.65);
    const isWriting=d>=9.5;
    world.dataset.motionPhase=d<8.75?'descent':d<9.5?'buffer':'writing';
    world.classList.toggle('is-writing-archive', isWriting);
    if (isWriting) {
      tracker.setPointerFollowEnabled(false);
      writingCursor.dataset.cursorMode = 'reading';
      writingCursor.dataset.cursorKind = 'body';
      writingCursor.style.opacity = '1';
    } else {
      tracker.setPointerFollowEnabled(true);
      writingCursor.dataset.cursorMode = 'world';
      writingCursor.removeAttribute('data-cursor-kind');
      writingCursor.style.opacity = '';
    }
    world.style.setProperty('--vertical-camera',camera.toFixed(4));
    environment.style.opacity=String(1-writing);
    near.style.opacity=String((1-clamp((d-8.65)/.6))*(1-writing));
    environment.querySelector('.vertical-water').style.transform=`translate3d(0,${-camera*v.height*.22}px,0)`;
    environment.querySelector('.vertical-darkness').style.opacity=String(.12+clamp(camera/9.5)*.28);
    objects.forEach(({el,depth,speed,flip})=>{
      el.style.transform=`translate(-50%,-50%) translate3d(0,${(.5+(depth-camera)*speed)*v.height}px,0)${flip?' scaleX(-1)':''}`;
    });
    let active=null;
    nodes.forEach(({el,depth:at,x})=>{
      const y=.5+at-d, readable=y>-.05&&y<1.12;
      el.style.left=`${v.width<760?50:x}%`;
      el.style.transform=`translate(-50%,-50%) translate3d(0,${y*v.height}px,0)`;
      el.style.setProperty('--v2-node-alpha',d<9.5?'1':'0');
      el.style.setProperty('--v2-node-focus','1');
      if(el.matches('button')){
        el.dataset.v2Active=readable?'true':'false';el.tabIndex=readable?0:-1;
        el.setAttribute('aria-hidden',String(!readable));
        if(readable)active=el.dataset.caseId;
      }
    });
    legacy.style.opacity='0';
    legacy.inert=true;
    archive.style.opacity=String(writing);
    archive.inert=d<9.5;
    const t=(d-10.45)/2.05;
    heading.style.opacity=String(smooth((d-9.5)/.35)*(1-smooth((d-9.95)/.35)));
    const sway=reduced?0:Math.sin(t*Math.PI)*v.width*.045;
    scene.style.transform=`translate3d(${-sway*.06}px,0,0) scale(1.015)`;
    covers.forEach((el,i)=>{
      const phase=t-i;
      const side=i%2===0?1:-1;
      const z=phase<0?phase*1050:phase*470+phase*phase*420;
      const lane=v.width*(v.width<760?.11:.205);
      const x=side*lane-sway;
      const alpha=smooth((phase+3)/1.4)*(1-smooth((phase-.4)/.65));
      const selected=phase>-.5&&phase<.72&&d>=9.5;
      const focus=1-smooth(Math.abs(phase)/1.5);
      el.style.transform=`translate(-50%,-50%) translate3d(${x}px,0,calc(${Math.min(1000,z)}px + var(--writing-hover-z, 0px))) rotateY(${reduced?0:-side*2}deg) scale(var(--writing-hover-scale, 1))`;
      el.style.opacity=String(smooth((d-9.5)/.5)*alpha*(.24+.76*focus));
      el.style.zIndex=String(10-i);
      el.dataset.writingCurrent=String(selected);
      el.style.visibility=alpha>.001&&phase<1.05?'visible':'hidden';
      el.style.pointerEvents=selected?'auto':'none';
      el.tabIndex=selected?0:-1;el.setAttribute('aria-hidden',String(!selected));
    });
    const contactAlpha=smooth((d-18.2)/.7);
    contact.style.opacity=String(contactAlpha);
    contact.style.transform=`translate(-50%,-50%) translateY(${(1-contactAlpha)*20}px)`;
    contact.inert=contactAlpha<.8;
    tracker.clearCinematicTarget();
    tracker.clearCinematicHeading();
    tracker.setDiveBounds({minX:50,maxX:v.width-50,minY:65,maxY:v.height-55,hardMinY:65,hardMaxY:v.height-55});
    return active;
  }};
};
