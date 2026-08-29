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
  const DIVER_WAIT_POSTURE = 72;
  const DEBUG_HIDDEN_CAVE = true;
  if (gs && window.MorphSVGPlugin) gs.registerPlugin(window.MorphSVGPlugin);

  class DiverPointerTracker {
    constructor(root, swimmer) {
      this.root = root;
      this.swimmer = swimmer;
      this.isSurface = root.classList.contains('surface-hero');
      this.diveBounds = null;
      this.layer = root.querySelector('.cursor-layer');
      this.light = this.layer?.querySelector('.cursor-light');
      this.glow = this.layer?.querySelector('.glow');
      // Surface uses a world-space Diver Wake instead of an attached cursor
      // trail. The Dive Map keeps its existing trail behavior unchanged.
      this.motes = this.isSurface ? [] : [...(this.layer?.querySelectorAll('.trail i') || [])];
      this.box = root.getBoundingClientRect();
      this.bounds = { minX: 0, maxX: this.box.width, minY: 0, maxY: this.box.height, hardMinY: 0, hardMaxY: this.box.height };
      const start = swimmer ? swimmer.getBoundingClientRect() : { left: this.box.width * .5, top: this.box.height * .52, width: 0, height: 0 };
      this.pointerPosition = { x: start.left - this.box.left + start.width / 2, y: start.top - this.box.top + start.height / 2 };
      this.refreshMetrics();
      this.behaviorState = this.isSurface ? 'UNDERWATER' : 'FREE';
      this.surfaceMode = this.isSurface ? 'FOLLOW' : 'FREE';
      this.surfaceProximity = 0;
      this.diverTarget = this.getDiverTarget(this.pointerPosition.x, this.pointerPosition.y);
      this.position = { ...this.diverTarget };
      if (this.isSurface && this.pointerPosition.y < this.surfaceFollowLeaveY) {
        this.surfaceMode = 'WAIT';
        this.behaviorState = 'SURFACE_WAIT';
        this.surfaceProximity = 1;
        this.diverTarget = { ...this.position };
      }
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
      this.pointerFollowEnabled = true;
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
      if (!this.isSurface && this.diveBounds) {
        this.bounds = { ...this.diveBounds };
        return;
      }
      const width = this.swimmer?.offsetWidth || 125;
      const height = this.swimmer?.offsetHeight || 94;
      const halfW = width / 2;
      const halfH = height / 2;
      const sideInset = Math.max(22, halfW * .34);
      if (this.isSurface) {
        const bandRects = ['.surface-static-line-mask', '.surface-wave-layer']
          .map((selector) => this.root.querySelector(selector)?.getBoundingClientRect())
          .filter(Boolean);
        const bandBottom = bandRects.length
          ? Math.max(...bandRects.map((rect) => rect.bottom - this.box.top))
          : this.box.height * .6;
        // Keep the original broad horizontal/lower-water range. Only the
        // upper edge is replaced by the measured Surface Band boundary. The
        // clearance is intentionally torso-based rather than the full rotated
        // sprite bounds, so the head/upper body may approach the band while
        // the main body remains in deep water.
        const safety = Math.max(10, Math.min(18, halfH * .16));
        const minY = Math.max(this.box.height * .55 + halfH * .78, bandBottom + halfH * .58 + safety);
        const maxY = this.box.height - halfH - safety;
        const hardMinY = Math.max(this.box.height * .505 + halfH * .72, bandBottom + halfH * .5 + safety * .5);
        const hardMaxY = this.box.height - halfH - safety * .5;
        this.surfaceBandBottom = bandBottom;
        this.surfaceFollowEnterY = bandBottom + Math.max(8, this.box.height * .018);
        this.surfaceFollowLeaveY = bandBottom - Math.max(8, this.box.height * .018);
        this.bounds = {
          minX: halfW + sideInset,
          maxX: Math.max(halfW + sideInset, this.box.width - halfW - sideInset),
          minY,
          maxY: Math.max(minY, maxY),
          hardMinY,
          hardMaxY: Math.max(hardMinY, hardMaxY)
        };
        return;
      }
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
      if (!this.isSurface || this.surfaceMode !== 'WAIT') {
        this.diverTarget = this.getDiverTarget(this.pointerPosition.x, this.pointerPosition.y);
      }
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
      this.surfaceProximity = 0;
      const safeX = this.softLimit(pointerX, this.bounds.minX, this.bounds.maxX, .08);
      // Keep the visible boundary springy: the hard margin is only a final
      // safety net so the diver never disappears beyond the scene edge.
      const compressedX = clamp(safeX, this.bounds.minX - this.box.width * .045, this.bounds.maxX + this.box.width * .045);
      this.behaviorState = 'UNDERWATER';
      const y = this.softLimit(pointerY, this.bounds.minY, this.bounds.maxY, .1);
      return { x: compressedX, y: clamp(y, this.bounds.hardMinY, this.bounds.hardMaxY) };
    }

    updateSurfaceMode(pointerY) {
      if (!this.isSurface) return false;
      const wasWaiting = this.surfaceMode === 'WAIT';
      if (wasWaiting) {
        if (pointerY >= this.surfaceFollowEnterY) this.surfaceMode = 'FOLLOW';
      } else if (pointerY < this.surfaceFollowLeaveY) {
        this.surfaceMode = 'WAIT';
      }
      const changed = wasWaiting !== (this.surfaceMode === 'WAIT');
      if (changed && this.surfaceMode === 'WAIT') {
        // Freeze the positional target at the current point; the existing
        // inertia then eases out naturally instead of chasing the sky.
        this.diverTarget = { ...this.position };
        this.behaviorState = 'SURFACE_WAIT';
        this.surfaceProximity = 1;
      } else if (changed && this.surfaceMode === 'FOLLOW') {
        this.behaviorState = 'UNDERWATER';
        this.surfaceProximity = 0;
      }
      return changed;
    }

    onPointerMove(event) {
      if (!this.pointerFollowEnabled) return;
      this.refreshBox();
      const rawX = clamp(event.clientX - this.box.left, 0, this.box.width);
      const rawY = clamp(event.clientY - this.box.top, 0, this.box.height);
      this.pointerPosition.x = rawX;
      this.pointerPosition.y = rawY;
      const modeChanged = this.updateSurfaceMode(rawY);
      if (!this.isSurface || this.surfaceMode === 'FOLLOW') {
        this.diverTarget = this.getDiverTarget(rawX, rawY);
      } else if (modeChanged && this.surfaceMode === 'WAIT') {
        this.diverTarget = { ...this.position };
      }
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
      const waiting = this.isSurface && this.surfaceMode === 'WAIT';
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
      const rawVerticalIntent = waiting ? 0 : this.diverTarget.y - this.position.y;
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
      if (waiting) {
        // In WAIT/WATCH the diver holds position and first eases into a
        // near-vertical treading posture. The small 2D attention offset then
        // lets upper-left and upper-right feel distinct without flipping
        // facing or asking the body to point directly at the cursor.
        const lookDx = this.pointerPosition.x - this.position.x;
        const lookDy = this.pointerPosition.y - this.position.y;
        const lookAngle = Math.atan2(-lookDy, Math.max(18, Math.abs(lookDx))) * 180 / Math.PI;
        const verticalAttention = clamp(lookAngle / 90, -1, 1) * 3.6;
        const lateralAttention = clamp(lookDx / Math.max(1, this.box.width * .34), -1, 1) * 4.4;
        this.targetPoseAngle = DIVER_WAIT_POSTURE + clamp(verticalAttention + lateralAttention, -8, 8);
      } else if (this.turning || speed < .08 || intentMagnitude <= DIVER_VERTICAL_DEAD_ZONE) this.targetPoseAngle = 0;
      const poseEase = waiting ? .08 : this.behaviorState === 'SURFACE_FOLLOW' ? .12 : this.behaviorState === 'SURFACE_APPROACH' ? .14 : .18;
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
      if (!this.isSurface && this.diveBounds) {
        this.position.x = clamp(this.position.x, this.bounds.minX, this.bounds.maxX);
        this.position.y = clamp(this.position.y, this.bounds.minY, this.bounds.maxY);
      }
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

    setDiveBounds(bounds) {
      if (this.isSurface || !bounds) return;
      this.diveBounds = { ...bounds };
      this.bounds = { ...bounds };
      this.diverTarget = this.getDiverTarget(this.pointerPosition.x, this.pointerPosition.y);
      this.position.x = clamp(this.position.x, this.bounds.minX, this.bounds.maxX);
      this.position.y = clamp(this.position.y, this.bounds.minY, this.bounds.maxY);
    }

    getPointerPosition() { return { ...this.pointerPosition }; }

    getDiverTargetPosition() { return { ...this.diverTarget }; }

    getBehaviorState() { return this.behaviorState; }

    setDiverTarget(x, y) {
      this.diverTarget = this.getDiverTarget(x, y);
    }

    setPointerFollowEnabled(enabled) {
      this.pointerFollowEnabled = Boolean(enabled);
      if (!this.pointerFollowEnabled) this.diverTarget = { ...this.position };
    }

    getVelocity() { return { ...this.velocity }; }

    setCalm(isCalm) { this.calm = Boolean(isCalm); }

    exitForDive(fadeDuration = .2) {
      if (!this.isSurface || this._exitedForDive) return;
      this._exitedForDive = true;
      // The click hands the story to the viewer immediately: freeze the
      // current position and detach every Surface follow / WAIT-WATCH update
      // before the water morph begins.
      this.diverTarget = { ...this.position };
      this.destroy();
      if (!this.swimmer) return;
      const duration = clamp(fadeDuration, .15, .25);
      if (gs) {
        gs.killTweensOf(this.swimmer);
        gs.to(this.swimmer, { autoAlpha: 0, duration, ease: 'power1.inOut', overwrite: true });
      } else {
        this.swimmer.style.transition = `opacity ${duration}s ease-in-out`;
        this.swimmer.style.opacity = '0';
      }
    }

    destroy() {
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('mousemove', this.onPointerMove);
      window.removeEventListener('resize', this.onResize);
      if (gs) gs.ticker.remove(this.tick); else cancelAnimationFrame(this.raf);
    }
  }

  function initDriftBottleContact(surface) {
    const shell = surface?.querySelector('.drift-bottle-contact');
    const trigger = shell?.querySelector('.drift-bottle-trigger');
    const float = shell?.querySelector('.drift-bottle-float');
    const note = shell?.querySelector('.drift-contact-note');
    const close = shell?.querySelector('.drift-note-close');
    if (!shell || !trigger || !float || !note || !close) return { destroy() {} };

    let opened = false;
    let hideTimer = 0;
    let driftLoop = null;
    const hoverClass = 'is-drift-bottle-hover';
    const openClass = 'is-drift-bottle-open';

    // Independent, slow waypoints let the bottle drift through its small
    // right-side patch of sea instead of rocking in place like a UI icon.
    if (gs && !reducedMotion) {
      driftLoop = gs.timeline({ repeat: -1 });
      driftLoop
        .to(float, { x: -13, y: 2, rotation: -.7, duration: 8.8, ease: 'sine.inOut' })
        .to(float, { x: 11, y: -2.5, rotation: .6, duration: 11.4, ease: 'sine.inOut' })
        .to(float, { x: 16, y: 1.5, rotation: .3, duration: 8.2, ease: 'sine.inOut' })
        .to(float, { x: -8, y: -3, rotation: -.75, duration: 12.1, ease: 'sine.inOut' })
        .to(float, { x: 0, y: 0, rotation: 0, duration: 9.6, ease: 'sine.inOut' });
    }

    const setHover = (active) => surface.classList.toggle(hoverClass, Boolean(active) && !opened);
    const openContact = () => {
      if (opened) return;
      opened = true;
      window.clearTimeout(hideTimer);
      trigger.setAttribute('aria-expanded', 'true');
      note.hidden = false;
      surface.classList.add(openClass);
      surface.classList.remove(hoverClass);
      window.setTimeout(() => close.focus({ preventScroll: true }), 80);
    };
    const closeContact = ({ restoreFocus = false } = {}) => {
      if (!opened) return;
      opened = false;
      trigger.setAttribute('aria-expanded', 'false');
      surface.classList.remove(openClass, hoverClass);
      window.clearTimeout(hideTimer);
      hideTimer = 0;
      note.hidden = true;
      if (restoreFocus) trigger.focus({ preventScroll: true });
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && opened) {
        event.preventDefault();
        closeContact({ restoreFocus: true });
      }
    };

    const onPointerEnter = () => setHover(true);
    const onPointerLeave = () => setHover(false);
    const onFocus = () => setHover(true);
    const onBlur = () => setHover(false);
    const onCloseClick = () => closeContact({ restoreFocus: false });
    trigger.addEventListener('pointerenter', onPointerEnter);
    trigger.addEventListener('pointerleave', onPointerLeave);
    trigger.addEventListener('focus', onFocus);
    trigger.addEventListener('blur', onBlur);
    trigger.addEventListener('click', openContact);
    close.addEventListener('click', onCloseClick);
    window.addEventListener('keydown', onKeyDown);

    return {
      destroy() {
        trigger.removeEventListener('pointerenter', onPointerEnter);
        trigger.removeEventListener('pointerleave', onPointerLeave);
        trigger.removeEventListener('focus', onFocus);
        trigger.removeEventListener('blur', onBlur);
        trigger.removeEventListener('click', openContact);
        close.removeEventListener('click', onCloseClick);
        window.removeEventListener('keydown', onKeyDown);
        window.clearTimeout(hideTimer);
        driftLoop?.kill();
      }
    };
  }

  function initSurfaceEffects(surface) {
    const particleField = surface.querySelector('.surface-water-particles');
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
      // Keep the stars authored and sparse rather than regenerating an even
      // random field on every load. Each entry is [x%, y%, size, strength,
      // twinkle duration, phase] so the sky keeps deliberate negative space
      // while retaining gentle individual variation.
      const starLayout = [
        [8, 10, 1.45, .72, 7.8, -1.4],
        [17, 31, 1.2, .62, 6.9, -3.1],
        [25, 13, 2.15, 1.08, 8.6, -4.8],
        [32, 38, 1.1, .58, 7.2, -2.2],
        [40, 8, 1.25, .68, 9.4, -5.9],
        [47, 27, 1.55, .82, 7.6, -1.8],
        [55, 14, 2.35, 1.22, 10.2, -6.4],
        [63, 35, 1.15, .56, 8.1, -3.7],
        [70, 19, 1.7, .86, 9.1, -7.2],
        [78, 7, 1.05, .5, 6.7, -2.7],
        [85, 29, 1.9, .94, 8.8, -5.1],
        [92, 14, 1.25, .64, 7.4, -4.2],
        [13, 21, .95, .44, 9.8, -8.3],
        [58, 41, 1.05, .46, 10.8, -6.8]
      ];
      starLayout.forEach(([x, y, size, strength, duration, phase]) => {
        const star = document.createElement('i');
        star.className = 'sky-star';
        star.style.left = `${x}%`;
        star.style.top = `${y}%`;
        star.style.setProperty('--star-size', `${size}px`);
        star.style.setProperty('--star-strength', strength);
        star.style.setProperty('--star-twinkle-duration', `${duration}s`);
        star.style.setProperty('--star-twinkle-phase', `${phase}s`);
        skyDetails.appendChild(star);
      });
      // Meteors stay inside the existing sky-details star field. They are
      // intentionally sparse and only animate during BLUE HOUR (the current
      // night-like time state), so they never compete with the daytime sky.
      const meteorLayout = [
        [48, 13, 56, 18, 15.5, -3.2],
        [79, 19, 42, 24, 22, -12.4]
      ];
      meteorLayout.forEach(([x, y, length, angle, duration, delay]) => {
        const meteor = document.createElement('i');
        meteor.className = 'sky-meteor';
        meteor.setAttribute('aria-hidden', 'true');
        meteor.style.setProperty('--meteor-x', `${x}%`);
        meteor.style.setProperty('--meteor-y', `${y}%`);
        meteor.style.setProperty('--meteor-length', `${length}px`);
        meteor.style.setProperty('--meteor-angle', `${angle}deg`);
        meteor.style.setProperty('--meteor-duration', `${duration}s`);
        meteor.style.setProperty('--meteor-delay', `${delay}s`);
        skyDetails.appendChild(meteor);
      });
    }
    if (particleField && !particleField.children.length) {
      for (let i = 0; i < 12; i += 1) {
        const particle = document.createElement('i');
        particle.className = 'surface-water-particle';
        particle.style.left = `${8 + Math.random() * 84}%`;
        particle.style.top = `${56 + Math.random() * 28}%`;
        particle.style.width = `${1.2 + Math.random() * 2.2}px`;
        particle.style.height = particle.style.width;
        particle.style.opacity = `${.08 + Math.random() * .12}`;
        particle.dataset.driftX = `${-18 + Math.random() * 36}`;
        particle.dataset.driftY = `${-12 + Math.random() * 24}`;
        particleField.appendChild(particle);
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
    const particleNodes = particleField ? [...particleField.querySelectorAll('.surface-water-particle')] : [];
    if (!gs && !reducedMotion) {
      particleNodes.forEach((particle, index) => {
        const driftX = Number(particle.dataset.driftX) || 0;
        const driftY = Number(particle.dataset.driftY) || 0;
        particle.style.setProperty('--particle-drift-x', `${driftX}px`);
        particle.style.setProperty('--particle-drift-y', `${driftY}px`);
        particle.style.animation = `surface-particle-drift ${8.5 + index * .6}s ease-in-out ${index * -.35}s infinite alternate`;
      });
    }
    if (!gs || reducedMotion) return;
    gs.utils.toArray('.sky-cloud', skyDetails).forEach((cloud, index) => {
      gs.to(cloud, { x: index % 2 ? 72 : -64, y: index % 2 ? 6 : -3, duration: (20 + index * 4) / 2, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: index * -.8 });
    });
    // Star brightness is owned by the data-time CSS states so DAY → SUNSET
    // → BLUE HOUR can interpolate cleanly. The per-star CSS animation below
    // supplies only a slow, tiny scale variation; no GSAP opacity tween should
    // write an inline value over the time-of-day state.
    gs.utils.toArray('.surface-water-particle', particleField).forEach((particle, index) => {
      const driftX = Number(particle.dataset.driftX) || 0;
      const driftY = Number(particle.dataset.driftY) || 0;
      const duration = 8.5 + index * .6;
      const baseOpacity = Number(particle.style.opacity) || .12;
      gs.to(particle, {
        x: driftX,
        y: driftY,
        opacity: baseOpacity * 1.18,
        duration,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: index * -.35
      });
    });
    const fills = waveLayer ? [...waveLayer.querySelectorAll('.surface-wave-fill,.surface-wave-sheen')] : [];
    const morphTargets = [
      'M0,34 C120,-18 250,92 430,20 C610,-28 760,98 930,18 C1110,-24 1260,94 1440,12 L1440,360 L0,360 Z',
      'M0,70 C150,10 276,112 438,34 C622,-12 770,112 940,26 C1118,-18 1262,106 1440,20 L1440,360 L0,360 Z'
    ];
    fills.forEach((fill, index) => {
      const duration = index ? 8.2 : 6.8;
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

  // Round 4A ecology preview is temporarily enabled by default on the Surface
  // homepage so the existing prototype locomotion can be visually reviewed.
  // This locomotion is restored from the pre-scatter prototype in b08ecb1:
  // persistent velocity, slow wander and soft boundary steering. Diver input,
  // awareness, avoidance, scatter and debug state are intentionally absent.
  function initSurfaceFishPrototype(surface) {
    const enabled = true;
    const field = surface.querySelector('.surface-fish-prototype-field');
    const nodes = [...(field?.querySelectorAll('.surface-fish-prototype') || [])];
    if (!enabled || !field || nodes.length !== 1) return { destroy() {} };

    surface.dataset.fishPrototype = 'true';
    let box = surface.getBoundingClientRect();

    const configs = [
      {
        id: 'B', start: [.32, .82], heading: .18, cruiseSpeed: 10,
        preferredDepth: .82, habitatTopRatio: .79, habitatBottomRatio: .87,
        wanderPhase: 1.1, wanderFrequency: .00013,
        wanderStrength: .08, turnResponsiveness: .35, maxTurnRate: .12,
        depth: 'mid-lower', motionKind: 'jelly'
      }
    ];

    const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
    const direction = (x, y, fallback = { x: 1, y: 0 }) => {
      const length = Math.hypot(x, y);
      return length > .0001 ? { x: x / length, y: y / length } : fallback;
    };
    const initialTime = performance.now();
    const fishes = nodes.map((element, index) => {
      const config = configs[index];
      const heading = config.heading;
      return {
        element,
        config,
        position: { x: config.start[0] * box.width, y: config.start[1] * box.height },
        velocity: { x: Math.cos(heading) * config.cruiseSpeed, y: Math.sin(heading) * config.cruiseSpeed },
        heading,
        wanderState: 0,
        wanderPhase: config.wanderPhase,
        poseAngle: 0,
        facing: Math.cos(heading) >= 0 ? 'right' : 'left',
        lastRendered: { x: 0, y: 0 }
      };
    });

    const renderFish = (fish, now = performance.now()) => {
      if (fish.config.motionKind === 'jelly') {
        const floatAngle = Math.sin(now * .00105 + fish.config.wanderPhase) * 2.2;
        fish.element.dataset.facing = 'left';
        fish.element.dataset.visualPitch = '0.00';
        fish.element.style.transform = `translate3d(${fish.position.x}px,${fish.position.y}px,0) translate(-50%,-50%) rotate(${floatAngle.toFixed(2)}deg)`;
        fish.lastRendered = { x: fish.position.x, y: fish.position.y };
        return;
      }
      // Candidate fish artwork is authored facing LEFT. Keep the artwork's
      // native orientation for leftward travel and mirror only for rightward
      // travel, so the head always leads the actual horizontal velocity.
      const facingScale = fish.facing === 'left' ? 1 : -1;
      const visualPitch = fish.poseAngle * (fish.facing === 'left' ? 1 : -1);
      fish.element.dataset.facing = fish.facing;
      fish.element.dataset.visualPitch = visualPitch.toFixed(2);
      fish.element.style.transform = `translate3d(${fish.position.x}px,${fish.position.y}px,0) translate(-50%,-50%) rotate(${visualPitch}deg) scaleX(${facingScale})`;
      fish.lastRendered = { x: fish.position.x, y: fish.position.y };
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

    fishes.forEach((fish) => renderFish(fish, initialTime));

    let rafId = 0;
    const tick = (now = performance.now()) => {
      const deltaSeconds = clamp((now - (tick.lastTime || now)) / 1000, .008, .05);
      tick.lastTime = now;
      const boundaryBandX = box.width * .16;
      const boundaryBandY = box.height * .09;
      fishes.forEach((fish) => {
        const habitatTop = box.height * fish.config.habitatTopRatio;
        const habitatBottom = box.height * fish.config.habitatBottomRatio;
        const motionKind = fish.config.motionKind || 'fish';
        const motionScale = reducedMotion ? .34 : 1;

        if (motionKind === 'jelly') {
          const preferredY = fish.config.preferredDepth * box.height;
          const floatOffset = Math.sin(now * .00105 + fish.config.wanderPhase) * box.height * .012 * motionScale;
          // Keep the jelly just left of the Dive CTA. It retains the authored
          // vertical float, but its horizontal movement is intentionally local
          // so it never sweeps across the long-fin fish or the CTA copy.
          const jellyAnchorX = box.width * .32;
          const jellyOffset = Math.sin(now * .00017 + fish.config.wanderPhase * 1.7) * box.width * .028 * motionScale;
          const jellyTargetX = jellyAnchorX + jellyOffset;
          fish.position.x += (jellyTargetX - fish.position.x) * clamp(deltaSeconds * 1.2, .012, .08);
          fish.position.y += (preferredY + floatOffset - fish.position.y) * clamp(deltaSeconds * 1.4, .012, .08);
          fish.position.x = clamp(fish.position.x, box.width * .25, box.width * .39);
          fish.position.y = clamp(fish.position.y, habitatTop, habitatBottom);
          renderFish(fish, now);
          return;
        }
        const forward = { x: Math.cos(fish.heading), y: Math.sin(fish.heading) };
        const lateral = { x: -forward.y, y: forward.x };
        const wanderTarget = Math.sin(now * fish.config.wanderFrequency + fish.wanderPhase) * fish.config.wanderStrength * motionScale;
        fish.wanderState += (wanderTarget - fish.wanderState) * clamp(deltaSeconds * .55, .004, .04);
        const wander = direction(
          forward.x + lateral.x * fish.wanderState,
          forward.y + lateral.y * fish.wanderState,
          forward
        );
        const boundary = {
          x: clamp((box.width * .08 + boundaryBandX - fish.position.x) / boundaryBandX, 0, 1)
            - clamp((fish.position.x - (box.width * .92 - boundaryBandX)) / boundaryBandX, 0, 1),
          y: clamp((habitatTop + boundaryBandY - fish.position.y) / boundaryBandY, 0, 1)
            - clamp((fish.position.y - (habitatBottom - boundaryBandY)) / boundaryBandY, 0, 1)
        };
        const preferredY = fish.config.preferredDepth * box.height;
        const depthTendency = clamp((preferredY - fish.position.y) / Math.max(1, box.height * .16), -.7, .7);
        const desiredDirection = direction(
          wander.x + boundary.x * .82,
          wander.y + boundary.y * .82 + depthTendency * .4,
          forward
        );
        const desiredHeading = Math.atan2(desiredDirection.y, desiredDirection.x);
        const maxHeadingDelta = fish.config.maxTurnRate * fish.config.turnResponsiveness * deltaSeconds;
        fish.heading += clamp(angleDelta(fish.heading, desiredHeading), -maxHeadingDelta, maxHeadingDelta);
        const targetSpeed = fish.config.cruiseSpeed * motionScale;
        const velocityEase = clamp(deltaSeconds * (2.2 + fish.config.turnResponsiveness), .018, .14);
        fish.velocity.x += (Math.cos(fish.heading) * targetSpeed - fish.velocity.x) * velocityEase;
        fish.velocity.y += (Math.sin(fish.heading) * targetSpeed - fish.velocity.y) * velocityEase;
        fish.position.x += fish.velocity.x * deltaSeconds;
        fish.position.y += fish.velocity.y * deltaSeconds;
        // Allow authored velocity to carry a fish briefly beyond the frame;
        // the soft boundary turns it back for a natural entry/exit rather than
        // pinning it to a visible rectangle.
        fish.position.x = clamp(fish.position.x, -box.width * .12, box.width * 1.12);
        fish.position.y = clamp(fish.position.y, habitatTop, habitatBottom);
        const horizontalVelocity = fish.velocity.x;
        // Flip as soon as sustained horizontal velocity crosses the threshold;
        // this keeps the head aligned with the actual travel direction without
        // introducing a visible facing lag or changing the locomotion itself.
        if (horizontalVelocity > .55) fish.facing = 'right';
        else if (horizontalVelocity < -.55) fish.facing = 'left';
        const speed = Math.hypot(fish.velocity.x, fish.velocity.y) || 1;
        const verticalRatio = fish.velocity.y / speed;
        const verticalDeadZone = .08;
        const compressedVerticalRatio = Math.abs(verticalRatio) <= verticalDeadZone
          ? 0
          : Math.sign(verticalRatio) * clamp((Math.abs(verticalRatio) - verticalDeadZone) / (1 - verticalDeadZone), 0, 1);
        const targetPitch = clamp(compressedVerticalRatio * 4.5, -4.5, 4.5);
        const pitchEase = clamp(deltaSeconds * 1.35, .012, .1);
        fish.poseAngle += (targetPitch - fish.poseAngle) * pitchEase;
        renderFish(fish);
      });
    };
    const loop = (now) => { tick(now); rafId = window.requestAnimationFrame(loop); };
    rafId = window.requestAnimationFrame(loop);

    return {
      destroy() {
        if (rafId) window.cancelAnimationFrame(rafId);
        window.removeEventListener('resize', onResize);
        delete surface.dataset.fishPrototype;
        nodes.forEach((node) => {
          node.hidden = false;
          node.style.transform = '';
          delete node.dataset.facing;
          delete node.dataset.visualPitch;
        });
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

  function spawnSurfaceWake(surface, tracker) {
    if (reducedMotion) return;
    const field = surface.querySelector('.surface-wake-field');
    if (!field) return;
    const box = surface.getBoundingClientRect();
    const position = tracker.getPosition();
    const velocity = tracker.getVelocity();
    const speed = Number.isFinite(velocity.speed) ? velocity.speed : Math.hypot(velocity.x || 0, velocity.y || 0);
    if (speed < .1) return;
    const history = Array.isArray(tracker.history) && tracker.history.length
      ? tracker.history
      : [{ ...position }];
    // history[0] is the Diver's current position. Sample older points and
    // render them oldest -> newest so the wake follows curves instead of
    // leaving isolated rings at unrelated positions.
    const points = [];
    for (let index = Math.min(history.length - 1, 32); index >= 3; index -= 3) {
      const point = history[index];
      const previous = points[points.length - 1];
      if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 1.5) points.push({ ...point, historyIndex: index });
    }
    if (!points.length) return;
    const intensity = clamp((speed - .1) / 4.8, 0, 1);
    points.forEach((point, pointIndex) => {
      const newer = history[Math.max(0, point.historyIndex - 2)] || point;
      const older = history[Math.min(history.length - 1, point.historyIndex + 2)] || point;
      const tangentX = newer.x - older.x;
      const tangentY = newer.y - older.y;
      const motionX = tangentX || velocity.x;
      const motionY = tangentY || velocity.y;
      const tangentLength = Math.hypot(motionX, motionY) || speed;
      const normalX = -(motionY / tangentLength);
      const normalY = motionX / tangentLength;
      const newestAmount = points.length > 1 ? pointIndex / (points.length - 1) : 1;
      const ageAmount = 1 - newestAmount;
      const trace = document.createElement('i');
      trace.className = 'surface-wake-trace';
      // Spread older samples farther across the normal of the path. This
      // creates a loose disturbance field instead of a single tail nozzle.
      const crossOffset = (Math.random() - .5) * (3 + ageAmount * 14);
      const traceX = point.x + normalX * crossOffset;
      const traceY = point.y + normalY * crossOffset;
      const angle = Math.atan2(motionY, motionX) * 180 / Math.PI + 90;
      trace.style.left = `${clamp(traceX, 12, box.width - 12)}px`;
      // The wake field starts at the waterline, so convert scene-space Y once
      // at spawn. The trace then remains detached in world space.
      trace.style.top = `${Math.max(0, traceY - box.height * .5)}px`;
      // The path follows the Diver's history, while each water disturbance
      // stays vertically elongated (normal to a horizontal swim direction).
      trace.style.width = `${18 + ageAmount * 26 + intensity * 4 + Math.random() * 5}px`;
      trace.style.height = `${58 + ageAmount * 56 + intensity * 8 + Math.random() * 10}px`;
      trace.style.setProperty('--wake-angle', `${angle}deg`);
      trace.style.setProperty('--wake-blur', `${.22 + ageAmount * .88}px`);
      trace.style.setProperty('--wake-opacity', `${.42 + newestAmount * .34 + intensity * .1}`);
      trace.style.setProperty('--wake-start-opacity', `${.18 + newestAmount * .18}`);
      const duration = 3.2 + ageAmount * 1.2 + Math.random() * .35;
      field.appendChild(trace);
      if (gs) {
        gs.fromTo(trace, {
          autoAlpha: .18 + newestAmount * .18,
          scale: .78,
          xPercent: -50,
          yPercent: -50,
          rotation: angle
        }, {
          autoAlpha: .42 + newestAmount * .34 + intensity * .1,
          scale: 1,
          xPercent: -50,
          yPercent: -50,
          duration: .12,
          ease: 'sine.out'
        });
        gs.to(trace, {
          autoAlpha: 0,
          scale: 1.14,
          xPercent: -50,
          yPercent: -50,
          duration,
          delay: .12,
          ease: 'sine.out',
          onComplete: () => trace.remove()
        });
      } else {
        trace.style.setProperty('--wake-duration', `${duration}s`);
        trace.style.animationDuration = `${duration}s`;
        trace.classList.add('is-active');
        window.setTimeout(() => trace.remove(), duration * 1000 + 80);
      }
    });
    const traces = field.querySelectorAll('.surface-wake-trace');
    if (traces.length > 64) [...traces].slice(0, traces.length - 64).forEach((trace) => trace.remove());
  }

  function spawnSurfaceDiverBubble(surface, tracker) {
    if (reducedMotion) return;
    const field = surface.querySelector('.surface-bubbles');
    if (!field) return;
    const box = surface.getBoundingClientRect();
    const position = tracker.getPosition();
    const velocity = tracker.getVelocity();
    const speed = Number.isFinite(velocity.speed) ? velocity.speed : Math.hypot(velocity.x || 0, velocity.y || 0);
    if (speed < .14) return;
    const length = Math.max(.001, speed);
    const dirX = (velocity.x || 0) / length;
    const dirY = (velocity.y || 0) / length;
    const spawnX = clamp(position.x - dirX * (16 + Math.random() * 8), 16, box.width - 16);
    const spawnY = clamp(position.y - dirY * (12 + Math.random() * 8), box.height * .55, box.height * .82);
    const localTop = Math.max(18, spawnY - box.height * .5);
    const riseDistance = Math.min(112, Math.max(8, localTop - 14));
    const intensity = clamp((speed - .32) / 4.5, 0, 1);
    // Keep the bubbles sparse, but large/solid enough to read against the
    // pale water at normal desktop preview scale.
    const size = 14 + Math.random() * (8 + intensity * 8);
    const bubble = document.createElement('i');
    bubble.className = 'surface-bubble surface-diver-bubble';
    bubble.style.left = `${spawnX}px`;
    bubble.style.top = `${localTop}px`;
    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    field.appendChild(bubble);
    const sideDrift = (Math.random() - .5) * (18 + intensity * 20);
    const driftX = sideDrift - dirX * 8;
    const driftY = -riseDistance;
    const duration = 2.6 + Math.random() * .7 + intensity * .35;
    const endScale = .88 + Math.random() * .3;
    if (gs) {
      gs.fromTo(bubble, {
        autoAlpha: .42,
        scale: .64,
        xPercent: -50,
        yPercent: -50
      }, {
        autoAlpha: .9 + intensity * .08,
        scale: endScale,
        xPercent: -50,
        yPercent: -50,
        x: driftX,
        y: driftY,
        duration,
        ease: 'sine.out',
        onComplete: () => bubble.remove()
      });
    } else {
      bubble.style.setProperty('--bubble-dx', `${driftX}px`);
      bubble.style.setProperty('--bubble-dy', `${driftY}px`);
      bubble.style.setProperty('--bubble-end-scale', endScale.toFixed(2));
      bubble.style.animationDuration = `${duration}s`;
      bubble.classList.add('is-active');
      window.setTimeout(() => bubble.remove(), duration * 1000 + 80);
    }
  }

  function initSurfaceIdleSystem(surface, tracker, timeSystem) {
    let stillFor = 0;
    let calm = false;
    let nextWakeAt = 0;
    let nextBubbleAt = 0;
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
      const now = performance.now();
      if (velocity.speed > .1) {
        nextWakeAt = now + 260;
        if (velocity.speed > .14 && now >= nextBubbleAt) {
          spawnSurfaceDiverBubble(surface, tracker);
          nextBubbleAt = now + clamp(180 - velocity.speed * 10, 120, 210);
        }
      } else {
        nextWakeAt = now + 260;
        nextBubbleAt = now + 420;
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
    const allWaves = [...layer.querySelectorAll('.transition-wave')];
    const waves = allWaves.slice(0, 2);
    allWaves.slice(2).forEach((wave) => { wave.style.display = 'none'; });
    const emoji = layer.querySelector('.transition-emoji');
    const ui = surface.querySelectorAll('.site-nav,.home-copy,.caption,.dive-entry,.dive-trigger');
    const pointCount = 11;
    const initialY = 101;
    const targetY = [
      [-14, 3, -9, -18, 1, -12, -5, -20, 0, -15, -7],
      [-19, -6, -14, -3, -17, -8, -21, -5, -16, -2, -12]
    ];
    const pointDelays = [
      [.08, .34, .16, .48, .27, .62, .4, .76, .56, .88, .68],
      [.18, .04, .3, .12, .46, .24, .58, .36, .7, .5, .82]
    ];
    const buildWashPath = (points) => {
      const step = 100 / (points.length - 1);
      let d = `M 0 ${points[0]} C`;
      for (let i = 0; i < points.length - 1; i += 1) {
        const x = step * (i + 1);
        const cp = x - step / 2;
        d += ` ${cp} ${points[i]} ${cp} ${points[i + 1]} ${x} ${points[i + 1]}`;
      }
      return `${d} L 100 100 L 0 100 Z`;
    };
    const pointSets = waves.map(() => Array.from({ length: pointCount }, () => initialY));
    const renderWash = () => pointSets.forEach((points, index) => waves[index].setAttribute('d', buildWashPath(points)));
    renderWash();

    if (!gs || reducedMotion) {
      layer.style.display = 'block';
      layer.style.opacity = '1';
      ui.forEach((item) => { item.style.opacity = '0'; item.style.filter = 'blur(4px)'; });
      pointSets.forEach((points, index) => {
        points.splice(0, points.length, ...targetY[index]);
        waves[index].style.opacity = '.96';
        waves[index].setAttribute('d', buildWashPath(points));
      });
      if (emoji) {
        emoji.style.display = 'block';
        emoji.style.opacity = '1';
        emoji.style.transform = 'translate(-50%,-50%) scale(.78)';
      }
      window.setTimeout(() => { window.location.assign(entry.href); }, reducedMotion ? 500 : 1200);
      return;
    }

    gs.set(layer, { display: 'block', autoAlpha: 1 });
    gs.set(waves, { opacity: 0 });
    gs.set(emoji, { display: 'block', autoAlpha: 0, xPercent: -50, yPercent: -50, scale: .72, rotation: 0 });
    const tl = gs.timeline({
      defaults: { ease: 'power2.out' },
      onUpdate: renderWash,
      onComplete: () => window.location.assign(entry.href)
    });
    tl.to(ui, { autoAlpha: 0, filter: 'blur(4px)', duration: .3, stagger: .02 }, 0)
      .to(waves, { opacity: .93, duration: .28, stagger: .16, ease: 'sine.out' }, .05);
    if (emoji) {
      tl.to(emoji, { autoAlpha: 1, scale: .9, duration: .32, ease: 'power2.out' }, .22)
        .to(emoji, { yPercent: -60, scale: 1, rotation: 2, duration: .48, ease: 'sine.inOut' }, .54)
        .to(emoji, { autoAlpha: 0, scale: .32, duration: .3, ease: 'power2.in' }, 1.16);
    }
    pointSets.forEach((points, layerIndex) => {
      points.forEach((_, pointIndex) => {
        tl.to(points, {
          [pointIndex]: targetY[layerIndex][pointIndex],
          duration: 1.52 + layerIndex * .18,
          ease: 'power2.inOut'
        }, .16 + pointDelays[layerIndex][pointIndex] + layerIndex * .22);
      });
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

  function initContinuousDescent(world) {
    const swimmer = world.querySelector('.swimmer');
    const tracker = new DiverPointerTracker(world, swimmer);
    const depthReadout = world.querySelector('.descent-depth b');
    const instruction = world.querySelector('.descent-instruction');
    const onboarding = world.querySelector('.descent-onboarding');
    const signals = [...world.querySelectorAll('[data-signal-start]')];
    const sideNodes = [...world.querySelectorAll('[data-side-start]')];
    const writingNodes = [...world.querySelectorAll('[data-writing-start]')];
    const deepNodes = [...world.querySelectorAll('[data-deep-start]')];
    const approachNodes = [...world.querySelectorAll('[data-approach]')];
    const scrollSpacer = document.querySelector('.descent-scroll-spacer');
    const debugHiddenCave = DEBUG_HIDDEN_CAVE || new URLSearchParams(window.location.search).has('debug-hidden-cave');
    document.body.classList.toggle('debug-hidden-cave', debugHiddenCave);
    if (debugHiddenCave && scrollSpacer) scrollSpacer.style.height = '520vh';
    const baseBoundaryStops = [
      { at: 0, left: .31, right: .69, zone: 'entry' },
      { at: .14, left: .12, right: .88, zone: 'opening' },
      { at: .34, left: .08, right: .92, zone: 'great-chamber' },
      { at: .51, left: .31, right: .69, zone: 'writing-passage' },
      { at: .65, left: .27, right: .86, zone: 'side-expansion' },
      { at: .78, left: .14, right: .88, zone: 'quiet-descent' },
      { at: .92, left: .08, right: .92, zone: 'deepest-point' },
      { at: 1, left: .1, right: .9, zone: 'deepest-point' }
    ];
    const boundaryStops = debugHiddenCave ? [
      ...baseBoundaryStops.slice(0, 7),
      { at: .965, left: .23, right: .77, zone: 'hidden-cave' },
      { at: 1, left: .25, right: .75, zone: 'hidden-cave' }
    ] : baseBoundaryStops;
    let viewport = { width: 0, height: 0, halfW: 66, halfH: 47, maxDepth: 1 };
    let targetDepth = 0;
    let currentDepth = 0;
    let dirty = true;
    let onboardingDismissed = false;
    let ascentActive = false;
    let bubbleTimer = 0;
    let ascentTimeline = null;
    let pullActive = false;
    let pullPointerId = null;
    let pullStartY = 0;
    let pullDistance = 0;
    const lifeline = world.querySelector('.descent-lifeline');
    const ascentBubbles = world.querySelector('.ascent-bubbles');
    const PULL_THRESHOLD = 118;
    const PULL_MAX = 174;

    const dismissOnboarding = () => {
      if (onboardingDismissed || !onboarding) return;
      onboardingDismissed = true;
      onboarding.classList.add('is-dismissed');
      window.removeEventListener('wheel', dismissOnboarding);
      window.removeEventListener('touchmove', dismissOnboarding);
      window.removeEventListener('keydown', onOnboardingKey);
    };

    const onOnboardingKey = (event) => {
      if (['ArrowDown', 'PageDown', ' ', 'Spacebar'].includes(event.key)) dismissOnboarding();
    };

    const setPullVisual = (distance) => {
      if (!lifeline) return;
      pullDistance = clamp(distance, 0, PULL_MAX);
      const ratio = pullDistance / PULL_MAX;
      lifeline.style.setProperty('--rope-pull', `${pullDistance.toFixed(1)}px`);
      lifeline.style.setProperty('--rope-stretch', ratio.toFixed(3));
    };

    const springLifelineBack = () => {
      if (!lifeline) return;
      lifeline.classList.remove('is-pulling');
      if (gs && !reducedMotion) {
        gs.to(lifeline, {
          '--rope-pull': '0px',
          '--rope-stretch': 0,
          duration: .72,
          ease: 'elastic.out(1,.42)',
          overwrite: 'auto'
        });
      } else {
        setPullVisual(0);
      }
    };

    const spawnAscentBubble = (origin, intensity) => {
      if (!ascentBubbles) return;
      const nearDiver = Math.random() < .62;
      const size = nearDiver
        ? 10 + Math.random() * (18 + intensity * 14)
        : 24 + Math.random() * (20 + intensity * 34);
      const startX = nearDiver
        ? clamp(origin.x + (Math.random() - .5) * (44 + intensity * 86), 14, viewport.width - 14)
        : 18 + Math.random() * Math.max(20, viewport.width - 36);
      const startY = nearDiver
        ? clamp(origin.y + 18 + Math.random() * (28 + intensity * 44), viewport.height * .38, viewport.height + 18)
        : viewport.height - size * .28 + Math.random() * 70;
      const bubble = document.createElement('i');
      bubble.className = 'ascent-bubble';
      bubble.style.setProperty('--bubble-x', `${startX.toFixed(1)}px`);
      bubble.style.setProperty('--bubble-y', `${startY.toFixed(1)}px`);
      bubble.style.setProperty('--bubble-size', `${size.toFixed(1)}px`);
      if (size > 42) bubble.style.filter = 'blur(2.2px)';
      ascentBubbles.appendChild(bubble);
      if (gs) {
        gs.fromTo(bubble, {
          autoAlpha: 0,
          scale: nearDiver ? .48 : .62,
          x: 0,
          y: 0
        }, {
          autoAlpha: nearDiver ? .72 : .42,
          scale: .92 + intensity * .24,
          x: (Math.random() - .5) * (18 + intensity * 38),
          y: -(viewport.height * (.82 + Math.random() * .42)),
          duration: 1.35 + Math.random() * .75 - intensity * .16,
          ease: 'power1.out',
          onComplete: () => bubble.remove()
        });
      } else {
        bubble.style.opacity = nearDiver ? '.62' : '.36';
        bubble.style.animation = `ascent-bubble-rise ${1.8 - intensity * .3}s ease-out forwards`;
        window.setTimeout(() => bubble.remove(), 2100);
      }
    };

    const startBubbleStream = (origin) => {
      if (bubbleTimer || !ascentBubbles) return;
      let intensity = .12;
      bubbleTimer = window.setInterval(() => {
        intensity = clamp(intensity + .055, .12, 1);
        const count = intensity > .62 ? 2 : 1;
        for (let i = 0; i < count; i += 1) spawnAscentBubble(origin, intensity);
      }, 104);
    };

    const stopBubbleStream = () => {
      if (bubbleTimer) window.clearInterval(bubbleTimer);
      bubbleTimer = 0;
    };

    const resetDepthBehindBubbles = () => {
      targetDepth = 0;
      currentDepth = 0;
      dirty = true;
      window.scrollTo(0, 0);
    };

    const lockAscentScroll = (event) => event.preventDefault();

    const finishAscent = () => {
      stopBubbleStream();
      window.removeEventListener('wheel', lockAscentScroll);
      window.location.assign('index.html');
    };

    const beginAscent = () => {
      if (ascentActive || !lifeline) return;
      ascentActive = true;
      const diverOrigin = tracker.getPosition();
      lifeline.classList.remove('is-pulling');
      lifeline.classList.add('is-ascent');
      document.body.classList.add('is-ascent-active');
      world.classList.add('is-ascent-active');
      window.addEventListener('wheel', lockAscentScroll, { passive: false });
      tracker.setPointerFollowEnabled(false);
      tracker.destroy();
      if (!gs || reducedMotion) {
        world.style.setProperty('--ascent-light', '1');
        world.style.setProperty('--ascent-bubbles-opacity', '0');
        resetDepthBehindBubbles();
        window.setTimeout(finishAscent, 520);
        return;
      }
      gs.killTweensOf(swimmer);
      gs.set(world, {
        '--ascent-light': 0,
        '--ascent-bubbles-opacity': 0,
        '--ascent-distant-shift': '0px',
        '--ascent-middle-shift': '0px',
        '--ascent-foreground-shift': '0px',
        '--ascent-content-shift': '0px'
      });
      ascentTimeline = gs.timeline({
        defaults: { ease: 'power2.out' },
        onComplete: finishAscent
      });
      ascentTimeline
        .to(lifeline, { '--rope-pull': '0px', '--rope-stretch': 0, duration: .56, ease: 'elastic.out(1,.42)' }, 0)
        .to(swimmer, { rotation: -78, duration: .62, ease: 'power2.inOut' }, 0)
        .to(world, {
          '--ascent-distant-shift': '20vh',
          '--ascent-middle-shift': '42vh',
          '--ascent-foreground-shift': '56vh',
          '--ascent-content-shift': '72vh',
          '--ascent-light': .16,
          '--ascent-bubbles-opacity': .5,
          duration: 1.05,
          ease: 'power1.in'
        }, .18)
        .call(() => startBubbleStream(diverOrigin), [], .3)
        .to(swimmer, { y: -106, duration: .92, ease: 'power1.in' }, .35)
        .to(world, {
          '--ascent-distant-shift': '42vh',
          '--ascent-middle-shift': '78vh',
          '--ascent-foreground-shift': '98vh',
          '--ascent-content-shift': '118vh',
          '--ascent-light': .46,
          '--ascent-bubbles-opacity': .82,
          duration: 1.1,
          ease: 'power1.in'
        }, .8)
        .to(swimmer, { y: -560, rotation: -62, duration: 2.2, ease: 'power2.in' }, .92)
        .to(world, {
          '--ascent-distant-shift': '66vh',
          '--ascent-middle-shift': '120vh',
          '--ascent-foreground-shift': '150vh',
          '--ascent-content-shift': '178vh',
          '--ascent-light': .94,
          '--ascent-bubbles-opacity': 1,
          duration: 1.1,
          ease: 'power2.in'
        }, 1.48)
        .call(resetDepthBehindBubbles, [], 2.34)
        .to(world, { '--ascent-light': 1, duration: .72, ease: 'sine.inOut' }, 2.2)
        .to(world, { '--ascent-bubbles-opacity': 0, duration: .48, ease: 'power1.out' }, 3.02)
        .to(lifeline, { autoAlpha: 0, duration: .2, ease: 'power1.out' }, 3.12);
    };

    if (lifeline) {
      lifeline.addEventListener('pointerenter', () => { if (!ascentActive) lifeline.classList.add('is-near'); });
      lifeline.addEventListener('pointerleave', () => { if (!pullActive) lifeline.classList.remove('is-near'); });
      lifeline.addEventListener('pointerdown', (event) => {
        if (ascentActive || event.button !== 0) return;
        const rect = lifeline.getBoundingClientRect();
        if (event.clientY < rect.top + 54) return;
        pullActive = true;
        pullPointerId = event.pointerId;
        pullStartY = event.clientY;
        setPullVisual(0);
        lifeline.classList.add('is-near', 'is-pulling', 'has-been-touched');
        lifeline.setPointerCapture?.(event.pointerId);
        tracker.setPointerFollowEnabled(false);
        event.preventDefault();
      });
      lifeline.addEventListener('pointermove', (event) => {
        if (!pullActive || event.pointerId !== pullPointerId) return;
        setPullVisual(event.clientY - pullStartY);
        event.preventDefault();
      });
      window.addEventListener('pointermove', (event) => {
        if (!pullActive || event.pointerId !== pullPointerId) return;
        setPullVisual(event.clientY - pullStartY);
        event.preventDefault();
      }, { passive: false });
      const releasePull = (event) => {
        if (!pullActive || (event.pointerId != null && event.pointerId !== pullPointerId)) return;
        const reached = pullDistance >= PULL_THRESHOLD;
        pullActive = false;
        pullPointerId = null;
        lifeline.releasePointerCapture?.(event.pointerId);
        if (reached) beginAscent();
        else {
          tracker.setPointerFollowEnabled(true);
          springLifelineBack();
        }
        event.preventDefault();
      };
      lifeline.addEventListener('pointerup', releasePull);
      lifeline.addEventListener('pointercancel', releasePull);
      window.addEventListener('pointerup', releasePull);
      window.addEventListener('pointercancel', releasePull);
    }

    const interpolateBounds = (progress) => {
      if (progress <= boundaryStops[0].at) return boundaryStops[0];
      const nextIndex = boundaryStops.findIndex((stop) => progress <= stop.at);
      const end = boundaryStops[Math.max(1, nextIndex)];
      const start = boundaryStops[Math.max(0, boundaryStops.indexOf(end) - 1)];
      const span = Math.max(.0001, end.at - start.at);
      const t = clamp((progress - start.at) / span, 0, 1);
      const eased = t * t * (3 - 2 * t);
      return {
        left: start.left + (end.left - start.left) * eased,
        right: start.right + (end.right - start.right) * eased,
        zone: end.zone
      };
    };

    const refreshGeometry = () => {
      const rect = world.getBoundingClientRect();
      const swimmerRect = swimmer?.getBoundingClientRect();
      viewport.width = rect.width;
      viewport.height = rect.height;
      viewport.halfW = (swimmerRect?.width || 132) / 2;
      viewport.halfH = (swimmerRect?.height || 94) / 2;
      viewport.maxDepth = Math.max(1, (scrollSpacer?.offsetHeight || document.documentElement.scrollHeight) - viewport.height);
      targetDepth = clamp(window.scrollY, 0, viewport.maxDepth);
      currentDepth = clamp(currentDepth, 0, viewport.maxDepth);
      tracker.refreshBox();
      dirty = true;
    };

    const applyBounds = (progress) => {
      const boundary = interpolateBounds(progress);
      const edge = Math.max(18, viewport.halfW * .34);
      const minX = clamp(boundary.left * viewport.width + viewport.halfW * .3, viewport.halfW + edge, viewport.width - viewport.halfW - edge);
      const maxX = clamp(boundary.right * viewport.width - viewport.halfW * .3, viewport.halfW + edge, viewport.width - viewport.halfW - edge);
      tracker.setDiveBounds({
        minX,
        maxX: Math.max(minX, maxX),
        minY: viewport.halfH + 18,
        maxY: Math.max(viewport.halfH + 18, viewport.height - viewport.halfH - 22),
        hardMinY: viewport.halfH + 18,
        hardMaxY: Math.max(viewport.halfH + 18, viewport.height - viewport.halfH - 22)
      });
      world.dataset.depthZone = boundary.zone;
      world.dataset.safeLeft = minX.toFixed(1);
      world.dataset.safeRight = Math.max(minX, maxX).toFixed(1);
    };

    const render = () => {
      const delta = targetDepth - currentDepth;
      if (!dirty && Math.abs(delta) < .08) return;
      currentDepth += reducedMotion ? delta : delta * .105;
      if (Math.abs(targetDepth - currentDepth) < .08) currentDepth = targetDepth;
      const progress = clamp(currentDepth / viewport.maxDepth, 0, 1);
      world.style.setProperty('--descent-depth', `${-currentDepth}px`);
      world.style.setProperty('--depth-distant', `${-currentDepth * .42}px`);
      world.style.setProperty('--depth-middle', `${-currentDepth * .9}px`);
      world.style.setProperty('--depth-foreground', `${-currentDepth * 1.08}px`);
      world.style.setProperty('--depth-content', `${-currentDepth}px`);
      applyBounds(progress);
      if (depthReadout) depthReadout.textContent = `${String(Math.round(progress * (debugHiddenCave ? 520 : 420))).padStart(3, '0')}m`;
      if (instruction) instruction.style.opacity = String(.92 - progress * .58);
      signals.forEach((signal) => {
        const start = Number(signal.dataset.signalStart || 0);
        const end = Number(signal.dataset.signalEnd || 1);
        const reveal = clamp((progress - start) / Math.max(.01, end - start), 0, 1);
        const isDistantSignal = signal.classList.contains('distant-signal');
        signal.style.setProperty('--signal-opacity', (isDistantSignal ? .035 + reveal * .245 : .11 + reveal * .73).toFixed(3));
        signal.style.setProperty('--signal-scale', (isDistantSignal ? .55 + reveal * .4 : .78 + reveal * .22).toFixed(3));
        signal.style.setProperty('--signal-blur', `${(isDistantSignal ? 8 - reveal * 4.5 : 2.8 - reveal * 2.8).toFixed(2)}px`);
      });
      sideNodes.forEach((node) => {
        const start = Number(node.dataset.sideStart || 0);
        const end = Number(node.dataset.sideEnd || 1);
        const reveal = clamp((progress - start) / Math.max(.01, end - start), 0, 1);
        node.style.setProperty('--side-opacity', (.08 + reveal * .92).toFixed(3));
        node.style.setProperty('--side-scale', (.94 + reveal * .06).toFixed(3));
        node.style.setProperty('--side-shift', `${((1 - reveal) * 12).toFixed(2)}px`);
        node.style.setProperty('--side-blur', `${((1 - reveal) * 3).toFixed(2)}px`);
      });
      writingNodes.forEach((node) => {
        const start = Number(node.dataset.writingStart || 0);
        const end = Number(node.dataset.writingEnd || 1);
        const reveal = clamp((progress - start) / Math.max(.01, end - start), 0, 1);
        node.style.setProperty('--writing-opacity', (.08 + reveal * .92).toFixed(3));
        node.style.setProperty('--writing-scale', (.96 + reveal * .04).toFixed(3));
        node.style.setProperty('--writing-shift', `${((1 - reveal) * 8).toFixed(2)}px`);
        node.style.setProperty('--writing-blur', `${((1 - reveal) * 3).toFixed(2)}px`);
      });
      approachNodes.forEach((node) => {
        const nodeRect = node.getBoundingClientRect();
        const diverRect = swimmer?.getBoundingClientRect();
        if (!diverRect) return;
        const dx = (diverRect.left + diverRect.width / 2) - (nodeRect.left + nodeRect.width / 2);
        const dy = (diverRect.top + diverRect.height / 2) - (nodeRect.top + nodeRect.height / 2);
        const radius = Math.max(220, Math.min(viewport.width, viewport.height) * .46);
        const proximity = clamp(1 - Math.hypot(dx, dy) / radius, 0, 1);
        node.style.setProperty('--approach-boost', (proximity * .2).toFixed(3));
        node.style.setProperty('--approach-glow', `${(proximity * 22).toFixed(1)}px`);
        if (node.classList.contains('travel-note')) node.style.setProperty('--travel-affordance', (.24 + proximity * .76).toFixed(3));
      });
      deepNodes.forEach((node) => {
        const start = Number(node.dataset.deepStart || 0);
        const end = Number(node.dataset.deepEnd || 1);
        const reveal = clamp((progress - start) / Math.max(.01, end - start), 0, 1);
        node.style.setProperty('--deep-opacity', (.08 + reveal * .92).toFixed(3));
        node.style.setProperty('--deep-scale', (.96 + reveal * .04).toFixed(3));
        node.style.setProperty('--deep-shift', `${((1 - reveal) * 8).toFixed(2)}px`);
        node.style.setProperty('--deep-blur', `${((1 - reveal) * 3).toFixed(2)}px`);
      });
      dirty = Math.abs(targetDepth - currentDepth) >= .08;
    };

    const onScroll = () => {
      if (ascentActive) return;
      targetDepth = clamp(window.scrollY, 0, viewport.maxDepth);
      if (targetDepth > 2) dismissOnboarding();
      dirty = true;
    };

    refreshGeometry();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', dismissOnboarding, { passive: true });
    window.addEventListener('touchmove', dismissOnboarding, { passive: true });
    window.addEventListener('keydown', onOnboardingKey);
    window.addEventListener('resize', refreshGeometry, { passive: true });
    render();
    if (gs) gs.ticker.add(render); else {
      const frame = () => { render(); requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    }
  }

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
    const diverRevealDistance = 88;
    const diverDismissDistance = 142;
    const jelly = world.querySelector('.jelly-return');
    const jellyFloat = jelly?.querySelector('.jelly-float');
    const rays = world.querySelector('.dive-rays');
    if (gs && jellyFloat && !reducedMotion) gs.to(jellyFloat, { y: -15, duration: 3, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    if (gs && rays && !reducedMotion) gs.to(rays, { opacity: .8, skewX: 1.5, duration: 5.5, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    stations.forEach((station) => station.dataset.pending = 'true');

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
    const scheduleHide = () => {
      if (hideTimer) return;
      hideTimer = window.setTimeout(() => {
        hideTimer = 0;
        hideInfo();
      }, 140);
    };
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
      if (activeStation && !stationHovered && !cardHovered) {
        const rect = activeStation.getBoundingClientRect();
        const distance = Math.hypot(current.x - (rect.left - box.left + rect.width / 2), current.y - (rect.top - box.top + rect.height / 2));
        if (distance > diverDismissDistance) scheduleHide();
      }
      stations.forEach((station) => {
        if (station.dataset.pending !== 'true') return;
        const rect = station.getBoundingClientRect();
        const distance = Math.hypot(current.x - (rect.left - box.left + rect.width / 2), current.y - (rect.top - box.top + rect.height / 2));
        if (distance < diverRevealDistance) { reveal(station); station.dataset.pending = 'false'; }
      });
    };
    if (gs) gs.ticker.add(revealTicker); else window.setInterval(revealTicker, 80);
  }

  window.initSurfaceTimeSystem = initSurfaceTimeSystem;

  const surface = document.querySelector('.surface-hero');
  if (surface) {
    initSurfaceEffects(surface);
    initDriftBottleContact(surface);
    const surfaceTracker = new DiverPointerTracker(surface, surface.querySelector('.home-diver'));
    const surfaceTime = initSurfaceTimeSystem(surface);
    initSurfacePlanetSequence(surface);
    initSurfaceFishPrototype(surface);
    const surfaceIdleSystem = initSurfaceIdleSystem(surface, surfaceTracker, surfaceTime);
    const ctaRegion = surface.querySelector('.dive-cta-region');
    const entry = ctaRegion?.querySelector('.dive-trigger');
    if (ctaRegion && entry) {
      let diveStarted = false;
      const setDiveCtaHover = (active) => surface.classList.toggle('is-dive-cta-hover', active);
      const resetDiveCtaParallax = () => {
        entry.style.setProperty('--cta-parallax-x', '0px');
        entry.style.setProperty('--cta-parallax-y', '0px');
      };
      const spawnDiveClickRipple = (event) => {
        const rect = ctaRegion.getBoundingClientRect();
        const x = Number.isFinite(event?.clientX) && event.clientX ? event.clientX - rect.left : rect.width / 2;
        const y = Number.isFinite(event?.clientY) && event.clientY ? event.clientY - rect.top : rect.height / 2;
        const ripple = document.createElement('span');
        ripple.className = 'dive-click-ripple';
        ripple.setAttribute('aria-hidden', 'true');
        ripple.style.setProperty('--ripple-x', `${clamp(x, 8, rect.width - 8)}px`);
        ripple.style.setProperty('--ripple-y', `${clamp(y, 8, rect.height - 8)}px`);
        ripple.innerHTML = '<i></i><i></i>';
        ctaRegion.appendChild(ripple);
        window.setTimeout(() => ripple.remove(), 1200);
      };
      const beginDive = (event) => {
        if (diveStarted) return;
        diveStarted = true;
        surface.classList.add('is-dive-cta-clicking');
        surfaceIdleSystem?.destroy?.();
        surfaceTracker.exitForDive(.2);
        spawnDiveClickRipple(event);
        window.setTimeout(() => playDiveTransition(entry), 300);
      };
      ctaRegion.addEventListener('pointerenter', () => setDiveCtaHover(true));
      ctaRegion.addEventListener('pointerleave', () => setDiveCtaHover(false));
      ctaRegion.addEventListener('mouseenter', () => setDiveCtaHover(true));
      ctaRegion.addEventListener('mouseleave', () => { setDiveCtaHover(false); resetDiveCtaParallax(); });
      ctaRegion.addEventListener('pointermove', (event) => {
        const rect = ctaRegion.getBoundingClientRect();
        const nx = clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2), -1, 1);
        const ny = clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2), -1, 1);
        entry.style.setProperty('--cta-parallax-x', `${(-nx * 3.5).toFixed(2)}px`);
        entry.style.setProperty('--cta-parallax-y', `${(-ny * 3.5).toFixed(2)}px`);
      }, { passive: true });
      ctaRegion.addEventListener('mousemove', (event) => {
        const rect = ctaRegion.getBoundingClientRect();
        const nx = clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2), -1, 1);
        const ny = clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2), -1, 1);
        entry.style.setProperty('--cta-parallax-x', `${(-nx * 3.5).toFixed(2)}px`);
        entry.style.setProperty('--cta-parallax-y', `${(-ny * 3.5).toFixed(2)}px`);
      }, { passive: true });
      ctaRegion.addEventListener('focusin', () => setDiveCtaHover(true));
      ctaRegion.addEventListener('focusout', () => { setDiveCtaHover(false); resetDiveCtaParallax(); });
      entry.addEventListener('click', (event) => {
        event.preventDefault();
        beginDive(event);
      });
      ctaRegion.addEventListener('click', (event) => {
        if (event.target.closest?.('.dive-trigger')) return;
        event.preventDefault();
        beginDive(event);
      });
    }
  }
  const world = document.querySelector('.dive-world');
  if (world) {
    if (world.classList.contains('dive-descent')) initContinuousDescent(world);
    else initDivePage(world);
    const returnJelly = world.querySelector('.jelly-return');
    returnJelly?.addEventListener('click', (event) => {
      event.preventDefault();
      playJellyClick(returnJelly, () => window.location.assign(returnJelly.href));
    });
  }
})();
