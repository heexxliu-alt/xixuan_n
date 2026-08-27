(() => {
  const FRAME_COUNT = 36;
  const ROTATION_SECONDS = 30;
  const states = ['day', 'sunset', 'blue-hour'];
  const frameLabel = document.querySelector('[data-current-frame]');
  const rotationButton = document.querySelector('[data-rotation-toggle]');
  const haloButton = document.querySelector('[data-halo-toggle]');
  const statusLabel = document.querySelector('[data-preview-status]');
  const root = document.documentElement;
  const rotations = [];
  let rotationOn = true;
  let haloOn = true;
  let startedAt = performance.now();

  const framePath = (state, index) => `assets/planet-final/${state}/planet-${state}-${String(index + 1).padStart(3, '0')}.webp`;

  document.querySelectorAll('[data-planet-rotation]').forEach((figure) => {
    const state = figure.dataset.planetRotation;
    const image = figure.querySelector('img');
    image.alt = `${state} planet rotation frame`;
    rotations.push({ state, image });
  });

  const setFrame = (index) => {
    const frame = ((index % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT;
    rotations.forEach(({ state, image }) => { image.src = framePath(state, frame); });
    frameLabel.textContent = `${String(frame + 1).padStart(2, '0')} / ${FRAME_COUNT}`;
  };

  const tick = (now) => {
    if (rotationOn) {
      const elapsed = now - startedAt;
      setFrame(Math.floor((elapsed / (ROTATION_SECONDS * 1000)) * FRAME_COUNT));
    }
    requestAnimationFrame(tick);
  };

  rotationButton.addEventListener('click', () => {
    rotationOn = !rotationOn;
    rotationButton.setAttribute('aria-pressed', String(rotationOn));
    rotationButton.textContent = `ROTATION ${rotationOn ? 'ON' : 'OFF'}`;
    if (rotationOn) startedAt = performance.now() - (Number(frameLabel.textContent.split('/')[0]) - 1) / FRAME_COUNT * ROTATION_SECONDS * 1000;
  });

  haloButton.addEventListener('click', () => {
    haloOn = !haloOn;
    root.classList.toggle('halo-off', !haloOn);
    haloButton.setAttribute('aria-pressed', String(haloOn));
    haloButton.textContent = `HALO ${haloOn ? 'ON' : 'OFF'}`;
  });

  const preload = async () => {
    const sources = [];
    states.forEach((state) => {
      for (let i = 0; i < FRAME_COUNT; i++) sources.push(framePath(state, i));
    });
    await Promise.all(sources.map((src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = async () => {
        try { if (image.decode) await image.decode(); } catch (_) { /* decoded by browser */ }
        resolve();
      };
      image.onerror = reject;
      image.src = src;
    })));
  };

  rotationButton.disabled = true;
  haloButton.disabled = true;
  statusLabel.textContent = 'PRELOADING 108 FRAMES…';
  preload().then(() => {
    setFrame(0);
    rotationButton.disabled = false;
    haloButton.disabled = false;
    statusLabel.textContent = 'READY · PRELOADED';
    requestAnimationFrame(tick);
  }).catch((error) => {
    statusLabel.textContent = 'ASSET LOAD ERROR';
    console.error('Planet preview preload failed', error);
  });
})();
