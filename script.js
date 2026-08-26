/*
 * Shared interaction layer for the surface and dive scenes.
 * Details/cards are deliberately outside .cursor-layer and are never queried
 * by the pointer tracker.
 */
(() => {
  const gs = window.gsap;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (gs && window.MorphSVGPlugin) gs.registerPlugin(window.MorphSVGPlugin);

  class DiverPointerTracker {
    constructor(root, swimmer) {
      this.root = root;
      this.swimmer = swimmer;
      this.layer = root.querySelector('.cursor-layer');
      this.light = this.layer?.querySelector('.cursor-light');
      this.glow = this.layer?.querySelector('.glow');
      this.motes = [...(this.layer?.querySelectorAll('.trail i') || [])];
      this.box = root.getBoundingClientRect();
      const start = swimmer ? swimmer.getBoundingClientRect() : { left: this.box.width * .5, top: this.box.height * .52, width: 0, height: 0 };
      this.target = { x: start.left - this.box.left + start.width / 2, y: start.top - this.box.top + start.height / 2 };
      this.position = { ...this.target };
      this.previous = { ...this.position };
      this.heading = -180;
      this.history = Array.from({ length: 34 }, () => ({ ...this.position }));
      this.trailIndexes = [3, 8, 14, 19, 25, 31];
      // Normalize percentage-based initial positions to pixel coordinates before
      // the pointer setters start writing left/top; otherwise GSAP can interpret
      // the initial percentage values as layout offsets.
      if (gs && swimmer) gs.set(swimmer, { left: this.target.x, top: this.target.y, xPercent: -50, yPercent: -50 });
      this.setter = (el, prop, unit = 'px') => gs && el ? gs.quickSetter(el, prop, unit) : null;
      this.quickLightX = this.setter(this.light, 'left');
      this.quickLightY = this.setter(this.light, 'top');
      this.quickGlowX = this.setter(this.glow, 'left');
      this.quickGlowY = this.setter(this.glow, 'top');
      this.quickMoteX = this.motes.map((el) => this.setter(el, 'left'));
      this.quickMoteY = this.motes.map((el) => this.setter(el, 'top'));
      this.quickDiverX = this.setter(swimmer, 'left');
      this.quickDiverY = this.setter(swimmer, 'top');
      this.quickDiverRotation = this.setter(swimmer, 'rotation', 'deg');
      this.onPointerMove = this.onPointerMove.bind(this);
      this.tick = this.tick.bind(this);
      root.addEventListener('pointermove', this.onPointerMove, { passive: true });
      this.renderPosition(this.target.x, this.target.y);
      if (gs) gs.ticker.add(this.tick); else this.raf = requestAnimationFrame(this.tick);
    }

    refreshBox() { this.box = this.root.getBoundingClientRect(); }

    onPointerMove(event) {
      this.refreshBox();
      this.target.x = clamp(event.clientX - this.box.left, 0, this.box.width);
      this.target.y = clamp(event.clientY - this.box.top, 0, this.box.height);
      this.root.style.setProperty('--focus-x', `${(this.target.x / Math.max(1, this.box.width)) * 100}%`);
      this.root.style.setProperty('--focus-y', `${(this.target.y / Math.max(1, this.box.height)) * 100}%`);
      this.renderPosition(this.target.x, this.target.y);
    }

    setPosition(el, left, top) {
      if (!el) return;
      if (gs) gs.set(el, { left, top });
      else { el.style.left = `${left}px`; el.style.top = `${top}px`; }
    }

    renderPosition(x, y) {
      if (this.quickLightX) this.quickLightX(x); else this.setPosition(this.light, x, y);
      if (this.quickLightY) this.quickLightY(y);
      if (this.quickGlowX) this.quickGlowX(x); else this.setPosition(this.glow, x, y);
      if (this.quickGlowY) this.quickGlowY(y);
    }

    tick() {
      this.position.x += (this.target.x - this.position.x) * .18;
      this.position.y += (this.target.y - this.position.y) * .18;
      if (this.swimmer) {
        const dx = this.position.x - this.previous.x;
        const dy = this.position.y - this.previous.y;
        if (Math.hypot(dx, dy) > .18) {
          let next = Math.atan2(dy, dx) * 180 / Math.PI - 180;
          while (next - this.heading > 180) next -= 360;
          while (next - this.heading < -180) next += 360;
          this.heading = next;
          this.previous.x = this.position.x;
          this.previous.y = this.position.y;
        }
        if (this.quickDiverX) this.quickDiverX(this.position.x); else this.swimmer.style.left = `${this.position.x}px`;
        if (this.quickDiverY) this.quickDiverY(this.position.y); else this.swimmer.style.top = `${this.position.y}px`;
        if (this.quickDiverRotation) this.quickDiverRotation(this.heading); else this.swimmer.style.transform = `translate(-50%,-50%) rotate(${this.heading}deg)`;
      }
      this.history.unshift({ ...this.position });
      this.history.length = 34;
      this.motes.forEach((mote, index) => {
        const point = this.history[this.trailIndexes[index]] || this.position;
        if (this.quickMoteX[index]) this.quickMoteX[index](point.x); else mote.style.left = `${point.x}px`;
        if (this.quickMoteY[index]) this.quickMoteY[index](point.y); else mote.style.top = `${point.y}px`;
      });
      if (!gs) this.raf = requestAnimationFrame(this.tick);
    }

    getPosition() { return { ...this.position }; }

    destroy() {
      this.root.removeEventListener('pointermove', this.onPointerMove);
      if (gs) gs.ticker.remove(this.tick); else cancelAnimationFrame(this.raf);
    }
  }

  function initSurfaceEffects(surface) {
    const bubbleField = surface.querySelector('.surface-bubbles');
    const skyDetails = surface.querySelector('.sky-details');
    const waveLayer = surface.querySelector('.surface-wave-layer');
    if (skyDetails && !skyDetails.children.length) {
      for (let i = 0; i < 5; i += 1) {
        const cloud = document.createElement('i');
        cloud.className = 'sky-cloud';
        cloud.style.setProperty('--cloud-x', `${8 + i * 22}%`);
        cloud.style.setProperty('--cloud-y', `${9 + (i % 2) * 8}%`);
        skyDetails.appendChild(cloud);
      }
      for (let i = 0; i < 16; i += 1) {
        const star = document.createElement('i');
        star.className = 'sky-star';
        star.style.left = `${7 + Math.random() * 86}%`;
        star.style.top = `${5 + Math.random() * 36}%`;
        skyDetails.appendChild(star);
      }
    }
    if (bubbleField && !bubbleField.children.length) {
      for (let i = 0; i < 17; i += 1) {
        const bubble = document.createElement('i');
        bubble.className = 'surface-bubble';
        bubble.style.left = `${5 + Math.random() * 90}%`;
        bubble.style.width = `${5 + Math.random() * 16}px`;
        bubble.style.height = bubble.style.width;
        bubble.style.setProperty('--bubble-drift', `${-18 + Math.random() * 36}px`);
        bubble.style.setProperty('--bubble-index', i);
        bubbleField.appendChild(bubble);
      }
    }
    if (!gs || reducedMotion) return;
    gs.utils.toArray('.sky-cloud', skyDetails).forEach((cloud, index) => {
      gs.to(cloud, { x: index % 2 ? 72 : -64, y: index % 2 ? 6 : -3, duration: (20 + index * 4) / 2, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: index * -.8 });
    });
    gs.utils.toArray('.sky-star', skyDetails).forEach((star, index) => {
      gs.to(star, { opacity: .2 + Math.random() * .8, scale: .75 + Math.random() * .55, duration: 1.9 + Math.random() * 2.2, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: index * .13 });
    });
    gs.utils.toArray('.surface-bubble', bubbleField).forEach((bubble, index) => {
      const duration = 3 + Math.random() * 4;
      const startScale = .3 + Math.random() * .9;
      const endScale = .75 + Math.random() * .45;
      const endOpacity = .35 + Math.random() * .65;
      const delay = -Math.random() * duration;
      const rise = gs.timeline({ repeat: -1, delay });
      rise.fromTo(bubble, { y: '18vh', opacity: 0, scale: startScale }, { y: '-72vh', opacity: endOpacity, scale: endScale, duration, ease: 'sine.inOut' }, 0)
        .to(bubble, { opacity: 0, duration: .42, ease: 'power1.in' }, Math.max(.2, duration - .42));
      gs.fromTo(bubble, { x: -15 }, { x: 15, duration: duration * .5, repeat: -1, yoyo: true, delay, ease: 'sine.inOut' });
    });
    const fills = waveLayer ? [...waveLayer.querySelectorAll('.surface-wave-fill,.surface-wave-sheen')] : [];
    const morphTargets = [
      'M0,34 C120,-18 250,92 430,20 C610,-28 760,98 930,18 C1110,-24 1260,94 1440,12 L1440,360 L0,360 Z',
      'M0,70 C150,10 276,112 438,34 C622,-12 770,112 940,26 C1118,-18 1262,106 1440,20 L1440,360 L0,360 Z'
    ];
    fills.forEach((fill, index) => {
      const duration = index ? 4.8 : 3.8;
      if (window.MorphSVGPlugin) {
        gs.to(fill, { morphSVG: { shape: morphTargets[index] }, duration, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: index * -.42 });
      } else {
        gs.to(fill, { y: index ? 7 : 9, scaleY: index ? 1.08 : 1.1, transformOrigin: '50% 0%', duration, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: index * -.42 });
      }
    });
    const underwater = surface.querySelector('.title-underwater');
    if (underwater) gs.to(underwater, { x: 3, skewX: -2.5, scaleY: 1.02, duration: 4.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  }

  function playDiveTransition(entry) {
    const surface = document.querySelector('.surface-hero');
    const layer = surface?.querySelector('.transition-layer');
    if (!surface || !layer || layer.dataset.playing === 'true') return;
    layer.dataset.playing = 'true';
    const waves = [...layer.querySelectorAll('.transition-wave')];
    const emoji = layer.querySelector('.transition-emoji');
    const ui = surface.querySelectorAll('.site-nav,.home-copy,.caption,.dive-entry');
    if (!gs) {
      document.body.classList.add('is-transitioning');
      layer.style.display = 'block';
      window.setTimeout(() => { window.location.assign(entry.href); }, 3200);
      return;
    }
    gs.set(layer, { display: 'block', autoAlpha: 1 });
    gs.set(waves, { yPercent: 100, transformOrigin: '50% 100%', opacity: 0 });
    gs.set(emoji, { autoAlpha: 0, xPercent: -50, yPercent: -50, scale: .38, rotation: -10 });
    const tl = gs.timeline({ defaults: { ease: 'power2.out' }, onComplete: () => window.location.assign(entry.href) });
    const morphTargets = [
      'M0 0 C16 8 29 2 44 7 C61 12 76 0 100 5 L100 100 L0 100 Z',
      'M0 0 C14 11 31 3 49 10 C68 17 79 6 100 15 L100 100 L0 100 Z',
      'M0 0 C20 5 39 14 56 6 C74 -2 84 18 100 10 L100 100 L0 100 Z'
    ];
    tl.to(ui, { autoAlpha: 0, filter: 'blur(4px)', duration: .3, stagger: .02 }, 0)
      .to(waves, { opacity: .96, duration: .3, stagger: .24, ease: 'sine.out' }, 0)
      .to(waves, { yPercent: 0, duration: 1.45, stagger: .24, ease: 'power2.out' }, .08)
      .to(emoji, { autoAlpha: 1, scale: .86, duration: .45, ease: 'elastic.out(1, .48)' }, .3)
      .to(emoji, { yPercent: -58, scale: 1.02, rotation: 3, duration: .7, ease: 'sine.inOut', yoyo: true, repeat: 1 }, .55)
      .to(waves, { yPercent: -4, duration: .38, stagger: .24, ease: 'sine.inOut' }, 1.35)
      .to(waves, { yPercent: 0, duration: .7, stagger: .24, ease: 'power1.inOut' }, 1.95)
      .to(emoji, { autoAlpha: 0, scale: .18, duration: .35, ease: 'power2.in' }, 2.12);
    if (window.MorphSVGPlugin) waves.forEach((wave, index) => {
      tl.to(wave, { morphSVG: { shape: morphTargets[index] }, duration: 1.25, ease: 'sine.inOut' }, .12 + index * .24);
    });
  }

  function playJellyClick(link, done) {
    if (!link || link.dataset.clicking === 'true') return;
    link.dataset.clicking = 'true';
    link.classList.remove('is-clicking');
    void link.offsetWidth;
    link.classList.add('is-clicking');
    const art = link.querySelector('img');
    const finish = () => {
      link.classList.remove('is-clicking');
      link.dataset.clicking = 'false';
      done?.();
    };
    if (!gs || !art || reducedMotion) {
      window.setTimeout(finish, 260);
      return;
    }
    gs.timeline({ onComplete: finish })
      .to(art, { scale: 1.2, duration: .16, ease: 'power2.out', overwrite: 'auto' })
      .to(art, { scale: 1, duration: .38, ease: 'elastic.out(1, .52)', overwrite: 'auto' });
  }

  const PROFILE_DATA = {
    content: {
      index: '01', kicker: 'CONTENT & PR', title: '内容与公关',
      tabs: [
        { label: '新闻稿', works: [['品牌叙事', '把复杂信息写成清晰的故事'], ['发布节奏', '从标题到落地页的完整编排']] },
        { label: '热点策划', works: [['话题捕捉', '从热度里找到可用的切口'], ['内容矩阵', '让一次表达延伸成多次触达']] },
        { label: '媒体沟通', works: [['关系维护', '建立准确、及时的沟通链路'], ['口径整理', '在不同语境里保持同一条主线']] }
      ], summary: '新闻稿、热点内容、媒体沟通与内容表达。'
    },
    logbook: {
      index: '02', kicker: 'PERSONAL ARCHIVE', title: '个人介绍',
      tabs: [
        { label: '经历', works: [['路径', '从传播现场走向整合策划'], ['积累', '把每次项目沉淀成方法']] },
        { label: '方向', works: [['关注', '内容、品牌与人的真实连接'], ['下一站', '继续绘制更大的海图']] },
        { label: '自述', works: [['关键词', '好奇、耐心、能把事做完'], ['工作观', '让表达抵达，也让结果留下']] }
      ], summary: '经历、方向与正在靠近的下一片海。'
    },
    communications: {
      index: '03', kicker: 'INTEGRATED COMMS', title: '整合传播',
      tabs: [
        { label: '策略', works: [['洞察', '找到人和品牌之间的真实张力'], ['主张', '把方向翻译成可执行的语言']] },
        { label: '创意', works: [['概念', '让抽象命题拥有可感知的形状'], ['叙事', '为不同触点建立同一世界观']] },
        { label: '执行', works: [['协同', '让内容、媒介与团队顺畅接力'], ['复盘', '从反馈里校准下一次出发']] }
      ], summary: '从每一次出发，绘出更大的海图。'
    },
    tools: {
      index: '04', kicker: 'SKILLS & TOOLS', title: '技能与工具',
      tabs: [
        { label: '内容', works: [['写作', '新闻稿、脚本与社交内容'], ['视觉', 'Figma、Canva 与基础动效']] },
        { label: '传播', works: [['项目', '策略拆解、排期与协作推进'], ['数据', '用反馈判断内容是否抵达']] },
        { label: '工作流', works: [['整理', '把信息变成清楚的系统'], ['交付', '在细节里保持稳定与速度']] }
      ], summary: '让想法抵岸的每一件工具，都在这里慢慢发亮。'
    },
    insight: {
      index: '05', kicker: 'INSIGHT & OPERATIONS', title: '洞察与运营',
      tabs: [
        { label: '洞察', works: [['观察', '从用户、语境与趋势里找线索'], ['判断', '把零散信号收束成方向']] },
        { label: '运营', works: [['节奏', '让内容在正确的时间出现'], ['增长', '在持续迭代里积累有效触达']] },
        { label: '复盘', works: [['指标', '关注结果，也关注过程质量'], ['沉淀', '把一次经验变成可复用资产']] }
      ], summary: '在潮汐的起落里，寻找下一次抵达的方向。'
    }
  };

  function initDivePage(world) {
    const swimmer = world.querySelector('.swimmer');
    const tracker = new DiverPointerTracker(world, swimmer);
    const stations = [...world.querySelectorAll('.station')];
    const info = world.querySelector('.site-info');
    const infoIcon = info?.querySelector('.site-info-icon');
    const infoIndex = info?.querySelector('.site-info-index');
    const infoKicker = info?.querySelector('.site-info-kicker');
    const infoTitle = info?.querySelector('.site-info-title');
    const infoTabs = info?.querySelector('.site-info-tabs');
    const infoWorks = info?.querySelector('.site-info-works');
    const infoSummary = info?.querySelector('.site-info-summary');
    const infoClose = info?.querySelector('.site-info-close');
    let activeStation = null;
    let stationHovered = false;
    let cardHovered = false;
    let hideTimer = 0;
    const maxDistance = 220;
    const maxScale = 1.28;
    const jelly = world.querySelector('.jelly-return');
    const jellyFloat = jelly?.querySelector('.jelly-float');
    const rays = world.querySelector('.dive-rays');
    if (gs && jellyFloat && !reducedMotion) gs.to(jellyFloat, { y: -15, duration: 3, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    if (gs && rays && !reducedMotion) gs.to(rays, { opacity: .8, skewX: 1.5, duration: 5.5, repeat: -1, yoyo: true, ease: 'sine.inOut' });

    const updateStationScale = (event) => {
      const box = world.getBoundingClientRect();
      const mouseX = event.clientX - box.left;
      const mouseY = event.clientY - box.top;
      stations.forEach((station) => {
        const rect = station.getBoundingClientRect();
        const centerX = rect.left - box.left + rect.width / 2;
        const centerY = rect.top - box.top + rect.height / 2;
        const distance = Math.hypot(mouseX - centerX, mouseY - centerY);
        const proximity = gs ? gs.utils.clamp(0, 1, gs.utils.mapRange(0, maxDistance, 1, 0, distance)) : clamp(1 - distance / maxDistance, 0, 1);
        const targetScale = 1 + (maxScale - 1) * proximity;
        station.style.setProperty('--proximity', proximity.toFixed(3));
        if (gs) gs.to(station, { scale: targetScale, y: -proximity * 6, duration: .3, overwrite: 'auto', ease: 'power2.out' });
        else station.style.transform = `translateY(${-proximity * 6}px) scale(${targetScale})`;
      });
    };
    const resetStationScale = () => stations.forEach((station) => {
      station.style.setProperty('--proximity', 0);
      if (gs) gs.to(station, { scale: 1, y: 0, duration: .45, overwrite: 'auto', ease: 'power2.out' });
      else station.style.transform = 'translateY(0) scale(1)';
    });
    world.addEventListener('pointermove', updateStationScale, { passive: true });
    world.addEventListener('pointerleave', resetStationScale);

    const profileKey = (station) => [...station.classList].find((name) => PROFILE_DATA[name]) || 'content';
    const renderProfile = (station, tabIndex = 0) => {
      if (!info) return;
      const key = profileKey(station);
      const profile = PROFILE_DATA[key];
      const index = Math.max(0, Math.min(profile.tabs.length - 1, tabIndex));
      info.dataset.theme = key;
      info.dataset.tabIndex = String(index);
      if (infoIndex) infoIndex.textContent = `/ ${profile.index} /`;
      if (infoKicker) infoKicker.textContent = profile.kicker;
      if (infoTitle) infoTitle.textContent = profile.title;
      if (infoIcon) {
        infoIcon.src = station.querySelector('.station-original')?.getAttribute('src') || infoIcon.src;
        infoIcon.alt = profile.title;
      }
      if (infoTabs) infoTabs.innerHTML = profile.tabs.map((tab, i) => `<button class="site-info-tab${i === index ? ' is-active' : ''}" type="button" role="tab" aria-selected="${i === index}" data-tab-index="${i}">${tab.label}</button>`).join('');
      if (infoWorks) infoWorks.innerHTML = profile.tabs[index].works.map(([title, body]) => `<article class="site-info-work"><b>${title}</b><span>${body}</span></article>`).join('');
      if (infoSummary) infoSummary.textContent = profile.summary;
    };
    const reveal = (station) => {
      if (!info) return;
      window.clearTimeout(hideTimer);
      const box = world.getBoundingClientRect();
      const rect = station.getBoundingClientRect();
      const width = info.getBoundingClientRect().width || Math.min(390, Math.max(292, box.width - 40));
      let left = rect.right - box.left + 18;
      if (left + width > box.width - 20) left = rect.left - box.left - width - 18;
      renderProfile(station, Number(info.dataset.tabIndex) || 0);
      const infoHeight = Math.max(260, info.offsetHeight || 294);
      const top = clamp(rect.top - box.top - 12, 74, Math.max(74, box.height - infoHeight - 24));
      info.style.left = `${clamp(left, 20, Math.max(20, box.width - width - 20))}px`;
      info.style.top = `${top}px`;
      activeStation = station;
      info.classList.add('is-active');
      if (gs) gs.fromTo(info, { autoAlpha: 0, y: 8, scale: .95 }, { autoAlpha: 1, y: 0, scale: 1, duration: .24, overwrite: 'auto', ease: 'power2.out' });
    };
    window.addEventListener('resize', () => {
      if (activeStation) reveal(activeStation);
    }, { passive: true });
    const hideInfo = (immediate = false) => {
      if (!info || !activeStation) return;
      if (!immediate && (stationHovered || cardHovered)) return;
      activeStation = null;
      if (gs) {
        gs.to(info, { autoAlpha: 0, y: 8, scale: .95, duration: .18, overwrite: 'auto', ease: 'power2.in', onComplete: () => info.classList.remove('is-active') });
      } else info.classList.remove('is-active');
    };
    const scheduleHide = () => { window.clearTimeout(hideTimer); hideTimer = window.setTimeout(() => hideInfo(), 140); };
    infoTabs?.addEventListener('click', (event) => {
      const tab = event.target.closest('.site-info-tab');
      if (!tab || !activeStation) return;
      renderProfile(activeStation, Number(tab.dataset.tabIndex) || 0);
    });
    infoClose?.addEventListener('click', () => { stationHovered = false; cardHovered = false; hideInfo(true); });
    info?.addEventListener('pointerenter', () => { cardHovered = true; window.clearTimeout(hideTimer); });
    info?.addEventListener('pointerleave', () => { cardHovered = false; scheduleHide(); });
    world.addEventListener('pointerleave', () => { stationHovered = false; cardHovered = false; hideInfo(true); });
    stations.forEach((station) => {
      station.addEventListener('pointerenter', () => { stationHovered = true; station.dataset.pending = 'false'; reveal(station); });
      station.addEventListener('pointerleave', () => { stationHovered = false; station.dataset.pending = 'false'; scheduleHide(); });
      station.addEventListener('focus', () => { station.dataset.pending = 'false'; reveal(station); });
      station.addEventListener('blur', () => { stationHovered = false; scheduleHide(); });
      station.addEventListener('click', () => {
        const rect = station.getBoundingClientRect();
        const box = world.getBoundingClientRect();
        const x = rect.left - box.left + rect.width / 2;
        const y = rect.top - box.top + rect.height / 2;
        tracker.target.x = x;
        tracker.target.y = y;
        tracker.renderPosition(x, y);
        station.dataset.pending = 'false';
        reveal(station);
      });
    });
    const revealTicker = () => {
      const current = tracker.getPosition();
      const box = world.getBoundingClientRect();
      stations.forEach((station) => {
        if (station.dataset.pending !== 'true') return;
        const rect = station.getBoundingClientRect();
        const distance = Math.hypot(current.x - (rect.left - box.left + rect.width / 2), current.y - (rect.top - box.top + rect.height / 2));
        if (distance < 82) { reveal(station); station.dataset.pending = 'false'; }
      });
    };
    if (gs) gs.ticker.add(revealTicker); else window.setInterval(revealTicker, 80);
  }

  const surface = document.querySelector('.surface-hero');
  if (surface) {
    initSurfaceEffects(surface);
    new DiverPointerTracker(surface, surface.querySelector('.home-diver'));
    const entry = surface.querySelector('.dive-entry');
    entry?.addEventListener('click', (event) => { event.preventDefault(); playJellyClick(entry, () => playDiveTransition(entry)); });
  }
  const world = document.querySelector('.dive-world');
  if (world) {
    initDivePage(world);
    const returnJelly = world.querySelector('.jelly-return');
    returnJelly?.addEventListener('click', (event) => {
      event.preventDefault();
      playJellyClick(returnJelly, () => window.location.assign(returnJelly.href));
    });
  }
})();
