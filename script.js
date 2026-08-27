/*
 * Shared interaction layer for the surface and dive scenes.
 * Details/cards are deliberately outside .cursor-layer and are never queried
 * by the pointer tracker.
 */
(() => {
  const gs = window.gsap;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // The source PNG faces left and its body axis sits roughly 34deg nose-up.
  // Surface rotation is therefore expressed as a constrained pose around this
  // neutral heading instead of using the pointer's full atan2 angle.
  const DIVER_BASE_HEADING = -34;
  const DIVER_MAX_UNDERWATER_PITCH = 25;
  const DIVER_MAX_APPROACH_PITCH = 12;
  const DIVER_MAX_FOLLOW_PITCH = 5;
  const DIVER_FACING_THRESHOLD = .18;
  const DIVER_VERTICAL_INPUT_EASE = .06;
  const DIVER_VERTICAL_DEAD_ZONE = 28;
  const DIVER_MAX_POSE_DELTA = 1.1;
  if (gs && window.MorphSVGPlugin) gs.registerPlugin(window.MorphSVGPlugin);

  class DiverPointerTracker {
    constructor(root, swimmer) {
      this.root = root;
      this.swimmer = swimmer;
      this.isSurface = root.classList.contains('surface-hero');
      this.layer = root.querySelector('.cursor-layer');
      this.light = this.layer?.querySelector('.cursor-light');
      this.glow = this.layer?.querySelector('.glow');
      this.motes = [...(this.layer?.querySelectorAll('.trail i') || [])];
      this.box = root.getBoundingClientRect();
      this.bounds = { minX: 0, maxX: this.box.width, minY: 0, maxY: this.box.height, hardMinY: 0, hardMaxY: this.box.height };
      const start = swimmer ? swimmer.getBoundingClientRect() : { left: this.box.width * .5, top: this.box.height * .52, width: 0, height: 0 };
      this.pointerPosition = { x: start.left - this.box.left + start.width / 2, y: start.top - this.box.top + start.height / 2 };
      this.refreshMetrics();
      this.behaviorState = this.isSurface ? 'UNDERWATER' : 'FREE';
      this.surfaceProximity = 0;
      this.diverTarget = this.getDiverTarget(this.pointerPosition.x, this.pointerPosition.y);
      this.position = { ...this.diverTarget };
      this.previous = { ...this.position };
      this.velocity = { x: 0, y: 0, speed: 0 };
      this.heading = this.isSurface ? DIVER_BASE_HEADING : -180;
      this.poseAngle = 0;
      this.targetPoseAngle = 0;
      this.smoothedVerticalIntent = 0;
      this.followBlend = 0;
      this.facing = 'left';
      this.facingTarget = 'left';
      this.facingScale = 1;
      this.targetFacingScale = 1;
      this.turning = false;
      this.history = Array.from({ length: 34 }, () => ({ ...this.position }));
      this.trailIndexes = [3, 8, 14, 19, 25, 31];
      this.calm = false;
      this.calmFloat = 0;
      // Normalize percentage-based initial positions to pixel coordinates before
      // the pointer setters start writing left/top; otherwise GSAP can interpret
      // the initial percentage values as layout offsets.
      if (gs && swimmer) gs.set(swimmer, {
        left: '50%', top: '50%', xPercent: -50, yPercent: -50,
        x: this.position.x - this.box.width / 2,
        y: this.position.y - this.box.height / 2,
        rotation: this.heading,
        scaleX: this.facingScale
      });
      this.setter = (el, prop, unit = 'px') => gs && el ? gs.quickSetter(el, prop, unit) : null;
      this.quickLightX = this.setter(this.light, 'left');
      this.quickLightY = this.setter(this.light, 'top');
      this.quickGlowX = this.setter(this.glow, 'left');
      this.quickGlowY = this.setter(this.glow, 'top');
      this.quickMoteX = this.motes.map((el) => this.setter(el, 'left'));
      this.quickMoteY = this.motes.map((el) => this.setter(el, 'top'));
      this.quickDiverX = this.setter(swimmer, 'x');
      this.quickDiverY = this.setter(swimmer, 'y');
      this.quickDiverRotation = this.setter(swimmer, 'rotation', 'deg');
      this.quickDiverScaleX = this.setter(swimmer, 'scaleX', '');
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onResize = this.onResize.bind(this);
      this.tick = this.tick.bind(this);
      // Listen at the viewport level so the diver still chases the light when
      // the pointer is in the letterboxed margin around the 16:9 scene.
      window.addEventListener('pointermove', this.onPointerMove, { passive: true });
      window.addEventListener('mousemove', this.onPointerMove, { passive: true });
      window.addEventListener('resize', this.onResize, { passive: true });
      this.renderPosition(this.pointerPosition.x, this.pointerPosition.y);
      if (gs) gs.ticker.add(this.tick); else this.raf = requestAnimationFrame(this.tick);
    }

    refreshMetrics() {
      const width = this.swimmer?.offsetWidth || 125;
      const height = this.swimmer?.offsetHeight || 94;
      const halfW = width / 2;
      const halfH = height / 2;
      const sideInset = Math.max(22, halfW * .34);
      this.bounds = {
        minX: halfW + sideInset,
        maxX: Math.max(halfW + sideInset, this.box.width - halfW - sideInset),
        minY: this.isSurface ? this.box.height * .55 + halfH * .78 : halfH,
        maxY: this.isSurface ? this.box.height * .84 - halfH * .12 : Math.max(halfH, this.box.height - halfH),
        hardMinY: this.isSurface ? this.box.height * .505 + halfH * .72 : halfH,
        hardMaxY: this.isSurface ? this.box.height * .85 - halfH * .08 : Math.max(halfH, this.box.height - halfH)
      };
    }

    refreshBox() {
      this.box = this.root.getBoundingClientRect();
      this.refreshMetrics();
      this.diverTarget = this.getDiverTarget(this.pointerPosition.x, this.pointerPosition.y);
    }

    onResize() { this.refreshBox(); }

    softLimit(value, min, max, resistance = .1) {
      if (value < min) return min - (min - value) * resistance;
      if (value > max) return max + (value - max) * resistance;
      return value;
    }

    getDiverTarget(pointerX, pointerY) {
      if (!this.isSurface) return {
        x: clamp(pointerX, this.bounds.minX, this.bounds.maxX),
        y: clamp(pointerY, this.bounds.minY, this.bounds.maxY)
      };
      const waterline = this.box.height * .5;
      const approachStart = this.box.height * .62;
      const followY = this.box.height * .61;
      this.surfaceProximity = clamp((approachStart - pointerY) / Math.max(1, approachStart - waterline), 0, 1);
      const safeX = this.softLimit(pointerX, this.bounds.minX, this.bounds.maxX, .08);
      // Keep the visible boundary springy: the hard margin is only a final
      // safety net so the diver never disappears beyond the scene edge.
      const compressedX = clamp(safeX, this.bounds.minX - this.box.width * .045, this.bounds.maxX + this.box.width * .045);
      let state = 'UNDERWATER';
      let y;
      if (pointerY < waterline) {
        state = 'SURFACE_FOLLOW';
        const skyAmount = clamp((waterline - pointerY) / Math.max(1, waterline), 0, 1);
        y = followY + (1 - skyAmount) * this.box.height * .004;
      } else if (pointerY < approachStart) {
        state = 'SURFACE_APPROACH';
        const approach = clamp((approachStart - pointerY) / Math.max(1, approachStart - waterline), 0, 1);
        y = followY + approach * this.box.height * .035;
      } else {
        y = this.softLimit(pointerY, this.bounds.minY, this.bounds.maxY, .1);
      }
      this.behaviorState = state;
      return { x: compressedX, y: clamp(y, this.bounds.hardMinY, this.bounds.hardMaxY) };
    }

    onPointerMove(event) {
      this.refreshBox();
      const rawX = clamp(event.clientX - this.box.left, 0, this.box.width);
      const rawY = clamp(event.clientY - this.box.top, 0, this.box.height);
      this.pointerPosition.x = rawX;
      this.pointerPosition.y = rawY;
      this.diverTarget = this.getDiverTarget(rawX, rawY);
      this.root.style.setProperty('--focus-x', `${(rawX / Math.max(1, this.box.width)) * 100}%`);
      this.root.style.setProperty('--focus-y', `${(rawY / Math.max(1, this.box.height)) * 100}%`);
      this.renderPosition(this.pointerPosition.x, this.pointerPosition.y);
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

    renderDiver() {
      if (!this.swimmer) return;
      const calmY = this.calm ? Math.sin(performance.now() * .0012) * 1.8 : 0;
      this.calmFloat = calmY;
      const offsetX = this.position.x - this.box.width / 2;
      const offsetY = this.position.y - this.box.height / 2 + calmY;
      const surfaceFacingSign = this.facingScale < 0 ? -1 : 1;
      // Mirroring the PNG also mirrors its intrinsic ~34deg body tilt. Apply
      // the neutral heading compensation in the same facing space so LEFT and
      // RIGHT share a horizontal neutral pose; pitch remains mirrored around
      // that facing-specific baseline.
      const surfaceBaseHeading = DIVER_BASE_HEADING * surfaceFacingSign;
      const surfaceRotation = surfaceBaseHeading + this.poseAngle * surfaceFacingSign;
      const rotation = this.isSurface ? surfaceRotation : this.heading;
      if (this.quickDiverX) this.quickDiverX(offsetX); else this.swimmer.style.transform = `translate(-50%,-50%) translate3d(${offsetX}px,${offsetY}px,0) rotate(${rotation}deg) scaleX(${this.facingScale})`;
      if (this.quickDiverY) this.quickDiverY(offsetY);
      if (this.quickDiverRotation) this.quickDiverRotation(rotation);
      if (this.quickDiverScaleX) this.quickDiverScaleX(this.isSurface ? this.facingScale : 1);
    }

    updateSurfacePose() {
      const speed = this.velocity.speed;
      const horizontalSpeed = this.velocity.x;
      if (Math.abs(horizontalSpeed) > DIVER_FACING_THRESHOLD) {
        const nextFacing = horizontalSpeed > 0 ? 'right' : 'left';
        if (nextFacing !== this.facingTarget) {
          this.facingTarget = nextFacing;
          this.targetFacingScale = nextFacing === 'right' ? -1 : 1;
          this.turning = true;
        }
      }
      const facingEase = this.turning ? .14 : .2;
      this.facingScale += (this.targetFacingScale - this.facingScale) * facingEase;
      if (Math.abs(this.targetFacingScale - this.facingScale) < .025) {
        this.facingScale = this.targetFacingScale;
        this.facing = this.facingTarget;
        this.turning = false;
      }

      // Pose follows a filtered target-position intent rather than the current
      // frame's velocity. This prevents a quick pointer reversal from flipping
      // the diver's pitch in a single update.
      const rawVerticalIntent = this.diverTarget.y - this.position.y;
      this.smoothedVerticalIntent += (rawVerticalIntent - this.smoothedVerticalIntent) * DIVER_VERTICAL_INPUT_EASE;
      const intentMagnitude = Math.abs(this.smoothedVerticalIntent);
      const intentSign = Math.sign(this.smoothedVerticalIntent);
      const verticalReference = Math.max(120, this.box.height * .22);
      const deadZoneRatio = clamp((intentMagnitude - DIVER_VERTICAL_DEAD_ZONE) / verticalReference, 0, 1);
      const verticalRatio = intentSign * deadZoneRatio;

      // Keep horizontal swimming dominant when the pointer is almost directly
      // above/below the diver, even if the vertical target distance is large.
      const horizontalActivity = clamp(Math.abs(horizontalSpeed) / .9, 0, 1);
      const horizontalBias = .2 + horizontalActivity * .8;

      const smoothSurfaceProximity = this.surfaceProximity * this.surfaceProximity * (3 - 2 * this.surfaceProximity);
      const approachPitch = DIVER_MAX_UNDERWATER_PITCH + (DIVER_MAX_APPROACH_PITCH - DIVER_MAX_UNDERWATER_PITCH) * smoothSurfaceProximity;
      const followTarget = this.behaviorState === 'SURFACE_FOLLOW' ? 1 : 0;
      this.followBlend += (followTarget - this.followBlend) * .08;
      const maxPitch = approachPitch + (DIVER_MAX_FOLLOW_PITCH - approachPitch) * this.followBlend;
      this.targetPoseAngle = clamp(verticalRatio * horizontalBias * maxPitch, -maxPitch, maxPitch);
      if (this.turning || speed < .08 || intentMagnitude <= DIVER_VERTICAL_DEAD_ZONE) this.targetPoseAngle = 0;
      const poseEase = this.behaviorState === 'SURFACE_FOLLOW' ? .12 : this.behaviorState === 'SURFACE_APPROACH' ? .14 : .18;
      const desiredPose = this.poseAngle + (this.targetPoseAngle - this.poseAngle) * poseEase;
      const poseDelta = clamp(desiredPose - this.poseAngle, -DIVER_MAX_POSE_DELTA, DIVER_MAX_POSE_DELTA);
      this.poseAngle += poseDelta;
    }

    tick() {
      const horizontalEase = this.behaviorState === 'SURFACE_APPROACH' ? .12 : this.behaviorState === 'SURFACE_FOLLOW' ? .15 : .18;
      const smoothSurfaceProximity = this.surfaceProximity * this.surfaceProximity * (3 - 2 * this.surfaceProximity);
      const verticalEase = this.isSurface ? .18 - (.18 - .072) * smoothSurfaceProximity : .18;
      const turnBrake = this.isSurface && this.turning ? .68 : 1;
      this.position.x += (this.diverTarget.x - this.position.x) * horizontalEase * turnBrake;
      this.position.y += (this.diverTarget.y - this.position.y) * verticalEase;
      if (this.swimmer) {
        const dx = this.position.x - this.previous.x;
        const dy = this.position.y - this.previous.y;
        const speed = Math.hypot(dx, dy);
        this.velocity.x = dx;
        this.velocity.y = dy;
        this.velocity.speed = speed;
        if (this.isSurface) {
          this.updateSurfacePose();
        } else if (speed > .08) {
          let next = Math.atan2(dy, dx) * 180 / Math.PI - 180;
          while (next - this.heading > 180) next -= 360;
          while (next - this.heading < -180) next += 360;
          const turnEase = .22;
          this.heading += (next - this.heading) * turnEase;
          this.heading = ((this.heading + 180) % 360 + 360) % 360 - 180;
        }
        this.renderDiver();
      }
      this.previous.x = this.position.x;
      this.previous.y = this.position.y;
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

    getPointerPosition() { return { ...this.pointerPosition }; }

    getDiverTargetPosition() { return { ...this.diverTarget }; }

    getBehaviorState() { return this.behaviorState; }

    setDiverTarget(x, y) {
      this.diverTarget = this.getDiverTarget(x, y);
    }

    getVelocity() { return { ...this.velocity }; }

    setCalm(isCalm) { this.calm = Boolean(isCalm); }

    destroy() {
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('mousemove', this.onPointerMove);
      window.removeEventListener('resize', this.onResize);
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
    const updateSkyHotspot = (event) => {
      const rect = surface.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      const y = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
      const nearPlanet = x > .08 && x < .4 && y < .3;
      const nearFish = x > .12 && x < .52 && y > .14 && y < .4;
      surface.classList.toggle('is-sky-hotspot', y < .47 && (nearPlanet || nearFish));
      surface.classList.toggle('is-planet-hover', nearPlanet);
      surface.style.setProperty('--sky-hover-x', `${x * 100}%`);
      surface.style.setProperty('--sky-hover-y', `${y * 100}%`);
    };
    surface.addEventListener('pointermove', updateSkyHotspot, { passive: true });
    surface.addEventListener('pointerleave', () => {
      surface.classList.remove('is-sky-hotspot', 'is-planet-hover');
    });
    if (!gs || reducedMotion) return;
    gs.utils.toArray('.sky-cloud', skyDetails).forEach((cloud, index) => {
      gs.to(cloud, { x: index % 2 ? 72 : -64, y: index % 2 ? 6 : -3, duration: (20 + index * 4) / 2, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: index * -.8 });
    });
    gs.utils.toArray('.sky-star', skyDetails).forEach((star, index) => {
      gs.to(star, { opacity: .08 + Math.random() * .18, scale: .75 + Math.random() * .3, duration: 1.9 + Math.random() * 2.2, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: index * .13 });
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

  function initSurfaceTimeSystem(surface, options = {}) {
    const hotspot = surface.querySelector('.planet-hotspot');
    const hint = surface.querySelector('.planet-hint');
    const enableClickPulse = options.feedback !== false;
    const states = ['day', 'sunset', 'blue-hour'];
    const labels = { day: '切换到黄昏', sunset: '切换到蓝调时刻', 'blue-hour': '切换到白天' };
    const hintLabels = { day: '/ DAY /', sunset: '/ SUNSET /', 'blue-hour': '/ BLUE HOUR /' };
    let hintTimer = 0;
    let currentIndex = states.indexOf(surface.dataset.time || 'day');
    if (currentIndex < 0) currentIndex = 0;
    const setState = (next) => {
      const state = states.includes(next) ? next : 'day';
      currentIndex = states.indexOf(state);
      surface.dataset.time = state;
      hotspot?.setAttribute('aria-label', labels[state]);
      if (hint && !hint.classList.contains('is-state-feedback')) hint.textContent = '/ TURN THE SKY /';
      surface.dispatchEvent(new CustomEvent('surface:timechange', { detail: { state } }));
      return state;
    };
    setState(states[currentIndex]);
    hotspot?.addEventListener('click', () => {
      currentIndex = (currentIndex + 1) % states.length;
      const nextState = setState(states[currentIndex]);
      if (hint) {
        window.clearTimeout(hintTimer);
        hint.textContent = hintLabels[nextState];
        hint.classList.add('is-state-feedback');
        hintTimer = window.setTimeout(() => {
          hint.textContent = '/ TURN THE SKY /';
          hint.classList.remove('is-state-feedback');
        }, 800);
      }
      if (enableClickPulse && hotspot) {
        hotspot.classList.remove('is-pulsing');
        void hotspot.offsetWidth;
        hotspot.classList.add('is-pulsing');
      }
    });
    return { getState: () => surface.dataset.time || 'day', setState };
  }

  function initSurfacePlanetSequence(surface) {
    const layer = surface.querySelector('.surface-planet-layer');
    const frame = layer?.querySelector('.surface-planet-frame');
    if (!layer || !frame) return { destroy() {} };

    const states = ['day', 'sunset', 'blue-hour'];
    const frameCount = 36;
    const rotationSeconds = 30;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const initialState = states.includes(surface.dataset.time) ? surface.dataset.time : 'day';
    const images = new Map();
    let activeState = initialState;
    let frameIndex = 0;
    let startedAt = 0;
    let ready = false;
    let running = !reducedMotion;
    let rafId = 0;

    const sourceFor = (state, index) => {
      const name = state === 'blue-hour' ? 'planet-blue-hour' : `planet-${state}`;
      return `assets/planet-final/${state}/${name}-${String(index + 1).padStart(3, '0')}.webp`;
    };
    const frameSource = (state, index) => sourceFor(state, ((index % frameCount) + frameCount) % frameCount);
    const setFrame = (state, index) => {
      const image = images.get(frameSource(state, index));
      if (image) frame.src = image.src;
    };
    const currentState = () => states.includes(surface.dataset.time) ? surface.dataset.time : 'day';
    const onTimeChange = (event) => {
      const nextState = states.includes(event.detail?.state) ? event.detail.state : currentState();
      activeState = nextState;
      if (ready) setFrame(activeState, frameIndex);
    };
    surface.addEventListener('surface:timechange', onTimeChange);

    const sources = states.flatMap((state) => Array.from({ length: frameCount }, (_, index) => sourceFor(state, index)));
    const preload = Promise.all(sources.map((src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => { images.set(src, image); resolve(); };
      image.onerror = () => reject(new Error(`Unable to load planet frame: ${src}`));
      image.src = src;
    })));

    const tick = (now) => {
      if (!running) return;
      const nextState = currentState();
      if (nextState !== activeState) {
        activeState = nextState;
        setFrame(activeState, frameIndex);
      }
      const elapsed = Math.max(0, now - startedAt);
      const nextFrame = Math.floor((elapsed / 1000 / rotationSeconds) * frameCount) % frameCount;
      if (nextFrame !== frameIndex) {
        frameIndex = nextFrame;
        setFrame(activeState, frameIndex);
      }
      rafId = window.requestAnimationFrame(tick);
    };

    preload.then(() => {
      ready = true;
      activeState = currentState();
      if (!running) {
        frameIndex = 17;
        setFrame(activeState, frameIndex);
        return;
      }
      startedAt = performance.now();
      frameIndex = 0;
      setFrame(activeState, frameIndex);
      rafId = window.requestAnimationFrame(tick);
    }).catch((error) => {
      console.error('[surface-planet-sequence] preload failed', error);
    });

    window.__surfacePlanetSequenceDebug = {
      get frameIndex() { return frameIndex; },
      get state() { return activeState; },
      get ready() { return ready; },
      get running() { return running && ready; },
      rotationSeconds,
      frameCount
    };
    return {
      destroy() {
        running = false;
        if (rafId) window.cancelAnimationFrame(rafId);
        surface.removeEventListener('surface:timechange', onTimeChange);
      }
    };
  }

  // Round 4A is deliberately opt-in. The production homepage keeps its
  // ecology-free baseline; adding ?round=4a-fish-prototype enables this
  // temporary motion study without changing any locked surface systems.
  function initSurfaceFishPrototype(surface, tracker, timeSystem) {
    const params = new URLSearchParams(window.location.search);
    const enabled = params.get('round') === '4a-fish-prototype'
      || params.get('fishPrototype') === '1'
      || params.has('fishPrototype');
    const field = surface.querySelector('.surface-fish-prototype-field');
    const nodes = [...(field?.querySelectorAll('.surface-fish-prototype') || [])];
    if (!enabled || !field || nodes.length < 3) return { destroy() {} };

    const debug = params.get('fishDebug') === '1' || params.get('debug') === 'fish';
    const debugSvg = field.querySelector('.fish-prototype-debug');
    surface.dataset.fishPrototype = 'true';
    field.classList.toggle('is-debug', debug);

    const routes = [
      {
        name: 'wide horizontal cruise',
        points: [[.04, .67], [.2, .61], [.44, .66], [.7, .6], [.96, .68], [.74, .75], [.46, .72], [.18, .77]],
        rate: .0092, cruiseSpeed: 18, turnRate: .052, inertia: .075, fearRadius: 168, reactionEase: .052, phase: .4, depth: 'far'
      },
      {
        name: 'long arcing rise',
        points: [[.08, .8], [.24, .72], [.43, .58], [.67, .61], [.9, .75], [.7, .84], [.42, .8], [.22, .84]],
        rate: .0078, cruiseSpeed: 22, turnRate: .046, inertia: .068, fearRadius: 156, reactionEase: .064, phase: 1.9, depth: 'mid'
      },
      {
        name: 'deep small loop',
        points: [[.34, .82], [.48, .76], [.66, .8], [.6, .89], [.43, .9], [.28, .85]],
        rate: .0064, cruiseSpeed: 15, turnRate: .058, inertia: .062, fearRadius: 132, reactionEase: .076, phase: 3.2, depth: 'near'
      },
      {
        name: 'edge entry and return',
        points: [[-.08, .64], [.12, .58], [.38, .6], [.7, .66], [1.08, .62], [.82, .57], [.42, .55], [.06, .59]],
        rate: .011, cruiseSpeed: 20, turnRate: .043, inertia: .071, fearRadius: 184, reactionEase: .045, phase: 4.7, depth: 'far'
      },
      {
        name: 'short midwater loop',
        points: [[.58, .73], [.7, .68], [.84, .72], [.8, .79], [.65, .78], [.54, .75]],
        rate: .0087, cruiseSpeed: 19, turnRate: .05, inertia: .07, fearRadius: 148, reactionEase: .058, phase: 6.1, depth: 'mid'
      }
    ];
    const smoothstep = (value) => value * value * (3 - 2 * value);
    const wrap = (value) => ((value % 1) + 1) % 1;
    const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
    const direction = (x, y, fallback = { x: 1, y: 0 }) => {
      const length = Math.hypot(x, y);
      return length > .0001 ? { x: x / length, y: y / length } : fallback;
    };
    const sampleClosedRoute = (points, progress) => {
      const scaled = wrap(progress) * points.length;
      const segment = Math.floor(scaled);
      const t = scaled - segment;
      const p0 = points[(segment - 1 + points.length) % points.length];
      const p1 = points[segment % points.length];
      const p2 = points[(segment + 1) % points.length];
      const p3 = points[(segment + 2) % points.length];
      const t2 = t * t;
      const t3 = t2 * t;
      const interpolate = (a, b, c, d) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const derivative = (a, b, c, d) => .5 * ((-a + c) + 2 * (2 * a - 5 * b + 4 * c - d) * t + 3 * (-a + 3 * b - 3 * c + d) * t2);
      return {
        x: interpolate(p0[0], p1[0], p2[0], p3[0]),
        y: interpolate(p0[1], p1[1], p2[1], p3[1]),
        dx: derivative(p0[0], p1[0], p2[0], p3[0]),
        dy: derivative(p0[1], p1[1], p2[1], p3[1])
      };
    };
    const renderDebugRoutes = () => {
      if (!debug || !debugSvg) return [];
      debugSvg.innerHTML = routes.map((route, index) => {
        const points = route.points.map(([x, y]) => `${x * 100},${y * 100}`).join(' ');
        const controls = route.points.map(([x, y]) => `<circle cx="${x * 100}" cy="${y * 100}" r=".55"></circle>`).join('');
        return `<g data-fish-debug="${index}"><polyline points="${points}"></polyline>${controls}<line class="fish-debug-heading" x1="0" y1="0" x2="0" y2="0"></line></g>`;
      }).join('');
      return routes.map((_, index) => debugSvg.querySelector(`[data-fish-debug="${index}"]`));
    };
    const debugGroups = renderDebugRoutes();
    const activeNodes = reducedMotion ? nodes.slice(0, 3) : nodes;
    nodes.forEach((node) => { node.hidden = !activeNodes.includes(node); });
    let box = surface.getBoundingClientRect();
    const initialTime = performance.now();
    const fishes = activeNodes.map((element, index) => {
      const config = routes[index % routes.length];
      const progress = wrap(.08 + index * .187 + config.phase * .007);
      const sample = sampleClosedRoute(config.points, progress);
      const tangent = direction(sample.dx * box.width, sample.dy * box.height);
      return {
        element,
        config,
        progress,
        position: { x: sample.x * box.width, y: sample.y * box.height },
        velocity: { x: tangent.x * config.cruiseSpeed, y: tangent.y * config.cruiseSpeed },
        heading: Math.atan2(tangent.y, tangent.x),
        proximity: 0,
        avoidBlend: 0,
        state: 'CRUISE',
        stateAt: initialTime,
        phase: config.phase + index * .71,
        lastRendered: { x: 0, y: 0 }
      };
    });

    const renderFish = (fish) => {
      const rotation = fish.heading;
      fish.element.style.transform = `translate3d(${fish.position.x}px,${fish.position.y}px,0) translate(-50%,-50%) rotate(${rotation}rad)`;
      fish.lastRendered = { x: fish.position.x, y: fish.position.y };
    };
    fishes.forEach((fish) => {
      fish.element.dataset.state = fish.state;
      renderFish(fish);
    });

    const setState = (fish, state, now) => {
      if (fish.state === state) return;
      fish.state = state;
      fish.stateAt = now;
      fish.element.dataset.state = state;
    };
    const getTimeScale = () => {
      const state = timeSystem?.getState?.();
      return state === 'blue-hour' ? .78 : state === 'sunset' ? .88 : 1;
    };
    const refreshBounds = () => {
      const previousBox = box;
      box = surface.getBoundingClientRect();
      fishes.forEach((fish) => {
        fish.position.x = previousBox.width ? fish.position.x / previousBox.width * box.width : box.width * .5;
        fish.position.y = previousBox.height ? fish.position.y / previousBox.height * box.height : box.height * .7;
      });
    };
    const onResize = () => refreshBounds();
    window.addEventListener('resize', onResize, { passive: true });

    const tick = (_, deltaTime = 16.67) => {
      const deltaSeconds = clamp(deltaTime / 1000, .008, .06);
      const frame = Math.min(3.6, Math.max(.45, deltaSeconds * 60));
      const now = performance.now();
      const diver = tracker.getPosition();
      const timeScale = getTimeScale();
      const waterTop = box.height * .545;
      const waterBottom = box.height * .91;
      const separations = fishes.map((fish, index) => {
        let x = 0;
        let y = 0;
        fishes.forEach((other, otherIndex) => {
          if (index === otherIndex) return;
          const dx = fish.position.x - other.position.x;
          const dy = fish.position.y - other.position.y;
          const distance = Math.hypot(dx, dy) || 1;
          const personalSpace = (fish.config.depth === 'near' ? 112 : 86);
          if (distance < personalSpace) {
            const strength = (1 - distance / personalSpace) ** 2;
            x += (dx / distance) * strength;
            y += (dy / distance) * strength;
          }
        });
        return direction(x, y, { x: 0, y: 0 });
      });

      fishes.forEach((fish, index) => {
        fish.progress = wrap(fish.progress + fish.config.rate * deltaSeconds * timeScale);
        const sample = sampleClosedRoute(fish.config.points, fish.progress);
        const pathPosition = { x: sample.x * box.width, y: sample.y * box.height };
        const tangent = direction(sample.dx * box.width, sample.dy * box.height, { x: Math.cos(fish.heading), y: Math.sin(fish.heading) });
        const pathErrorX = pathPosition.x - fish.position.x;
        const pathErrorY = pathPosition.y - fish.position.y;
        const pathErrorLength = Math.hypot(pathErrorX, pathErrorY);
        const pathCorrection = pathErrorLength > 1 ? direction(pathErrorX, pathErrorY) : { x: 0, y: 0 };
        const correctionWeight = clamp(pathErrorLength / 220, 0, .28);
        const baseX = tangent.x + pathCorrection.x * correctionWeight;
        const baseY = tangent.y + pathCorrection.y * correctionWeight;
        const baseDirection = direction(baseX, baseY, tangent);

        const dx = fish.position.x - diver.x;
        const dy = fish.position.y - diver.y;
        const distance = Math.hypot(dx, dy) || 1;
        const rawProximity = clamp(1 - distance / fish.config.fearRadius, 0, 1);
        fish.proximity += (rawProximity - fish.proximity) * clamp(fish.config.reactionEase * frame, 0, .25);
        const proximity = smoothstep(fish.proximity);
        if (proximity > .56 && fish.state !== 'AVOID') setState(fish, 'AVOID', now);
        if (fish.state === 'AVOID' && proximity < .14 && now - fish.stateAt > 1050) setState(fish, 'RETURN', now);
        if (fish.state === 'RETURN' && now - fish.stateAt > 1450) setState(fish, 'CRUISE', now);
        const avoidTarget = fish.state === 'AVOID' ? clamp(proximity * 1.08, 0, 1) : proximity * .34;
        fish.avoidBlend += (avoidTarget - fish.avoidBlend) * clamp((fish.state === 'AVOID' ? .07 : .035) * frame, 0, .22);
        const away = direction(dx, dy, { x: -baseDirection.x, y: -baseDirection.y });
        const avoidDirection = direction(baseDirection.x + away.x * fish.avoidBlend * .92, baseDirection.y + away.y * fish.avoidBlend * .92, baseDirection);

        const wanderAngle = Math.sin(now * .00013 + fish.phase) * .11 + Math.cos(now * .000077 + fish.phase * 1.7) * .055;
        const wanderCos = Math.cos(wanderAngle);
        const wanderSin = Math.sin(wanderAngle);
        const wanderX = avoidDirection.x * wanderCos - avoidDirection.y * wanderSin;
        const wanderY = avoidDirection.x * wanderSin + avoidDirection.y * wanderCos;
        const boundary = { x: 0, y: 0 };
        if (fish.position.y < waterTop) boundary.y += clamp((waterTop - fish.position.y) / (box.height * .11), 0, 1);
        if (fish.position.y > waterBottom) boundary.y -= clamp((fish.position.y - waterBottom) / (box.height * .1), 0, 1);
        if (fish.position.x < -box.width * .1) boundary.x += clamp((-box.width * .1 - fish.position.x) / (box.width * .14), 0, 1);
        if (fish.position.x > box.width * 1.1) boundary.x -= clamp((fish.position.x - box.width * 1.1) / (box.width * .14), 0, 1);
        const desiredDirection = direction(
          wanderX + separations[index].x * .34 + boundary.x * .66,
          wanderY + separations[index].y * .34 + boundary.y * .66,
          avoidDirection
        );
        const desiredHeading = Math.atan2(desiredDirection.y, desiredDirection.x);
        fish.heading += angleDelta(fish.heading, desiredHeading) * clamp(fish.config.turnRate * frame * (fish.state === 'AVOID' ? 1.16 : 1), 0, .24);
        const speedVariation = 1 + Math.sin(now * .00011 + fish.phase * 2.1) * .035 + Math.cos(now * .000061 + fish.phase) * .018;
        const stateSpeed = fish.state === 'AVOID' ? 1.12 : fish.state === 'RETURN' ? 1.03 : 1;
        const targetSpeed = fish.config.cruiseSpeed * speedVariation * stateSpeed * timeScale;
        const velocityEase = clamp(fish.config.inertia * frame, 0, .24);
        fish.velocity.x += (Math.cos(fish.heading) * targetSpeed - fish.velocity.x) * velocityEase;
        fish.velocity.y += (Math.sin(fish.heading) * targetSpeed - fish.velocity.y) * velocityEase;
        const speed = Math.hypot(fish.velocity.x, fish.velocity.y) || 1;
        const maxSpeed = fish.config.cruiseSpeed * (fish.state === 'AVOID' ? 1.34 : 1.22);
        if (speed > maxSpeed) {
          fish.velocity.x = fish.velocity.x / speed * maxSpeed;
          fish.velocity.y = fish.velocity.y / speed * maxSpeed;
        }
        fish.position.x += fish.velocity.x * deltaSeconds;
        fish.position.y += fish.velocity.y * deltaSeconds;
        fish.position.x = clamp(fish.position.x, -box.width * .15, box.width * 1.15);
        fish.position.y = clamp(fish.position.y, box.height * .52, box.height * .95);
        renderFish(fish);

        const group = debugGroups[index];
        if (group) {
          const line = group.querySelector('.fish-debug-heading');
          const x = fish.position.x / Math.max(1, box.width) * 100;
          const y = fish.position.y / Math.max(1, box.height) * 100;
          const hx = x + Math.cos(fish.heading) * 5;
          const hy = y + Math.sin(fish.heading) * 5;
          line?.setAttribute('x1', String(x));
          line?.setAttribute('y1', String(y));
          line?.setAttribute('x2', String(hx));
          line?.setAttribute('y2', String(hy));
          group.dataset.state = fish.state;
        }
      });
    };
    let rafId = 0;
    if (gs) gs.ticker.add(tick);
    else {
      let last = performance.now();
      const loop = (now) => { tick(now, now - last); last = now; rafId = window.requestAnimationFrame(loop); };
      rafId = window.requestAnimationFrame(loop);
    }
    window.__surfaceFishPrototypeDebug = {
      enabled: true,
      count: fishes.length,
      motionPath: 'closed Catmull-Rom cruise tendency + steering',
      motionPathHelper: false,
      get states() { return fishes.map((fish) => fish.state); },
      get fish() { return fishes.map((fish) => ({ state: fish.state, x: fish.position.x, y: fish.position.y, heading: fish.heading, proximity: fish.proximity })); }
    };
    return {
      destroy() {
        if (gs) gs.ticker.remove(tick);
        if (rafId) window.cancelAnimationFrame(rafId);
        window.removeEventListener('resize', onResize);
        delete window.__surfaceFishPrototypeDebug;
        delete surface.dataset.fishPrototype;
        field.classList.remove('is-debug');
        nodes.forEach((node) => { node.hidden = false; node.style.transform = ''; delete node.dataset.state; });
      }
    };
  }

  function initSurfaceCreatures(surface, tracker, timeSystem) {
    const field = surface.querySelector('.surface-creatures');
    const nodes = [...(field?.querySelectorAll('.surface-creature') || [])];
    if (!field || !nodes.length) return { destroy() {} };
    let box = surface.getBoundingClientRect();
    const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
    const configs = {
      shy: { depth: [.56, .72], speed: .74, maxSpeed: 1.42, turn: .035, wander: .34, fear: 210 },
      normal: { depth: [.62, .82], speed: .58, maxSpeed: 1.18, turn: .028, wander: .27, fear: 150 },
      curious: { depth: [.68, .9], speed: .7, maxSpeed: 1.28, turn: .032, wander: .3, fear: 126 },
      jelly: { depth: [.58, .8], speed: .2, maxSpeed: .38, turn: .012, wander: .11, fear: 150 }
    };
    const makeBounds = (creature) => ({
      minX: box.width * .055, maxX: box.width * .945,
      minY: box.height * creature.config.depth[0], maxY: box.height * creature.config.depth[1]
    });
    const creatures = nodes.map((element, index) => {
      const mode = element.dataset.creature || 'normal';
      const baseConfig = configs[mode] || configs.normal;
      const config = { ...baseConfig, fear: Number(element.dataset.trigger) || baseConfig.fear };
      const startX = box.width * (Number(element.dataset.homeX) || 50) / 100;
      const startY = box.height * (Number(element.dataset.homeY) || (config.depth[0] + config.depth[1]) * 50) / 100;
      const direction = index % 2 ? Math.PI : 0;
      const creature = {
        element, mode, config,
        position: { x: startX, y: startY },
        velocity: { x: Math.cos(direction) * config.speed, y: Math.sin(direction) * config.speed * .22 },
        heading: direction,
        state: mode === 'jelly' ? 'DRIFT' : 'CRUISE',
        stateAt: performance.now(),
        phase: index * 1.73 + Math.random() * 2,
        nextWander: performance.now() + 2800 + index * 900,
        bounds: null,
        setX: gs ? gs.quickSetter(element, 'x', 'px') : null,
        setY: gs ? gs.quickSetter(element, 'y', 'px') : null,
        setRotation: gs ? gs.quickSetter(element, 'rotation', 'deg') : null,
        setScaleX: gs ? gs.quickSetter(element, 'scaleX') : null,
        setScaleY: gs ? gs.quickSetter(element, 'scaleY') : null
      };
      creature.bounds = makeBounds(creature);
      element.dataset.state = creature.state;
      return creature;
    });
    if (gs) creatures.forEach((creature) => gs.set(creature.element, { left: '50%', top: '50%', xPercent: -50, yPercent: -50, x: creature.position.x - box.width / 2, y: creature.position.y - box.height / 2, rotation: 0 }));

    const refreshBounds = () => {
      const previousBox = box;
      box = surface.getBoundingClientRect();
      creatures.forEach((creature) => {
        const nx = previousBox.width ? creature.position.x / previousBox.width : .5;
        const ny = previousBox.height ? creature.position.y / previousBox.height : .68;
        creature.position.x = nx * box.width;
        creature.position.y = ny * box.height;
        creature.bounds = makeBounds(creature);
        creature.position.x = clamp(creature.position.x, creature.bounds.minX, creature.bounds.maxX);
        creature.position.y = clamp(creature.position.y, creature.bounds.minY, creature.bounds.maxY);
      });
    };
    const onResize = () => refreshBounds();
    window.addEventListener('resize', onResize, { passive: true });

    const speedMultiplier = () => {
      const mode = timeSystem.getState();
      return mode === 'blue-hour' ? .66 : mode === 'sunset' ? .74 : 1;
    };
    const setState = (creature, state, now) => {
      if (creature.state === state) return;
      creature.state = state;
      creature.stateAt = now;
      creature.element.dataset.state = state;
    };
    const updateState = (creature, diver, diverSpeed, calm, now, proximity) => {
      if (reducedMotion || creature.mode === 'jelly') return;
      if (['CRUISE', 'WANDER', 'CURIOUS'].includes(creature.state) && proximity > .34) {
        setState(creature, 'FLEE', now);
      } else if (creature.state === 'FLEE' && proximity < .1 && now - creature.stateAt > 650) {
        setState(creature, 'RECOVER', now);
      } else if (creature.state === 'RECOVER' && now - creature.stateAt > 950) {
        setState(creature, creature.mode === 'curious' && calm && diverSpeed < .28 ? 'CURIOUS' : 'CRUISE', now);
      } else if (creature.state === 'CURIOUS' && (!calm || diverSpeed > .45)) {
        setState(creature, 'CRUISE', now);
      } else if (creature.state === 'CRUISE' && now >= creature.nextWander) {
        creature.nextWander = now + 4200 + Math.random() * 3200;
        setState(creature, 'WANDER', now);
      } else if (creature.state === 'WANDER' && now - creature.stateAt > 3400) {
        setState(creature, creature.mode === 'curious' && calm && diverSpeed < .28 ? 'CURIOUS' : 'CRUISE', now);
      } else if (creature.mode === 'curious' && creature.state === 'CRUISE' && calm && diverSpeed < .28 && proximity < .22 && proximity > .02) {
        setState(creature, 'CURIOUS', now);
      }
    };
    const updateCreature = (creature, diver, diverSpeed, calm, now, deltaSeconds) => {
      const { config, bounds } = creature;
      const dx = creature.position.x - diver.x;
      const dy = creature.position.y - diver.y;
      const distance = Math.hypot(dx, dy) || 1;
      const proximity = clamp(1 - distance / config.fear, 0, 1);
      updateState(creature, diver, diverSpeed, calm, now, proximity);
      const timeScale = reducedMotion ? .18 : speedMultiplier();
      const frame = Math.min(3.6, Math.max(.35, deltaSeconds * 60)) * timeScale;
      const wander = Math.sin(now * .00031 + creature.phase) * config.wander + Math.cos(now * .00019 + creature.phase * 1.7) * config.wander * .45;
      let desiredHeading = creature.heading + wander;
      if (creature.state === 'FLEE' && !reducedMotion) {
        desiredHeading = Math.atan2(dy, dx) + Math.sin(now * .001 + creature.phase) * .12;
      } else if (creature.state === 'CURIOUS' && !reducedMotion) {
        const safeRadius = creature.mode === 'curious' ? 116 : 138;
        const targetX = diver.x - (dx / distance) * safeRadius;
        const targetY = diver.y - (dy / distance) * safeRadius;
        desiredHeading = Math.atan2(targetY - creature.position.y, targetX - creature.position.x);
      } else if (creature.mode === 'jelly' && proximity > .16 && !reducedMotion) {
        desiredHeading = Math.atan2(dy, dx) + Math.PI * .42;
      }
      if (!reducedMotion && creature.mode !== 'jelly' && creature.state !== 'CURIOUS') {
        // Avoidance begins as a low-amplitude steering bias and grows with
        // proximity; only the close range escalates into the FLEE state.
        const awayHeading = Math.atan2(dy, dx);
        const avoidanceStrength = clamp(proximity * (creature.state === 'FLEE' ? 1.35 : .48), 0, .92);
        desiredHeading += angleDelta(desiredHeading, awayHeading) * avoidanceStrength;
      }
      const edgeX = creature.position.x < bounds.minX ? 1 : creature.position.x > bounds.maxX ? -1 : 0;
      const edgeY = creature.position.y < bounds.minY ? 1 : creature.position.y > bounds.maxY ? -1 : 0;
      if (edgeX || edgeY) desiredHeading = Math.atan2(edgeY || Math.sin(creature.heading), edgeX || Math.cos(creature.heading));
      const turn = config.turn * (creature.state === 'FLEE' ? 2.1 : 1) * frame;
      creature.heading += angleDelta(creature.heading, desiredHeading) * clamp(turn, 0, .28);
      const fleeBoost = creature.state === 'FLEE' ? 1.55 + proximity * .8 : creature.state === 'RECOVER' ? .72 : 1;
      const targetSpeed = config.speed * fleeBoost * timeScale;
      const velocityEase = creature.state === 'FLEE' ? .18 : creature.mode === 'jelly' ? .045 : .085;
      creature.velocity.x += (Math.cos(creature.heading) * targetSpeed - creature.velocity.x) * clamp(velocityEase * frame, 0, .8);
      creature.velocity.y += (Math.sin(creature.heading) * targetSpeed - creature.velocity.y) * clamp(velocityEase * frame, 0, .8);
      const maxSpeed = config.maxSpeed * timeScale * (creature.state === 'FLEE' ? 1.7 : 1);
      const velocityMagnitude = Math.hypot(creature.velocity.x, creature.velocity.y) || 1;
      if (velocityMagnitude > maxSpeed) {
        creature.velocity.x = creature.velocity.x / velocityMagnitude * maxSpeed;
        creature.velocity.y = creature.velocity.y / velocityMagnitude * maxSpeed;
      }
      creature.position.x += creature.velocity.x * frame;
      creature.position.y += creature.velocity.y * frame;
      creature.position.x = clamp(creature.position.x, bounds.minX - box.width * .012, bounds.maxX + box.width * .012);
      creature.position.y = clamp(creature.position.y, bounds.minY - box.height * .012, bounds.maxY + box.height * .012);
      const rotation = creature.mode === 'jelly' ? Math.sin(now * .00042 + creature.phase) * 2.5 : clamp(creature.velocity.y * 2.2, -7, 7);
      const bodyPulse = creature.mode === 'jelly'
        ? 1 + Math.sin(now * .0011 + creature.phase) * .016
        : 1 + Math.sin(now * .0015 + creature.phase) * .006;
      const offsetX = creature.position.x - box.width / 2;
      const offsetY = creature.position.y - box.height / 2;
      if (creature.setX) creature.setX(offsetX); else creature.element.style.transform = `translate(-50%,-50%) translate3d(${offsetX}px,${offsetY}px,0) rotate(${rotation}deg)`;
      if (creature.setY) creature.setY(offsetY);
      if (creature.setRotation) creature.setRotation(rotation);
      if (creature.setScaleX) creature.setScaleX(bodyPulse);
      if (creature.setScaleY) creature.setScaleY(1 - (bodyPulse - 1) * .45);
    };

    const tick = (_, deltaTime = 16.67) => {
      const diver = tracker.getPosition();
      const diverSpeed = tracker.getVelocity().speed;
      const calm = surface.classList.contains('is-calm');
      const now = performance.now();
      const deltaSeconds = Math.min(.06, Math.max(.008, deltaTime / 1000));
      creatures.forEach((creature) => updateCreature(creature, diver, diverSpeed, calm, now, deltaSeconds));
    };
    if (gs) gs.ticker.add(tick); else {
      let last = performance.now();
      const loop = (now) => { tick(now, now - last); last = now; window.requestAnimationFrame(loop); };
      window.requestAnimationFrame(loop);
    }
    return {
      destroy() {
        window.removeEventListener('resize', onResize);
        if (gs) gs.ticker.remove(tick);
      }
    };
  }

  function spawnSurfaceSpeedBubble(surface, tracker) {
    if (reducedMotion || !gs) return;
    const field = surface.querySelector('.surface-bubbles');
    if (!field) return;
    const box = surface.getBoundingClientRect();
    const position = tracker.getPosition();
    const velocity = tracker.getVelocity();
    const bubble = document.createElement('i');
    const size = 4 + Math.random() * 7;
    bubble.className = 'surface-bubble surface-speed-bubble';
    bubble.style.left = `${position.x}px`;
    bubble.style.top = `${Math.max(0, position.y - box.height * .5)}px`;
    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    field.appendChild(bubble);
    const oppositeX = clamp(-velocity.x * 8 + (Math.random() - .5) * 16, -42, 42);
    const oppositeY = clamp(-velocity.y * 4 - 18 - Math.random() * 24, -80, -12);
    gs.fromTo(bubble, { autoAlpha: .65, scale: .45, x: 0, y: 0 }, {
      autoAlpha: 0, scale: .92 + Math.random() * .45, x: oppositeX, y: oppositeY,
      duration: .9 + Math.random() * .55, ease: 'sine.out', onComplete: () => bubble.remove()
    });
  }

  function initSurfaceIdleSystem(surface, tracker, timeSystem) {
    let stillFor = 0;
    let calm = false;
    let lastBubble = 0;
    let hiddenEventShown = false;
    const motes = [...(surface.querySelectorAll('.surface-blue-hour-motes i') || [])];
    const moteField = surface.querySelector('.surface-blue-hour-motes');
    const showBlueHourMotes = () => {
      if (reducedMotion || !gs || !moteField) return;
      const box = surface.getBoundingClientRect();
      const diver = tracker.getPosition();
      moteField.classList.add('is-revealing');
      motes.forEach((mote, index) => {
        mote.style.left = `${clamp(diver.x + (index - 2) * 34, 18, box.width - 18)}px`;
        mote.style.top = `${clamp(diver.y + (index % 2 ? -34 : 28), box.height * .52, box.height - 20)}px`;
        gs.fromTo(mote, { autoAlpha: 0, scale: .35, x: (index % 2 ? 1 : -1) * 42, y: 24 }, {
          autoAlpha: .8, scale: .8 + index * .06, x: 0, y: -18 - index * 5,
          duration: 1.4 + index * .18, delay: index * .12, ease: 'sine.inOut', yoyo: true, repeat: 1,
          onComplete: () => { if (index === motes.length - 1) moteField.classList.remove('is-revealing'); }
        });
      });
    };
    const tick = (_, deltaTime = 16.67) => {
      const velocity = tracker.getVelocity();
      const deltaSeconds = Math.min(.08, Math.max(.008, deltaTime / 1000));
      if (velocity.speed < .14) stillFor += deltaSeconds; else stillFor = 0;
      const nextCalm = stillFor >= 2.35;
      if (nextCalm !== calm) {
        calm = nextCalm;
        surface.classList.toggle('is-calm', calm);
        tracker.setCalm(calm);
      }
      if (velocity.speed > 1.9 && performance.now() - lastBubble > 220) {
        lastBubble = performance.now();
        spawnSurfaceSpeedBubble(surface, tracker);
      }
      const blueHourCalm = timeSystem.getState() === 'blue-hour' && calm && stillFor >= 4.6;
      if (blueHourCalm && !hiddenEventShown) {
        hiddenEventShown = true;
        showBlueHourMotes();
      }
      if (!blueHourCalm) hiddenEventShown = false;
    };
    if (gs) gs.ticker.add(tick); else {
      let last = performance.now();
      const loop = (now) => { tick(now, now - last); last = now; requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    return { destroy() { if (gs) gs.ticker.remove(tick); } };
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
        tracker.setDiverTarget(x, y);
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

  window.initSurfaceTimeSystem = initSurfaceTimeSystem;

  const surface = document.querySelector('.surface-hero');
  if (surface) {
    initSurfaceEffects(surface);
    const surfaceTracker = new DiverPointerTracker(surface, surface.querySelector('.home-diver'));
    const surfaceTime = initSurfaceTimeSystem(surface);
    initSurfacePlanetSequence(surface);
    initSurfaceFishPrototype(surface, surfaceTracker, surfaceTime);
    initSurfaceIdleSystem(surface, surfaceTracker, surfaceTime);
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
