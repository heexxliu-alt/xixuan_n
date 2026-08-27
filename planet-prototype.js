(() => {
  const gs = window.gsap;
  const FRAME_COUNT = 24;
  const FRAME_PATH = 'assets/planet-prototype/planet-';
  const FRAME_DIGITS = 2;
  const CENTER_FRAME = 8;
  const ROTATION_SECONDS = 30;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const shell = document.querySelector('.prototype-shell');
  const stage = document.querySelector('.prototype-stage');
  const bodyShell = document.querySelector('.planet-body-shell');
  const canvas = document.querySelector('#planet-canvas');
  const ctx = canvas?.getContext('2d');
  const halo = document.querySelector('.planet-halo');
  const atmosphere = document.querySelector('.planet-atmosphere');
  const loadingStatus = document.querySelector('#loading-status');
  const frameStatus = document.querySelector('#frame-status');
  const fpsStatus = document.querySelector('#fps-status');
  const timeStatus = document.querySelector('#time-status');
  const interactionStatus = document.querySelector('#interaction-status');
  if (!shell || !stage || !bodyShell || !canvas || !ctx) return;

  // Reuse the production Surface View time controller. The prototype only
  // supplies the hotspot surface; it never creates a second time state loop.
  const timeSystem = typeof window.initSurfaceTimeSystem === 'function'
    ? window.initSurfaceTimeSystem(shell, { feedback: false })
    : null;
  const timeLabels = { day: 'DAY', sunset: 'SUNSET', 'blue-hour': 'BLUE HOUR' };
  const syncTimeStatus = (event) => {
    const state = event?.detail?.state || timeSystem?.getState?.() || shell.dataset.time || 'day';
    if (timeStatus) timeStatus.textContent = timeLabels[state] || state.toUpperCase();
  };
  shell.addEventListener('surface:timechange', syncTimeStatus);
  syncTimeStatus();

  const planetSequence = { frame: 0 };
  const frames = Array.from({ length: FRAME_COUNT }, () => null);
  let renderedIndex = -1;
  let loadedFrames = 0;
  let failedFrames = 0;
  let ready = false;
  let rotationTween = null;
  let haloBreathingTween = null;
  let atmosphereBreathingTween = null;

  const setLoadingStatus = () => {
    if (!loadingStatus) return;
    const prefix = ready ? 'READY' : 'LOADING';
    loadingStatus.textContent = `${prefix} ${loadedFrames}/${FRAME_COUNT}${failedFrames ? ` · ${failedFrames} FALLBACK` : ''}`;
  };

  const nearestLoadedFrame = (index) => {
    if (frames[index]) return frames[index];
    for (let distance = 1; distance < FRAME_COUNT; distance += 1) {
      const left = (index - distance + FRAME_COUNT) % FRAME_COUNT;
      const right = (index + distance) % FRAME_COUNT;
      if (frames[left]) return frames[left];
      if (frames[right]) return frames[right];
    }
    return null;
  };

  // Progress only moves forward. Crossfading adjacent fixed-size frames keeps
  // the diagnostic sequence continuous without adding any spatial interaction.
  const renderSequence = () => {
    const progress = ((planetSequence.frame % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT;
    const frameA = Math.floor(progress);
    const frameB = (frameA + 1) % FRAME_COUNT;
    const blend = progress - frameA;
    const imageA = nearestLoadedFrame(frameA);
    const imageB = nearestLoadedFrame(frameB);
    ctx.clearRect(0, 0, 512, 512);
    if (imageA) {
      ctx.globalAlpha = 1 - blend;
      ctx.drawImage(imageA, 0, 0, 512, 512);
    }
    if (imageB && blend > 0) {
      ctx.globalAlpha = blend;
      ctx.drawImage(imageB, 0, 0, 512, 512);
    }
    ctx.globalAlpha = 1;
    if (frameA !== renderedIndex) {
      renderedIndex = frameA;
      if (frameStatus) frameStatus.textContent = `FRAME ${String(frameA).padStart(FRAME_DIGITS, '0')}/${FRAME_COUNT - 1}`;
    }
  };

  const startRotation = () => {
    if (!ready || reducedMotion || !gs) return;
    if (rotationTween) rotationTween.kill();
    planetSequence.frame = 0;
    renderSequence();
    // Linear loop only: no delay, repeatDelay, yoyo, pause, or waiting step.
    rotationTween = gs.to(planetSequence, {
      frame: FRAME_COUNT,
      duration: ROTATION_SECONDS,
      ease: 'none',
      repeat: -1,
      onUpdate: renderSequence
    });
  };

  // Glow is a separate, deliberately asynchronous loop. It never shares the
  // rotation tween, frame object, callbacks, or lifecycle with the sequence.
  const startGlowBreathing = () => {
    if (!gs || reducedMotion) return;
    if (halo) {
      haloBreathingTween?.kill();
      haloBreathingTween = gs.to(halo, {
        opacity: .28,
        duration: 5.8,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1
      });
    }
    if (atmosphere) {
      atmosphereBreathingTween?.kill();
      atmosphereBreathingTween = gs.to(atmosphere, {
        opacity: .22,
        duration: 7.1,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1
      });
    }
  };

  const loadFrame = (index) => new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      frames[index] = image;
      loadedFrames += 1;
      setLoadingStatus();
      resolve();
    };
    image.onerror = () => {
      failedFrames += 1;
      loadedFrames += 1;
      setLoadingStatus();
      resolve();
    };
    image.src = `${FRAME_PATH}${String(index).padStart(FRAME_DIGITS, '0')}.webp`;
  });

  const startFpsMeter = () => {
    let sampleFrames = 0;
    let lastStamp = performance.now();
    const tick = (stamp) => {
      sampleFrames += 1;
      if (stamp - lastStamp >= 700) {
        if (fpsStatus) fpsStatus.textContent = `FPS ${Math.round(sampleFrames * 1000 / (stamp - lastStamp))}`;
        sampleFrames = 0;
        lastStamp = stamp;
      }
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  };

  const preloadPlanetFrames = async () => {
    await Promise.all(Array.from({ length: FRAME_COUNT }, (_, index) => loadFrame(index)));
    ready = loadedFrames > failedFrames;
    shell.dataset.status = ready ? 'ready' : 'error';
    setLoadingStatus();
    if (reducedMotion) planetSequence.frame = CENTER_FRAME;
    renderSequence();
    if (!ready) return;
    if (reducedMotion) {
      if (interactionStatus) interactionStatus.textContent = 'REDUCED MOTION';
      return;
    }
    if (gs) {
      startRotation();
      startGlowBreathing();
    } else if (interactionStatus) {
      interactionStatus.textContent = 'GSAP UNAVAILABLE';
    }
  };

  if (interactionStatus) interactionStatus.textContent = timeSystem ? 'CLICK ENABLED' : 'TIME UNAVAILABLE';
  startFpsMeter();
  preloadPlanetFrames();

  // Stub only. The formal homepage time system is intentionally untouched.
  window.playPlanetTransition = (targetState) => ({ targetState, prototypeOnly: true });
})();
