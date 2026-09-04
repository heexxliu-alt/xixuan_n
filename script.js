/*
 * Shared interaction layer for the surface and dive scenes.
 * Details/cards are deliberately outside .cursor-layer and are never queried
 * by the pointer tracker.
 */
(() => {
  const gs = window.gsap;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  // One normalized coordinate system for the continuous Deep Sea camera.
  // The accepted v16 physical anchors are preserved against the new master
  // height; only the world below the old Deeper Open Sea extends to 1.0.
  const DEEP_SEA_MASTER = Object.freeze({
    asset: 'assets/deep-sea-world-master-v36-natural-deepest-no-cave.png',
    width: 735,
    height: 3850,
    previousHeight: 2755
  });
  const masterWorldY = (physicalY) => physicalY / DEEP_SEA_MASTER.height;
  const previousMasterWorldY = (normalizedY) => (
    normalizedY * DEEP_SEA_MASTER.previousHeight / DEEP_SEA_MASTER.height
  );
  const DEEP_SEA_WORLD_ANCHORS = Object.freeze({
    upperOpenWaterEnd: previousMasterWorldY(.17),
    riftApproachEnd: previousMasterWorldY(.31),
    riftEnd: previousMasterWorldY(.43),
    riftExitEnd: previousMasterWorldY(.49),
    greatChamberEnd: previousMasterWorldY(.72),
    deeperOpenSeaEnd: masterWorldY(DEEP_SEA_MASTER.height)
  });
  const deeperOpenSeaWorldAt = (fraction) => (
    DEEP_SEA_WORLD_ANCHORS.greatChamberEnd
    + (DEEP_SEA_WORLD_ANCHORS.deeperOpenSeaEnd - DEEP_SEA_WORLD_ANCHORS.greatChamberEnd)
      * clamp(fraction, 0, 1)
  );
  const remapMasterY = (value, property) => {
    if (typeof value === 'number' && (property === 'y' || property === 'yStart' || property === 'yEnd')) {
      return previousMasterWorldY(value);
    }
    if (Array.isArray(value)) return value.map((item) => remapMasterY(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, remapMasterY(nested, key)]));
  };
  const createDeepSeaWorldRanges = (viewportWidth = 1280, viewportHeight = 720) => {
    const previousSceneHeight = viewportWidth * DEEP_SEA_MASTER.previousHeight / DEEP_SEA_MASTER.width;
    const currentSceneHeight = viewportWidth * DEEP_SEA_MASTER.height / DEEP_SEA_MASTER.width;
    const previousMaxDepth = Math.max(1, previousSceneHeight - viewportHeight);
    const currentMaxDepth = Math.max(1, currentSceneHeight - viewportHeight);
    // Keep the already approved upper journey at its old pixel duration. The
    // extra scroll distance introduced by the taller master therefore belongs
    // to the new Deeper Open Sea tail.
    const preservePreviousScroll = (legacyProgress) => clamp(
      legacyProgress * previousMaxDepth / currentMaxDepth,
      0,
      1
    );
    return Object.freeze({
      upperOpenWater: Object.freeze({ scrollStart: 0, scrollEnd: preservePreviousScroll(.20), worldStart: 0, worldEnd: DEEP_SEA_WORLD_ANCHORS.upperOpenWaterEnd, pace: 'slow' }),
      riftApproach: Object.freeze({ scrollStart: preservePreviousScroll(.20), scrollEnd: preservePreviousScroll(.30), worldStart: DEEP_SEA_WORLD_ANCHORS.upperOpenWaterEnd, worldEnd: DEEP_SEA_WORLD_ANCHORS.riftApproachEnd, pace: 'tighten' }),
      rift: Object.freeze({ scrollStart: preservePreviousScroll(.30), scrollEnd: preservePreviousScroll(.40), worldStart: DEEP_SEA_WORLD_ANCHORS.riftApproachEnd, worldEnd: DEEP_SEA_WORLD_ANCHORS.riftEnd, pace: 'direct' }),
      riftExit: Object.freeze({ scrollStart: preservePreviousScroll(.40), scrollEnd: preservePreviousScroll(.47), worldStart: DEEP_SEA_WORLD_ANCHORS.riftEnd, worldEnd: DEEP_SEA_WORLD_ANCHORS.riftExitEnd, pace: 'open' }),
      greatChamber: Object.freeze({ scrollStart: preservePreviousScroll(.47), scrollEnd: preservePreviousScroll(.72), worldStart: DEEP_SEA_WORLD_ANCHORS.riftExitEnd, worldEnd: DEEP_SEA_WORLD_ANCHORS.greatChamberEnd, pace: 'linger' }),
      deeperOpenSea: Object.freeze({ scrollStart: preservePreviousScroll(.72), scrollEnd: 1, worldStart: DEEP_SEA_WORLD_ANCHORS.greatChamberEnd, worldEnd: DEEP_SEA_WORLD_ANCHORS.deeperOpenSeaEnd, pace: 'slow' })
    });
  };
  let DEEP_SEA_WORLD_RANGES = createDeepSeaWorldRanges();
  let DEEP_SEA_WORLD_RANGE_ENTRIES = Object.values(DEEP_SEA_WORLD_RANGES);
  let activeLegacyProgressScale = 1;
  const updateDeepSeaWorldRanges = (viewportWidth, viewportHeight) => {
    const previousSceneHeight = viewportWidth * DEEP_SEA_MASTER.previousHeight / DEEP_SEA_MASTER.width;
    const previousMaxDepth = Math.max(1, previousSceneHeight - viewportHeight);
    const currentSceneHeight = viewportWidth * DEEP_SEA_MASTER.height / DEEP_SEA_MASTER.width;
    const currentMaxDepth = Math.max(1, currentSceneHeight - viewportHeight);
    activeLegacyProgressScale = currentMaxDepth / previousMaxDepth;
    DEEP_SEA_WORLD_RANGES = createDeepSeaWorldRanges(viewportWidth, viewportHeight);
    DEEP_SEA_WORLD_RANGE_ENTRIES = Object.values(DEEP_SEA_WORLD_RANGES);
  };
  const RIFT_AUTO_STATES = Object.freeze({
    FREE: 'FREE',
    ENTERING_RIFT: 'ENTERING_RIFT',
    AUTO_DIVE: 'AUTO_DIVE',
    EXITING_RIFT: 'EXITING_RIFT',
    SETTLING_IN_CHAMBER: 'SETTLING_IN_CHAMBER',
    FREE_IN_CHAMBER: 'FREE_IN_CHAMBER'
  });
  const smoothstep = (value) => value * value * (3 - 2 * value);
  const mapScrollToWorldProgress = (scrollProgress) => {
    const progress = clamp(scrollProgress, 0, 1);
    const range = DEEP_SEA_WORLD_RANGE_ENTRIES.find((item) => progress <= item.scrollEnd)
      || DEEP_SEA_WORLD_RANGE_ENTRIES[DEEP_SEA_WORLD_RANGE_ENTRIES.length - 1];
    const local = clamp(
      (progress - range.scrollStart) / Math.max(.0001, range.scrollEnd - range.scrollStart),
      0,
      1
    );
    const eased = range.pace === 'direct' || range.pace === 'slow'
      ? local
      : smoothstep(local);
    return range.worldStart + (range.worldEnd - range.worldStart) * eased;
  };
  const toLegacyScrollProgress = (scrollProgress) => clamp(
    scrollProgress * activeLegacyProgressScale,
    0,
    1
  );
  const DEEP_SEA_SWIM_MAP_LEGACY = Object.freeze({
    version: 'v1',
    // Lanes keep the approach and descent readable. Great Chamber uses the
    // explicit geometry below so the visible rock masses are not treated as
    // one oversized left/right corridor.
    regions: Object.freeze([
      Object.freeze({ id: 'upperOpenWater', yStart: 0, yEnd: .17, stops: Object.freeze([
        Object.freeze({ y: 0, left: .31, right: .69 }),
        Object.freeze({ y: .17, left: .12, right: .88 })
      ]) }),
      Object.freeze({ id: 'riftApproach', yStart: .17, yEnd: .31, stops: Object.freeze([
        Object.freeze({ y: .17, left: .14, right: .86 }),
        Object.freeze({ y: .31, left: .29, right: .71 })
      ]) }),
      Object.freeze({ id: 'rift', yStart: .31, yEnd: .43, stops: Object.freeze([
        Object.freeze({ y: .31, left: .29, right: .71 }),
        Object.freeze({ y: .43, left: .37, right: .63 })
      ]) }),
      Object.freeze({ id: 'riftExit', yStart: .43, yEnd: .49, stops: Object.freeze([
        Object.freeze({ y: .43, left: .37, right: .63 }),
        Object.freeze({ y: .49, left: .23, right: .77 })
      ]) }),
      Object.freeze({ id: 'greatChamber', yStart: .49, yEnd: .72, stops: Object.freeze([
        Object.freeze({ y: .49, left: .23, right: .77 }),
        Object.freeze({ y: .64, left: .13, right: .87 }),
        Object.freeze({ y: .72, left: .10, right: .90 })
      ]) }),
      Object.freeze({ id: 'deeperOpenSea', yStart: .72, yEnd: 1, stops: Object.freeze([
        Object.freeze({ y: .72, left: .10, right: .90 }),
        Object.freeze({ y: .90, left: .08, right: .92 }),
        Object.freeze({ y: 1, left: .18, right: .82 })
      ]) })
    ]),
    geometry: Object.freeze({
      greatChamber: Object.freeze({
        // A single broad, asymmetric central water body. Its uneven outline
        // leaves the side caves/terrace as geology rather than menu slots.
        freeWaterPolygons: Object.freeze([
          Object.freeze([
            Object.freeze({ x: .28, y: .49 }),
            Object.freeze({ x: .72, y: .49 }),
            Object.freeze({ x: .82, y: .54 }),
            Object.freeze({ x: .80, y: .59 }),
            Object.freeze({ x: .74, y: .63 }),
            Object.freeze({ x: .88, y: .72 }),
            Object.freeze({ x: .12, y: .72 }),
            Object.freeze({ x: .26, y: .63 }),
            Object.freeze({ x: .20, y: .59 }),
            Object.freeze({ x: .18, y: .54 })
          ])
        ]),
        // These records are also drawn by debug-swim-map. The outer masses
        // describe the main visual walls; the inner ledges are the large
        // protrusions that must not be entered by Diver.
        blockedPolygons: Object.freeze([
          Object.freeze({
            id: 'greatChamberLeftMass',
            kind: 'rock-mass',
            polygon: Object.freeze([
              Object.freeze({ x: 0, y: .49 }),
              Object.freeze({ x: .28, y: .49 }),
              Object.freeze({ x: .24, y: .54 }),
              Object.freeze({ x: .27, y: .58 }),
              Object.freeze({ x: .20, y: .63 }),
              Object.freeze({ x: .29, y: .67 }),
              Object.freeze({ x: .25, y: .72 }),
              Object.freeze({ x: 0, y: .72 })
            ])
          }),
          Object.freeze({
            id: 'greatChamberRightMass',
            kind: 'rock-mass',
            polygon: Object.freeze([
              Object.freeze({ x: 1, y: .49 }),
              Object.freeze({ x: .72, y: .49 }),
              Object.freeze({ x: .76, y: .54 }),
              Object.freeze({ x: .73, y: .58 }),
              Object.freeze({ x: .80, y: .63 }),
              Object.freeze({ x: .71, y: .67 }),
              Object.freeze({ x: .75, y: .72 }),
              Object.freeze({ x: 1, y: .72 })
            ])
          }),
          Object.freeze({
            id: 'greatChamberLeftLedge',
            kind: 'rock-ledge',
            polygon: Object.freeze([
              Object.freeze({ x: .18, y: .56 }),
              Object.freeze({ x: .39, y: .56 }),
              Object.freeze({ x: .35, y: .60 }),
              Object.freeze({ x: .40, y: .64 }),
              Object.freeze({ x: .27, y: .66 }),
              Object.freeze({ x: .17, y: .63 })
            ])
          }),
          Object.freeze({
            id: 'greatChamberRightLedge',
            kind: 'rock-ledge',
            polygon: Object.freeze([
              Object.freeze({ x: .61, y: .56 }),
              Object.freeze({ x: .82, y: .56 }),
              Object.freeze({ x: .83, y: .63 }),
              Object.freeze({ x: .73, y: .66 }),
              Object.freeze({ x: .60, y: .64 }),
              Object.freeze({ x: .65, y: .60 })
            ])
          })
        ]),
        // These are intentionally short entrance-only reservations. They
        // override the wall polygons only inside their small mouths; no cave
        // interior is navigable in Swim Map V1.
        reservedCorridors: Object.freeze([
          Object.freeze({
            id: 'ltpoPrimaryCaveApproach',
            routeId: 'ltpoPrimaryCave',
            kind: 'future-cave-corridor',
            polygon: Object.freeze([
              Object.freeze({ x: .38, y: .575 }),
              Object.freeze({ x: .33, y: .558 }),
              Object.freeze({ x: .25, y: .560 }),
              Object.freeze({ x: .17, y: .575 }),
              Object.freeze({ x: .14, y: .595 }),
              Object.freeze({ x: .16, y: .615 }),
              Object.freeze({ x: .24, y: .625 }),
              Object.freeze({ x: .33, y: .615 }),
              Object.freeze({ x: .39, y: .600 })
            ])
          }),
          Object.freeze({
            id: 'mediaSecondaryCaveApproach',
            routeId: 'mediaSecondaryCave',
            kind: 'future-cave-corridor',
            polygon: Object.freeze([
              Object.freeze({ x: .62, y: .570 }),
              Object.freeze({ x: .70, y: .555 }),
              Object.freeze({ x: .79, y: .555 }),
              Object.freeze({ x: .85, y: .570 }),
              Object.freeze({ x: .87, y: .590 }),
              Object.freeze({ x: .83, y: .615 }),
              Object.freeze({ x: .76, y: .625 }),
              Object.freeze({ x: .68, y: .610 }),
              Object.freeze({ x: .61, y: .595 })
            ])
          })
        ])
      })
    }),
    // Reserved route records keep future cave branches in the same coordinate
    // system without making them active collision geometry in V1.
    routes: Object.freeze([
      Object.freeze({ id: 'ltpoPrimaryCave', type: 'cave-corridor', enabled: false, entrance: Object.freeze({ x: .23, y: .59 }) }),
      Object.freeze({ id: 'mediaSecondaryCave', type: 'cave-corridor', enabled: false, entrance: Object.freeze({ x: .77, y: .58 }) }),
      Object.freeze({ id: 'hundredInchAlcove', type: 'entrance', enabled: false, entrance: Object.freeze({ x: .82, y: .66 }) }),
      Object.freeze({ id: 'beijing2022Terrace', type: 'entrance', enabled: false, entrance: Object.freeze({ x: .26, y: .68 }) })
    ])
  });
  const DEEP_SEA_SWIM_MAP_REMAP = remapMasterY(DEEP_SEA_SWIM_MAP_LEGACY);
  const DEEP_SEA_SWIM_MAP = Object.freeze({
    ...DEEP_SEA_SWIM_MAP_REMAP,
    geometry: Object.freeze({
      ...DEEP_SEA_SWIM_MAP_REMAP.geometry,
      deeperOpenSea: Object.freeze({
        // The new tail is intentionally coarse: keep the centre open and
        // only reserve broad edge masses where the extension meets geology.
        freeWaterPolygons: Object.freeze([
          Object.freeze([
            Object.freeze({ x: .12, y: DEEP_SEA_WORLD_ANCHORS.greatChamberEnd }),
            Object.freeze({ x: .88, y: DEEP_SEA_WORLD_ANCHORS.greatChamberEnd }),
            Object.freeze({ x: .94, y: deeperOpenSeaWorldAt(.38) }),
            Object.freeze({ x: .91, y: deeperOpenSeaWorldAt(1) }),
            Object.freeze({ x: .09, y: deeperOpenSeaWorldAt(1) }),
            Object.freeze({ x: .06, y: deeperOpenSeaWorldAt(.38) })
          ])
        ]),
        blockedPolygons: Object.freeze([
          Object.freeze({
            id: 'deeperOpenSeaLeftEdge',
            kind: 'edge-rock-mass',
            polygon: Object.freeze([
              Object.freeze({ x: 0, y: DEEP_SEA_WORLD_ANCHORS.greatChamberEnd }),
              Object.freeze({ x: .12, y: DEEP_SEA_WORLD_ANCHORS.greatChamberEnd }),
              Object.freeze({ x: .09, y: deeperOpenSeaWorldAt(.62) }),
              Object.freeze({ x: .14, y: deeperOpenSeaWorldAt(1) }),
              Object.freeze({ x: 0, y: deeperOpenSeaWorldAt(1) })
            ])
          }),
          Object.freeze({
            id: 'deeperOpenSeaRightEdge',
            kind: 'edge-rock-mass',
            polygon: Object.freeze([
              Object.freeze({ x: 1, y: DEEP_SEA_WORLD_ANCHORS.greatChamberEnd }),
              Object.freeze({ x: .88, y: DEEP_SEA_WORLD_ANCHORS.greatChamberEnd }),
              Object.freeze({ x: .91, y: deeperOpenSeaWorldAt(.62) }),
              Object.freeze({ x: .86, y: deeperOpenSeaWorldAt(1) }),
              Object.freeze({ x: 1, y: deeperOpenSeaWorldAt(1) })
            ])
          })
        ]),
        reservedCorridors: Object.freeze([])
      })
    })
  });
  const DEEP_SEA_CASE_ANCHORS = Object.freeze([
    Object.freeze({
      caseId: 'ltpo',
      label: 'LTPO',
      spatialType: 'PRIMARY_CAVE',
      interactionType: 'ENTER',
      status: 'CONFIRMED',
      enabled: true,
      // Calibrated to the visible blue Primary Cave on the far left of the
      // current Master, rather than to the old centre-lane estimate.
      worldAnchor: Object.freeze({ x: .105, y: masterWorldY(1325) }),
      approachRegion: Object.freeze({
        id: 'ltpoApproach',
        label: 'Primary Cave mouth + approach water',
        kind: 'polygon',
        polygon: Object.freeze([
          // The full left cave volume plus its approach water. Keep the
          // inner edge left of the central neutral water so discovery is
          // generous without making the two caves overlap in the chamber.
          Object.freeze({ x: .35, y: masterWorldY(1185) }),
          Object.freeze({ x: .24, y: masterWorldY(1165) }),
          Object.freeze({ x: .13, y: masterWorldY(1205) }),
          Object.freeze({ x: .045, y: masterWorldY(1305) }),
          Object.freeze({ x: .025, y: masterWorldY(1485) }),
          Object.freeze({ x: .075, y: masterWorldY(1645) }),
          Object.freeze({ x: .17, y: masterWorldY(1715) }),
          Object.freeze({ x: .29, y: masterWorldY(1740) }),
          Object.freeze({ x: .36, y: masterWorldY(1665) }),
          Object.freeze({ x: .35, y: masterWorldY(1450) }),
          Object.freeze({ x: .31, y: masterWorldY(1295) })
        ])
      })
    }),
    Object.freeze({
      caseId: 'mediaLab',
      label: '融媒实验室',
      spatialType: 'SECONDARY_CAVE',
      interactionType: 'ENTER',
      status: 'CONFIRMED',
      enabled: true,
      // Calibrated to the visible elliptical blue Secondary Cave on the far
      // right of the current Master.
      worldAnchor: Object.freeze({ x: .875, y: masterWorldY(1265) }),
      approachRegion: Object.freeze({
        id: 'mediaLabApproach',
        label: 'Secondary Cave mouth + approach water',
        kind: 'polygon',
        polygon: Object.freeze([
          // Match the broad right cave silhouette and its front water while
          // preserving a neutral central lane between the two discoveries.
          Object.freeze({ x: .65, y: masterWorldY(1165) }),
          Object.freeze({ x: .76, y: masterWorldY(1145) }),
          Object.freeze({ x: .90, y: masterWorldY(1185) }),
          Object.freeze({ x: .975, y: masterWorldY(1305) }),
          Object.freeze({ x: .99, y: masterWorldY(1490) }),
          Object.freeze({ x: .93, y: masterWorldY(1655) }),
          Object.freeze({ x: .83, y: masterWorldY(1720) }),
          Object.freeze({ x: .71, y: masterWorldY(1735) }),
          Object.freeze({ x: .65, y: masterWorldY(1655) }),
          Object.freeze({ x: .65, y: masterWorldY(1440) }),
          Object.freeze({ x: .69, y: masterWorldY(1285) })
        ])
      })
    }),
    Object.freeze({
      caseId: 'hundredInch',
      label: '100-inch',
      spatialType: 'ROCK_PLATFORM',
      interactionType: 'APPROACH',
      status: 'CONFIRMED',
      enabled: true,
      // The lower left projecting platform beneath the Primary Cave.
      worldAnchor: Object.freeze({ x: .22, y: masterWorldY(1735) }),
      approachRegion: Object.freeze({
        id: 'hundredInchApproach',
        label: 'lower left platform front water',
        kind: 'polygon',
        polygon: Object.freeze([
          Object.freeze({ x: .26, y: masterWorldY(1660) }),
          Object.freeze({ x: .39, y: masterWorldY(1690) }),
          Object.freeze({ x: .47, y: masterWorldY(1760) }),
          Object.freeze({ x: .45, y: masterWorldY(1840) }),
          Object.freeze({ x: .30, y: masterWorldY(1825) }),
          Object.freeze({ x: .21, y: masterWorldY(1755) })
        ])
      })
    }),
    Object.freeze({
      caseId: 'beijing2022',
      label: '北京 2022',
      spatialType: 'ROCK_TERRACE',
      interactionType: 'APPROACH',
      status: 'CONFIRMED',
      enabled: true,
      // The lower right projecting platform beneath the Secondary Cave.
      worldAnchor: Object.freeze({ x: .72, y: masterWorldY(1860) }),
      approachRegion: Object.freeze({
        id: 'beijing2022Approach',
        label: 'lower right platform front water',
        kind: 'polygon',
        polygon: Object.freeze([
          Object.freeze({ x: .53, y: masterWorldY(1760) }),
          Object.freeze({ x: .64, y: masterWorldY(1725) }),
          Object.freeze({ x: .79, y: masterWorldY(1780) }),
          Object.freeze({ x: .81, y: masterWorldY(1890) }),
          Object.freeze({ x: .68, y: masterWorldY(1945) }),
          Object.freeze({ x: .55, y: masterWorldY(1895) })
        ])
      })
    })
  ]);
  const swimRegionAt = (worldY) => {
    const y = clamp(worldY, 0, 1);
    return DEEP_SEA_SWIM_MAP.regions.find((region, index) => y < region.yEnd || index === DEEP_SEA_SWIM_MAP.regions.length - 1)
      || DEEP_SEA_SWIM_MAP.regions[DEEP_SEA_SWIM_MAP.regions.length - 1];
  };
  const swimLaneAt = (worldY) => {
    const y = clamp(worldY, 0, 1);
    const region = swimRegionAt(y);
    const stops = region.stops;
    const nextIndex = stops.findIndex((stop) => y <= stop.y);
    const end = stops[Math.max(1, nextIndex)];
    const start = stops[Math.max(0, stops.indexOf(end) - 1)];
    const t = clamp((y - start.y) / Math.max(.0001, end.y - start.y), 0, 1);
    return {
      region,
      left: start.left + (end.left - start.left) * t,
      right: start.right + (end.right - start.right) * t
    };
  };
  const pointInPolygon = (point, polygon) => {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
      const currentPoint = polygon[index];
      const previousPoint = polygon[previous];
      const intersects = ((currentPoint.y > point.y) !== (previousPoint.y > point.y))
        && (point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y))
          / (previousPoint.y - currentPoint.y) + currentPoint.x);
      if (intersects) inside = !inside;
    }
    return inside;
  };
  const nearestPointOnSegment = (point, start, end) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > .000001
      ? clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
      : 0;
    return { x: start.x + dx * t, y: start.y + dy * t };
  };
  const nearestPointOnPolygon = (point, polygon) => {
    let nearest = polygon[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    polygon.forEach((start, index) => {
      const end = polygon[(index + 1) % polygon.length];
      const candidate = nearestPointOnSegment(point, start, end);
      const distance = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    });
    return nearest;
  };
  const swimGeometryAt = (worldY) => {
    const regionId = swimLaneAt(worldY).region.id;
    return regionId === 'greatChamber'
      ? DEEP_SEA_SWIM_MAP.geometry.greatChamber
      : regionId === 'deeperOpenSea'
        ? DEEP_SEA_SWIM_MAP.geometry.deeperOpenSea
        : null;
  };
  const reservedCorridorsAt = (point, geometry) => geometry?.reservedCorridors.filter((item) => pointInPolygon(point, item.polygon)) || [];
  const blockedPolygonsAt = (point, geometry) => geometry?.blockedPolygons.filter((item) => pointInPolygon(point, item.polygon)) || [];
  const isFreeWaterPoint = (point, geometry) => {
    if (!geometry) return true;
    if (reservedCorridorsAt(point, geometry).length) return true;
    const inFreePolygon = geometry.freeWaterPolygons.some((polygon) => pointInPolygon(point, polygon));
    return inFreePolygon && blockedPolygonsAt(point, geometry).length === 0;
  };
  const horizontalIntervalsForPolygon = (y, polygon) => {
    const intersections = [];
    polygon.forEach((start, index) => {
      const end = polygon[(index + 1) % polygon.length];
      if (Math.abs(end.y - start.y) < .000001) return;
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      if (y < minY || y >= maxY) return;
      intersections.push(start.x + (y - start.y) * (end.x - start.x) / (end.y - start.y));
    });
    intersections.sort((left, right) => left - right);
    const intervals = [];
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const left = intersections[index];
      const right = intersections[index + 1];
      const midpoint = { x: (left + right) / 2, y };
      if (pointInPolygon(midpoint, polygon)) intervals.push({ left, right });
    }
    return intervals;
  };
  const freeWaterIntervalsAt = (y, geometry) => {
    let intervals = geometry.freeWaterPolygons.flatMap((polygon) => horizontalIntervalsForPolygon(y, polygon));
    geometry.blockedPolygons.forEach((item) => {
      const blockedIntervals = horizontalIntervalsForPolygon(y, item.polygon);
      blockedIntervals.forEach((blocked) => {
        intervals = intervals.flatMap((interval) => {
          if (blocked.right <= interval.left || blocked.left >= interval.right) return [interval];
          const remainder = [];
          if (interval.left < blocked.left) remainder.push({ left: interval.left, right: blocked.left });
          if (blocked.right < interval.right) remainder.push({ left: blocked.right, right: interval.right });
          return remainder;
        });
      });
    });
    // Re-add only the short future-cave approaches after subtracting the
    // major rock polygons. This keeps the wall blocked outside each mouth.
    geometry.reservedCorridors.forEach((corridor) => {
      intervals.push(...horizontalIntervalsForPolygon(y, corridor.polygon));
    });
    intervals.sort((left, right) => left.left - right.left);
    intervals = intervals.reduce((merged, interval) => {
      const previous = merged[merged.length - 1];
      if (!previous || interval.left > previous.right) merged.push({ ...interval });
      else previous.right = Math.max(previous.right, interval.right);
      return merged;
    }, []);
    return intervals.filter((interval) => interval.right - interval.left > .004);
  };
  const nudgeTowardWater = (point, rawPoint) => {
    const direction = rawPoint.x < .5 ? 1 : -1;
    return { x: clamp(point.x + direction * .0025, 0, 1), y: clamp(point.y, 0, 1) };
  };
  const projectSwimWorldPoint = (point) => {
    const rawPoint = { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) };
    const y = clamp(point.y, 0, 1);
    const lane = swimLaneAt(y);
    const geometry = swimGeometryAt(y);
    if (geometry) {
      const reservedCorridors = reservedCorridorsAt(rawPoint, geometry);
      const blockedPolygons = blockedPolygonsAt(rawPoint, geometry);
      if (isFreeWaterPoint(rawPoint, geometry)) {
        return {
          x: rawPoint.x,
          y,
          region: lane.region.id,
          wasBlocked: false,
          blockedBy: [],
          reservedRoute: reservedCorridors[0]?.routeId || null
        };
      }
      const horizontalIntervals = freeWaterIntervalsAt(y, geometry);
      const horizontalCandidates = horizontalIntervals.flatMap((interval) => [
        { x: interval.left + .0025, y },
        { x: interval.right - .0025, y }
      ]).filter((candidate) => isFreeWaterPoint(candidate, geometry));
      if (horizontalCandidates.length) {
        const projected = horizontalCandidates.reduce((nearest, candidate) => {
          const distance = Math.abs(candidate.x - rawPoint.x);
          return distance < nearest.distance ? { candidate, distance } : nearest;
        }, { candidate: horizontalCandidates[0], distance: Number.POSITIVE_INFINITY }).candidate;
        return {
          x: projected.x,
          y,
          region: lane.region.id,
          wasBlocked: true,
          blockedBy: blockedPolygons.map((item) => item.id),
          reservedRoute: reservedCorridors[0]?.routeId || null
        };
      }
      const candidates = [];
      geometry.freeWaterPolygons.forEach((polygon) => candidates.push(nearestPointOnPolygon(rawPoint, polygon)));
      blockedPolygons.forEach((item) => candidates.push(nearestPointOnPolygon(rawPoint, item.polygon)));
      candidates.push({ x: clamp(rawPoint.x, lane.left, lane.right), y });
      const legalCandidates = candidates
        .map((candidate) => nudgeTowardWater(candidate, rawPoint))
        .filter((candidate) => isFreeWaterPoint(candidate, geometry));
      const projected = (legalCandidates.length ? legalCandidates : [{ x: .5, y }])
        .reduce((nearest, candidate) => {
          const distance = (candidate.x - rawPoint.x) ** 2 + (candidate.y - rawPoint.y) ** 2;
          return distance < nearest.distance ? { candidate, distance } : nearest;
        }, { candidate: { x: .5, y }, distance: Number.POSITIVE_INFINITY }).candidate;
      return {
        x: projected.x,
        y: projected.y,
        region: lane.region.id,
        wasBlocked: true,
        blockedBy: blockedPolygons.map((item) => item.id),
        reservedRoute: reservedCorridors[0]?.routeId || null
      };
    }
    return {
      x: clamp(rawPoint.x, lane.left, lane.right),
      y,
      region: lane.region.id,
      wasBlocked: rawPoint.x < lane.left || rawPoint.x > lane.right,
      blockedBy: []
    };
  };
  const createMasterWorldProjection = (root, scene) => {
    const image = scene?.querySelector('.downstream-world-master');
    let snapshot = {
      rootRect: root.getBoundingClientRect(),
      imageRect: image?.getBoundingClientRect() || root.getBoundingClientRect()
    };
    const refresh = () => {
      const rootRect = root.getBoundingClientRect();
      const imageRect = image?.getBoundingClientRect();
      snapshot = {
        rootRect,
        imageRect: imageRect && imageRect.width > 0 && imageRect.height > 0
          ? imageRect
          : rootRect
      };
      return snapshot;
    };
    return {
      refresh,
      getSnapshot: () => snapshot,
      worldToScreen(point) {
        const rect = refresh().imageRect;
        return {
          x: rect.left + clamp(point.x, 0, 1) * rect.width,
          y: rect.top + clamp(point.y, 0, 1) * rect.height
        };
      },
      screenToWorld(point) {
        const rect = refresh().imageRect;
        return {
          x: clamp((point.x - rect.left) / Math.max(1, rect.width), 0, 1),
          y: clamp((point.y - rect.top) / Math.max(1, rect.height), 0, 1)
        };
      },
      worldToLocal(point) {
        const screen = this.worldToScreen(point);
        const rootRect = snapshot.rootRect;
        return { x: screen.x - rootRect.left, y: screen.y - rootRect.top };
      },
      screenToLocal(point) {
        const rootRect = snapshot.rootRect;
        return { x: point.x - rootRect.left, y: point.y - rootRect.top };
      }
    };
  };
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
  const DEBUG_HIDDEN_CAVE = false;
  if (gs && window.MorphSVGPlugin) gs.registerPlugin(window.MorphSVGPlugin);

  class DiverPointerTracker {
    constructor(root, swimmer) {
      this.root = root;
      this.swimmer = swimmer;
      this.isSurface = root.classList.contains('surface-hero');
      this.diveBounds = null;
      this.worldProjection = null;
      this.swimMap = null;
      this.swimDebugState = null;
      this.layer = root.querySelector('.cursor-layer');
      this.light = this.layer?.querySelector('.cursor-light');
      this.glow = this.layer?.querySelector('.glow');
      // The diver now moves without a DOM trail in both worlds. Surface wake
      // effects, where present, remain independent world-space effects.
      this.motes = [];
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
      // Deep Sea follows the earlier free-swim pose: the body turns through
      // the full pointer direction instead of being constrained to a vertical
      // pitch. Surface keeps its existing heading/pitch system below.
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
      this.cinematicTarget = null;
      this.cinematicInfluence = 0;
      this.cinematicHeading = null;
      this.pointerFollowHold = false;
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

    getDiverTarget(pointerX, pointerY, { bypassSwimMap = false } = {}) {
      if (!this.isSurface) {
        const localTarget = {
          x: clamp(pointerX, this.bounds.minX, this.bounds.maxX),
          y: clamp(pointerY, this.bounds.minY, this.bounds.maxY)
        };
        if (bypassSwimMap || !this.worldProjection || !this.swimMap) return localTarget;
        const rawWorld = this.worldProjection.screenToWorld({
          x: this.box.left + localTarget.x,
          y: this.box.top + localTarget.y
        });
        const projectedWorld = projectSwimWorldPoint(rawWorld);
        const projectedScreen = this.worldProjection.worldToScreen(projectedWorld);
        const projectedTarget = {
          x: clamp(projectedScreen.x - this.box.left, this.bounds.minX, this.bounds.maxX),
          y: clamp(projectedScreen.y - this.box.top, this.bounds.minY, this.bounds.maxY)
        };
        this.swimDebugState = {
          rawTarget: { ...localTarget },
          rawWorld,
          projectedWorld,
          projectedTarget: { ...projectedTarget }
        };
        return projectedTarget;
      }
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
      const rawX = clamp(event.clientX - this.box.left, 0, this.box.width);
      const rawY = clamp(event.clientY - this.box.top, 0, this.box.height);
      // The cursor light belongs to the real pointer, even while a cinematic
      // temporarily suspends Diver follow. This keeps the handoff immersive
      // without moving or locking the user's actual mouse.
      if (!this.pointerFollowEnabled) {
        if (!this.isSurface) this.pointerPosition = { x: rawX, y: rawY };
        this.root.style.setProperty('--focus-x', `${(rawX / Math.max(1, this.box.width)) * 100}%`);
        this.root.style.setProperty('--focus-y', `${(rawY / Math.max(1, this.box.height)) * 100}%`);
        this.renderPosition(rawX, rawY);
        return;
      }
      this.refreshBox();
      const nextX = clamp(event.clientX - this.box.left, 0, this.box.width);
      const nextY = clamp(event.clientY - this.box.top, 0, this.box.height);
      this.pointerPosition.x = nextX;
      this.pointerPosition.y = nextY;
      // The chamber landing is held only until the next genuine user motion.
      this.pointerFollowHold = false;
      const modeChanged = this.updateSurfaceMode(nextY);
      if (!this.isSurface || this.surfaceMode === 'FOLLOW') {
        this.diverTarget = this.getDiverTarget(nextX, nextY);
      } else if (modeChanged && this.surfaceMode === 'WAIT') {
        this.diverTarget = { ...this.position };
      }
      this.root.style.setProperty('--focus-x', `${(nextX / Math.max(1, this.box.width)) * 100}%`);
      this.root.style.setProperty('--focus-y', `${(nextY / Math.max(1, this.box.height)) * 100}%`);
      this.renderPosition(nextX, nextY);
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
        } else if (this.cinematicHeading != null) {
          let next = this.cinematicHeading;
          while (next - this.heading > 180) next -= 360;
          while (next - this.heading < -180) next += 360;
          this.heading += (next - this.heading) * .12;
          this.heading = ((this.heading + 180) % 360 + 360) % 360 - 180;
        } else if (speed > .08) {
          let next = Math.atan2(dy, dx) * 180 / Math.PI - 180;
          while (next - this.heading > 180) next -= 360;
          while (next - this.heading < -180) next += 360;
          this.heading += (next - this.heading) * .22;
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
      // Bounds are refreshed on every scroll frame. During the cinematic or
      // its short chamber settle, retain the path target instead of letting a
      // stale mouse coordinate overwrite the approved landing position.
      if (this.pointerFollowHold) return;
      if (this.cinematicTarget && this.cinematicInfluence > 0) this.applyTargetBlend();
      else this.diverTarget = this.getDiverTarget(this.pointerPosition.x, this.pointerPosition.y);
      this.position.x = clamp(this.position.x, this.bounds.minX, this.bounds.maxX);
      this.position.y = clamp(this.position.y, this.bounds.minY, this.bounds.maxY);
    }

    getPointerPosition() { return { ...this.pointerPosition }; }

    setSwimMap(worldProjection, swimMap) {
      if (this.isSurface) return;
      this.worldProjection = worldProjection;
      this.swimMap = swimMap;
    }

    getSwimDebugState() { return this.swimDebugState; }

    getDiverTargetPosition() { return { ...this.diverTarget }; }

    getBehaviorState() { return this.behaviorState; }

    setDiverTarget(x, y) {
      this.diverTarget = this.getDiverTarget(x, y);
    }

    applyTargetBlend(pointerTarget = this.getDiverTarget(this.pointerPosition.x, this.pointerPosition.y)) {
      if (!this.cinematicTarget || this.cinematicInfluence <= 0) {
        this.diverTarget = { ...pointerTarget };
        return;
      }
      const influence = clamp(this.cinematicInfluence, 0, 1);
      this.diverTarget = {
        x: pointerTarget.x + (this.cinematicTarget.x - pointerTarget.x) * influence,
        y: pointerTarget.y + (this.cinematicTarget.y - pointerTarget.y) * influence
      };
    }

    setCinematicTarget(x, y, influence = 1) {
      this.cinematicTarget = this.getDiverTarget(x, y, { bypassSwimMap: true });
      this.cinematicInfluence = clamp(influence, 0, 1);
      this.applyTargetBlend();
    }

    clearCinematicTarget({ preserveTarget = false } = {}) {
      this.cinematicTarget = null;
      this.cinematicInfluence = 0;
      if (preserveTarget) {
        this.diverTarget = { ...this.position };
        return;
      }
      this.applyTargetBlend();
    }

    setCinematicHeading(heading) {
      this.cinematicHeading = heading;
    }

    snapCinematicHeading(heading) {
      this.cinematicHeading = heading;
      this.heading = heading;
      this.renderDiver();
    }

    clearCinematicHeading() {
      this.cinematicHeading = null;
    }

    holdPointerFollowAtCurrentPosition() {
      this.pointerFollowHold = true;
      this.diverTarget = { ...this.position };
    }

    setPointerFollowEnabled(enabled) {
      this.pointerFollowEnabled = Boolean(enabled);
      if (!this.pointerFollowEnabled) {
        this.cinematicTarget = null;
        this.cinematicInfluence = 0;
        this.diverTarget = { ...this.position };
      }
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

      // Affordance proximity is visual-only: it never changes hit areas or
      // movement targets. Each authored interactive object gets a continuous
      // 0..1 distance value so Idle → Proximity can ease into its existing
      // hover/active state without adding a second interaction system.
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const proximityTo = (selector, radiusFactor = 1.2, minRadius = 72) => {
        const node = surface.querySelector(selector);
        if (!node) return 0;
        const box = node.getBoundingClientRect();
        const cx = box.left - rect.left + box.width / 2;
        const cy = box.top - rect.top + box.height / 2;
        const radius = Math.max(minRadius, Math.max(box.width, box.height) * radiusFactor);
        return clamp(1 - Math.hypot(pointerX - cx, pointerY - cy) / radius, 0, 1);
      };
      const applyProximity = (name, value, threshold = .02) => {
        surface.style.setProperty(`--${name}-proximity`, value.toFixed(3));
        surface.classList.toggle(`is-${name}-proximity`, value > threshold);
        if (name === 'planet') {
          surface.style.setProperty('--planet-local-glow-alpha', (0.74 + value * 0.14).toFixed(3));
          surface.style.setProperty('--planet-orbit-alpha', (0.38 + value * 0.3).toFixed(3));
          surface.style.setProperty('--planet-atmosphere-alpha', (0.34 + value * 0.26).toFixed(3));
        } else if (name === 'dive-cta') {
          surface.style.setProperty('--dive-cta-glow-radius', `${(5 + value * 5).toFixed(2)}px`);
          surface.style.setProperty('--dive-cta-glow-alpha', (0.26 + value * 0.14).toFixed(3));
        } else if (name === 'drift-bottle') {
          surface.style.setProperty('--drift-bottle-glow-radius', `${(4.5 + value * 4.5).toFixed(2)}px`);
          surface.style.setProperty('--drift-bottle-glow-alpha', (0.2 + value * 0.14).toFixed(3));
        }
      };
      applyProximity('planet', proximityTo('.planet-hotspot', 1.15, 110));
      applyProximity('dive-cta', proximityTo('.surface-lifebuoy-entry', 1.35, 120));
      applyProximity('drift-bottle', proximityTo('.drift-bottle-trigger', 1.4, 110));
      // The transformed Diver box includes generous transparent padding; use
      // a tighter radius so the environmental response only appears when the
      // pointer is genuinely near the swimmer, not near the CTA below.
      applyProximity('diver', proximityTo('.home-diver', .45, 72));
    };
    surface.addEventListener('pointermove', updateSkyHotspot, { passive: true });
    surface.addEventListener('pointerleave', () => {
      surface.classList.remove('is-sky-hotspot', 'is-planet-hover', 'is-planet-proximity', 'is-dive-cta-proximity', 'is-drift-bottle-proximity', 'is-diver-proximity');
      ['planet', 'dive-cta', 'drift-bottle', 'diver'].forEach((name) => surface.style.setProperty(`--${name}-proximity`, '0'));
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
    const professional = world.querySelector('.quiet-professional');
    const profileCoordinates = world.querySelector('.profile-coordinates');
    const revealNodes = [...world.querySelectorAll('[data-reveal-start]')];
    const informationNodes = [...new Set([
      professional,
      profileCoordinates,
      ...world.querySelectorAll('.depth-reveal, .prototype-node')
    ].filter(Boolean))];
    informationNodes.forEach((node) => {
      node.classList.add('deep-information');
      node.style.setProperty('--information-base-opacity', '1');
    });
    const scrollSpacer = document.querySelector('.descent-scroll-spacer');
    const debugHiddenCave = DEBUG_HIDDEN_CAVE || new URLSearchParams(window.location.search).has('debug-hidden-cave');
    document.body.classList.toggle('debug-hidden-cave', debugHiddenCave);
    if (debugHiddenCave && scrollSpacer) scrollSpacer.style.height = '520vh';
    let viewport = { width: 0, height: 0, halfW: 66, halfH: 47, maxDepth: 1 };
    let targetDepth = 0;
    let currentDepth = 0;
    let dirty = true;
    let lastProximityPosition = { x: Number.NaN, y: Number.NaN };
    let onboardingDismissed = false;
    let onboardingHasScrolled = false;
    let onboardingHasSwum = false;
    const onboardingStartPointer = tracker.getPointerPosition();
    const ONBOARDING_SCROLL_DISTANCE = 16;
    const ONBOARDING_SWIM_DISTANCE = 32;
    let ascentActive = false;
    let bubbleTimer = 0;
    let ascentTimeline = null;
    let pullActive = false;
    let pullPointerId = null;
    let pullStartY = 0;
    let pullDistance = 0;
    let clickPullActive = false;
    const lifeline = world.querySelector('.descent-lifeline');
    const ascentBubbles = world.querySelector('.ascent-bubbles');
    const PULL_THRESHOLD = 118;
    const PULL_MAX = 174;
    const downstreamScene = world.querySelector('.downstream-world-scene');
    const worldProjection = createMasterWorldProjection(world, downstreamScene);
    tracker.setSwimMap(worldProjection, DEEP_SEA_SWIM_MAP);
    const debugSwimMap = new URLSearchParams(window.location.search).has('debug-swim-map');
    const swimMapDebug = world.querySelector('.swim-map-debug');
    const swimMapDebugPlot = swimMapDebug?.querySelector('.swim-map-debug-plot');
    const swimMapDebugMaster = swimMapDebug?.querySelector('.swim-map-debug-master');
    const swimMapDebugFree = swimMapDebug?.querySelector('.swim-map-debug-free');
    const swimMapDebugBlocked = swimMapDebug?.querySelector('.swim-map-debug-blocked');
    const swimMapDebugReserved = swimMapDebug?.querySelector('.swim-map-debug-reserved');
    const swimMapDebugApproaches = swimMapDebug?.querySelector('.swim-map-debug-approaches');
    const swimMapDebugAnchors = swimMapDebug?.querySelector('.swim-map-debug-anchors');
    const swimMapDebugCursor = swimMapDebug?.querySelector('.swim-map-debug-cursor');
    const swimMapDebugDiver = swimMapDebug?.querySelector('.swim-map-debug-diver');
    const swimMapDebugReadout = swimMapDebug?.querySelector('.swim-map-debug-readout');
    const swimMapDebugCaseList = swimMapDebug?.querySelector('.swim-map-debug-case-list');
    world.classList.toggle('debug-swim-map', debugSwimMap);
    if (swimMapDebug) swimMapDebug.hidden = !debugSwimMap;

    const placedCaseAnchors = () => DEEP_SEA_CASE_ANCHORS.filter((item) => (
      item.status === 'CONFIRMED'
      && item.enabled
      && item.worldAnchor
      && item.approachRegion?.polygon
    ));
    const caseApproachesAt = (point) => placedCaseAnchors().filter((item) => (
      pointInPolygon(point, item.approachRegion.polygon)
    ));

    // Case Entry Skeleton V1 deliberately exposes only the two confirmed
    // enterable caves. The other confirmed anchors remain available to the
    // shared data model, but do not receive a production entry affordance yet.
    const CASE_ENTRY_STATES = Object.freeze({
      FREE: 'FREE',
      PROXIMITY: 'PROXIMITY',
      READING: 'READING'
    });
    const CASE_ENTRY_CONFIG = Object.freeze({
      ltpo: Object.freeze({ label: 'LTPO', spatialType: 'PRIMARY CAVE' }),
      mediaLab: Object.freeze({ label: '融媒实验室', spatialType: 'SECONDARY CAVE' })
    });
    const caseDiscoveryLayer = world.querySelector('.case-discovery-layer');
    const caseReadingLayer = world.querySelector('.case-reading-layer');
    const caseReadingTitle = caseReadingLayer?.querySelector('#case-reading-title');
    const caseReadingReturns = [...(caseReadingLayer?.querySelectorAll('.case-reading-return') || [])];
    const caseReadingViews = new Map(
      [...(caseReadingLayer?.querySelectorAll('[data-reading-view]') || [])]
        .map((view) => [view.dataset.readingView, view])
    );
    const ltpoReading = caseReadingViews.get('ltpo');
    const ltpoReadingSections = [...(ltpoReading?.querySelectorAll('[data-reading-step]') || [])];
    const caseDiscoveryButtons = new Map(
      [...(caseDiscoveryLayer?.querySelectorAll('[data-case-id]') || [])]
        .map((button) => [button.dataset.caseId, button])
    );
    const readingChrome = [
      world.querySelector('.dive-nav'),
      lifeline,
      world.querySelector('.descent-depth'),
      world.querySelector('.descent-onboarding'),
      world.querySelector('.ascent-light'),
      ascentBubbles,
      caseDiscoveryLayer,
      swimMapDebug
    ].filter(Boolean);
    let caseEntryState = CASE_ENTRY_STATES.FREE;
    let activeCaseId = null;
    let caseSnapshot = null;

    const ltpoReadingOverview = ltpoReading?.querySelector('.ltpo-reading-overview');
    const ltpoReadingHero = ltpoReading?.querySelector('.ltpo-reading-hero');
    const ltpoReadingStrategy = ltpoReading?.querySelector('.ltpo-reading-strategy');
    const ltpoReadingChallenge = ltpoReading?.querySelector('.ltpo-reading-challenge');
    const ltpoReadingPhases = [...(ltpoReading?.querySelectorAll('.ltpo-reading-phase') || [])];
    const ltpoEpisodeItems = [...(ltpoReading?.querySelectorAll('.ltpo-episode') || [])];
    const ltpoEpisodeVideos = ltpoEpisodeItems.map((item) => item.querySelector('video')).filter(Boolean);
    const ltpoEpisodeStage = ltpoReading?.querySelector('.ltpo-episode-stage');
    const ltpoEpisodeSelects = [...(ltpoReading?.querySelectorAll('[data-episode-select]') || [])];
    const ltpoMediaSoundToggle = ltpoReading?.querySelector('.ltpo-media-sound');
    const ltpoMediaGesture = ltpoReading?.querySelector('.ltpo-media-gesture');
    const ltpoReadingResult = ltpoReading?.querySelector('.ltpo-reading-result');
    const ltpoReadingValueItems = [...(ltpoReading?.querySelectorAll('.ltpo-reading-values span') || [])];
    const ltpoReadingValues = ltpoReading?.querySelector('.ltpo-reading-values');
    const ltpoMethodTerms = [...(ltpoReading?.querySelectorAll('.ltpo-reading-method-explanation em') || [])];
    const ltpoReadingRail = ltpoReading?.querySelector('.ltpo-reading-rail');
    const ltpoReadingRailProgress = ltpoReading?.querySelector('.ltpo-reading-rail-progress');
    const ltpoReadingRailBeamPath = ltpoReading?.querySelector('.ltpo-reading-rail-beam path');
    const ltpoReadingRailBeamPoint = ltpoReading?.querySelector('.ltpo-reading-rail-beam circle');
    const ltpoReadingRailSections = [...(ltpoReading?.querySelectorAll('[data-reading-target]') || [])];
    const ltpoReadingRailCurrent = ltpoReading?.querySelector('.ltpo-reading-rail-current');
    // The world cursor is the single pointer runtime. Reading only changes
    // its visual mode; it never creates a section-local cursor or coordinate
    // system.
    const ltpoReadingCursor = world.querySelector('.cursor-layer');
    const ltpoReadingChallengeTerms = [...(ltpoReading?.querySelectorAll('.ltpo-reading-challenge-copy small b') || [])];
    const ltpoReadingStrategyBridgeTerms = [...(ltpoReading?.querySelectorAll('.ltpo-reading-strategy-bridge span') || [])];
    const ltpoReadingLightTargets = [...(ltpoReading?.querySelectorAll('.ltpo-reading-light-target') || [])];
    const ltpoReadingTextTargets = [...(ltpoReading?.querySelectorAll([
      '.ltpo-reading-overview-intro h2',
      '.ltpo-reading-overview-intro p',
      '.ltpo-reading-values span',
      '.ltpo-reading-challenge-intro h2',
      '.ltpo-reading-challenge-intro p',
      '.ltpo-reading-challenge-copy p',
      '.ltpo-reading-challenge-copy small b',
      '.ltpo-reading-section-heading h2',
      '.ltpo-reading-section-heading p',
      '.ltpo-reading-strategy-bridge span',
      '.ltpo-reading-phase-heading h3',
      '.ltpo-reading-phase-lead',
      '.ltpo-reading-phase-action b',
      '.ltpo-reading-method-explanation',
      '.ltpo-reading-ownership li'
    ].join(', ')) || [])];
    const ltpoReadingSectionNames = new Map([
      ['project', '项目概述'],
      ['overview', '项目概述'],
      ['challenge', '项目挑战'],
      ['strategy', '传播策略'],
      ['result', '项目结果']
    ]);
    let ltpoReadingFrame = 0;
    let strategyProgressTarget = 0;
    let strategyProgressVisual = 0;
    let strategyProgressLastTime = 0;
    let ltpoReadingHeroStart = 0;
    const STRATEGY_SCRUB_SECONDS = .22;
    const smoothStep = (value) => value * value * (3 - 2 * value);
    const rangeProgress = (value, start, end) => smoothStep(clamp((value - start) / Math.max(.0001, end - start), 0, 1));
    const scrubRangeProgress = (value, start, end) => clamp(
      (value - start) / Math.max(.0001, end - start),
      0,
      1
    );
    let ltpoEpisodeActiveIndex = 0;
    let ltpoEpisodeDragOffset = 0;
    let ltpoEpisodePointerId = null;
    let ltpoEpisodePointerStartX = 0;
    let ltpoEpisodePointerStartY = 0;
    let ltpoEpisodePointerStartTime = 0;
    let ltpoEpisodeDragMoved = false;
    let ltpoEpisodeWheelDelta = 0;
    let ltpoMediaSoundEnabled = false;
    let ltpoMediaAffordancePlayed = false;
    let ltpoMediaAffordanceTimer = null;
    let ltpoReadingIlluminationTargets = [];
    let ltpoReadingBenefitIndex = 0;
    let ltpoReadingBenefitTimer = null;
    let ltpoMediaStackCollapse = 0;
    let ltpoResultPulsePlayed = false;
    let ltpoResultPulseTimer = null;
    const setupLTPOReadingTextIllumination = () => {
      const expandableTargets = ltpoReadingLightTargets.flatMap((target) => (
        target.matches('.ltpo-reading-method-lockup') && target.children.length
          ? [...target.children]
          : [target]
      ));
      ltpoReadingIlluminationTargets = [...new Set([...expandableTargets, ...ltpoReadingTextTargets])];
      ltpoReadingIlluminationTargets.forEach((target) => {
        const level = target.dataset.lightLevel
          || (target.matches('.ltpo-reading-hero-mark, .ltpo-reading-method-lockup, .ltpo-reading-result-hero') ? 'hero'
            : target.matches('h2, h3, .ltpo-reading-values span, .ltpo-reading-challenge-copy small b, .ltpo-reading-strategy-bridge span') ? 'section'
              : 'body');
        target.dataset.lightLevel = level;
        target.classList.add('ltpo-reading-glyph-light');
        target.style.setProperty('--local-light-x', '-999px');
        target.style.setProperty('--local-light-y', '-999px');
      });
    };
    setupLTPOReadingTextIllumination();
    const pauseLTPOEpisodeVideos = () => {
      ltpoEpisodeVideos.forEach((video) => video.pause());
    };
    const syncLTPOMediaSound = () => {
      if (!ltpoMediaSoundToggle) return;
      ltpoMediaSoundToggle.textContent = ltpoMediaSoundEnabled ? 'SOUND ON' : 'SOUND OFF';
      ltpoMediaSoundToggle.setAttribute('aria-pressed', String(ltpoMediaSoundEnabled));
      ltpoMediaSoundToggle.setAttribute('aria-label', ltpoMediaSoundEnabled ? '关闭视频声音' : '开启视频声音');
    };
    const playLTPOEpisode = (index = ltpoEpisodeActiveIndex) => {
      const video = ltpoEpisodeVideos[index];
      const stageRect = ltpoEpisodeStage?.getBoundingClientRect();
      const rootRect = caseReadingLayer?.getBoundingClientRect();
      if (!video || !stageRect || !rootRect || stageRect.height <= 0 || rootRect.height <= 0) return;
      const isVisible = stageRect.bottom > rootRect.top && stageRect.top < rootRect.bottom;
      if (!isVisible) return;
      video.muted = !ltpoMediaSoundEnabled;
      video.loop = true;
      video.play().catch(() => {});
    };
    const markLTPOMediaInteracted = () => {
      ltpoReading?.setAttribute('data-media-interacted', 'true');
      if (ltpoMediaGesture) ltpoMediaGesture.setAttribute('aria-hidden', 'true');
    };
    const syncLTPOEpisodeVisuals = () => {
      if (!ltpoEpisodeItems.length) return;
      const stageWidth = ltpoEpisodeStage?.clientWidth || 620;
      const stackStep = clamp(stageWidth * .105, 34, 54);
      const stackRise = clamp(stageWidth * .032, 10, 22);
      ltpoEpisodeItems.forEach((episode, index) => {
        const distance = index - ltpoEpisodeActiveIndex;
        const isAhead = distance > 0;
        const level = Math.min(Math.abs(distance), 3);
        const opacity = distance === 0 ? 1 : isAhead ? Math.max(.14, .46 - level * .09) : Math.max(.08, .22 - level * .06);
        const scale = distance === 0 ? 1 - ltpoMediaStackCollapse * .04 : Math.max(.86, .96 - level * .04 - ltpoMediaStackCollapse * .04);
        const x = distance * stackStep + ltpoEpisodeDragOffset * .78;
        const y = (isAhead ? level * stackRise : level * stackRise * .52) + Math.abs(ltpoEpisodeDragOffset) * .025;
        const z = distance === 0 ? 40 : isAhead ? 40 - level : 20 - level;
        episode.style.setProperty('--episode-x', `${x.toFixed(2)}px`);
        episode.style.setProperty('--episode-y', `${y.toFixed(2)}px`);
        episode.style.setProperty('inset', 'auto', 'important');
        episode.style.setProperty('left', '50%', 'important');
        episode.style.setProperty('top', '50%', 'important');
        episode.style.setProperty('--episode-scale', scale.toFixed(3));
        episode.style.setProperty('--episode-opacity', opacity.toFixed(3));
        episode.style.setProperty('--episode-z', String(z));
        episode.classList.toggle('is-current', distance === 0);
        episode.setAttribute('aria-hidden', distance === 0 || Math.abs(distance) === 1 ? 'false' : 'true');
      });
      ltpoEpisodeSelects.forEach((button, index) => {
        button.setAttribute('aria-pressed', String(index === ltpoEpisodeActiveIndex));
      });
      ltpoReading?.setAttribute('data-active-episode', ltpoEpisodeItems[ltpoEpisodeActiveIndex]?.dataset.episode || '01');
    };
    const triggerLTPOMediaAffordance = () => {
      if (ltpoMediaAffordancePlayed || !ltpoEpisodeStage) return;
      ltpoMediaAffordancePlayed = true;
      ltpoEpisodeStage.classList.add('is-affordance-nudge');
      window.requestAnimationFrame(() => ltpoEpisodeStage.classList.add('is-affordance-nudge-active'));
      ltpoMediaAffordanceTimer = window.setTimeout(() => {
        ltpoEpisodeStage.classList.remove('is-affordance-nudge', 'is-affordance-nudge-active');
        ltpoMediaAffordanceTimer = null;
      }, 980);
    };
    const selectLTPOEpisode = (index) => {
      if (!ltpoEpisodeItems.length) return;
      ltpoEpisodeActiveIndex = clamp(index, 0, ltpoEpisodeItems.length - 1);
      ltpoEpisodeDragOffset = 0;
      pauseLTPOEpisodeVideos();
      syncLTPOEpisodeVisuals();
      playLTPOEpisode();
    };
    const onLTPOEpisodePointerDown = (event) => {
      if (!ltpoEpisodeStage || (event.pointerType === 'mouse' && event.button !== 0)) return;
      ltpoEpisodePointerId = event.pointerId;
      ltpoEpisodePointerStartX = event.clientX;
      ltpoEpisodePointerStartY = event.clientY;
      ltpoEpisodePointerStartTime = performance.now();
      ltpoEpisodeDragMoved = false;
      ltpoEpisodeDragOffset = 0;
      ltpoEpisodeStage.classList.add('is-pressed');
      if (ltpoReadingCursor) ltpoReadingCursor.dataset.cursorKind = 'media-drag';
    };
    const onLTPOEpisodePointerMove = (event) => {
      if (event.pointerId !== ltpoEpisodePointerId) return;
      const dx = event.clientX - ltpoEpisodePointerStartX;
      const dy = event.clientY - ltpoEpisodePointerStartY;
      if (!ltpoEpisodeDragMoved) {
        if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
        ltpoEpisodeDragMoved = true;
        markLTPOMediaInteracted();
        ltpoEpisodeStage.classList.add('is-dragging');
        ltpoEpisodeStage.setPointerCapture?.(event.pointerId);
      }
      event.preventDefault();
      const atStart = ltpoEpisodeActiveIndex === 0 && dx > 0;
      const atEnd = ltpoEpisodeActiveIndex === ltpoEpisodeItems.length - 1 && dx < 0;
      ltpoEpisodeDragOffset = (atStart || atEnd) ? dx * .24 : dx;
      syncLTPOEpisodeVisuals();
    };
    const onLTPOEpisodePointerUp = (event) => {
      if (event.pointerId !== ltpoEpisodePointerId) return;
      const dx = event.clientX - ltpoEpisodePointerStartX;
      const elapsed = Math.max(16, performance.now() - ltpoEpisodePointerStartTime);
      const velocity = Math.abs(dx) / elapsed;
      const moved = ltpoEpisodeDragMoved;
      ltpoEpisodeStage.classList.remove('is-pressed', 'is-dragging');
      if (ltpoReadingCursor) ltpoReadingCursor.dataset.cursorKind = 'media';
      if (moved) ltpoEpisodeStage.releasePointerCapture?.(event.pointerId);
      if (moved && (Math.abs(dx) > 34 || velocity > .42)) {
        selectLTPOEpisode(ltpoEpisodeActiveIndex + (dx < 0 ? 1 : -1));
      } else {
        ltpoEpisodeDragOffset = 0;
        syncLTPOEpisodeVisuals();
      }
      ltpoEpisodePointerId = null;
      ltpoEpisodePointerStartTime = 0;
      ltpoEpisodeDragMoved = false;
    };
    const onLTPOEpisodePointerCancel = (event) => {
      if (event.pointerId !== ltpoEpisodePointerId) return;
      ltpoEpisodeDragOffset = 0;
      syncLTPOEpisodeVisuals();
      ltpoEpisodeStage.classList.remove('is-pressed', 'is-dragging');
      if (ltpoReadingCursor) ltpoReadingCursor.dataset.cursorKind = 'media';
      if (ltpoEpisodeDragMoved) ltpoEpisodeStage.releasePointerCapture?.(event.pointerId);
      ltpoEpisodePointerId = null;
      ltpoEpisodePointerStartTime = 0;
      ltpoEpisodeDragMoved = false;
    };
    const onLTPOEpisodeWheel = (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || Math.abs(event.deltaX) < 2) return;
      event.preventDefault();
      ltpoEpisodeWheelDelta += event.deltaX;
      if (Math.abs(ltpoEpisodeWheelDelta) < 34) return;
      markLTPOMediaInteracted();
      selectLTPOEpisode(ltpoEpisodeActiveIndex + (ltpoEpisodeWheelDelta > 0 ? 1 : -1));
      ltpoEpisodeWheelDelta = 0;
    };
    const setLTPOBenefitState = (index = 0) => {
      if (!ltpoReadingValueItems.length) return;
      ltpoReadingBenefitIndex = clamp(index, 0, ltpoReadingValueItems.length - 1);
      ltpoReadingValueItems.forEach((item, itemIndex) => {
        const isActive = itemIndex === ltpoReadingBenefitIndex;
        const distance = itemIndex < ltpoReadingBenefitIndex ? -1 : 1;
        item.style.setProperty('--benefit-y', isActive ? '0px' : `${distance * 14}px`);
        item.style.setProperty('--benefit-blur', isActive ? '0px' : '2.6px');
        item.style.setProperty('--benefit-opacity', isActive ? '1' : '.12');
        item.style.setProperty('--benefit-tracking', isActive ? '.025em' : '.08em');
        item.style.setProperty('--benefit-weight', isActive ? '1' : '0');
      });
      ltpoReading?.setAttribute('data-benefit-active', String(ltpoReadingBenefitIndex + 1).padStart(2, '0'));
    };
    const stopLTPOBenefitLoop = () => {
      if (ltpoReadingBenefitTimer) window.clearInterval(ltpoReadingBenefitTimer);
      ltpoReadingBenefitTimer = null;
    };
    const startLTPOBenefitLoop = () => {
      if (ltpoReadingBenefitTimer || ltpoReadingValueItems.length < 2) return;
      setLTPOBenefitState(ltpoReadingBenefitIndex);
      ltpoReadingBenefitTimer = window.setInterval(() => {
        setLTPOBenefitState((ltpoReadingBenefitIndex + 1) % ltpoReadingValueItems.length);
      }, 1120);
    };
    const setLTPOMethodEmphasis = (progress) => {
      ltpoMethodTerms.forEach((term, index) => {
        const focus = clamp(progress * 1.35 - index * .23, 0, 1);
        term.style.setProperty('--method-body-mix', `${(100 - focus * 46).toFixed(1)}%`);
        term.style.setProperty('--method-aqua-mix', `${(focus * 46).toFixed(1)}%`);
        term.style.setProperty('--method-opacity', (.5 + focus * .5).toFixed(3));
        term.style.setProperty('--method-blur', `${((1 - focus) * 2).toFixed(2)}px`);
      });
    };
    const playLTPOResultPulse = () => {
      if (ltpoResultPulsePlayed || !ltpoReadingResult || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      ltpoResultPulsePlayed = true;
      ltpoReadingResult.classList.remove('is-result-pulse', 'is-result-pulse-peak');
      void ltpoReadingResult.offsetWidth;
      ltpoReadingResult.classList.add('is-result-pulse');
      window.requestAnimationFrame(() => ltpoReadingResult?.classList.add('is-result-pulse-peak'));
      ltpoResultPulseTimer = window.setTimeout(() => {
        ltpoReadingResult?.classList.remove('is-result-pulse-peak');
      }, 590);
      window.setTimeout(() => {
        ltpoReadingResult?.classList.remove('is-result-pulse');
        ltpoResultPulseTimer = null;
      }, 860);
    };
    const setLTPOChallengeTerms = (progress) => {
      const relationProgress = clamp(progress, 0, 1);
      ltpoReadingChallengeTerms.forEach((term, index) => {
        const reveal = clamp(relationProgress * 1.35 - index * .27, 0, 1);
        term.style.setProperty('--term-reveal', reveal.toFixed(3));
        term.style.setProperty('--term-y', `${((1 - reveal) * 10).toFixed(2)}px`);
        term.style.setProperty('--term-scale', (0.94 + reveal * .06).toFixed(3));
      });
    };
    const updateLTPOReadingRail = (progress, rootRect, viewportHeight, strategyProgress) => {
      if (!ltpoReadingRail) return;
      const sectionEntries = ltpoReadingSections
        .map((section) => ({
          section,
          step: section.dataset.readingStep,
          offset: section.getBoundingClientRect().top - rootRect.top
        }))
        .filter(({step}) => step !== 'project');
      const semanticStops = new Map([['overview', .06], ['challenge', .32], ['strategy', .61], ['result', .91]]);
      const documentStops = sectionEntries.map(({section}) => clamp(
        (section.offsetTop - (ltpoReadingHero?.offsetHeight || 0))
          / Math.max(1, (caseReadingLayer?.scrollHeight || 1) - (caseReadingLayer?.clientHeight || 0)),
        0,
        1
      ));
      let semanticProgress = progress;
      for (let index = 0; index < sectionEntries.length - 1; index += 1) {
        const from = documentStops[index];
        const to = documentStops[index + 1];
        if (progress >= from && progress <= to) {
          const local = clamp((progress - from) / Math.max(.0001, to - from), 0, 1);
          semanticProgress = semanticStops.get(sectionEntries[index].step)
            + (semanticStops.get(sectionEntries[index + 1].step) - semanticStops.get(sectionEntries[index].step)) * local;
          break;
        }
      }
      if (progress < (documentStops[0] || 0)) semanticProgress = Math.max(.01, progress * 1.4);
      if (progress > (documentStops.at(-1) || 1)) semanticProgress = Math.min(1, .91 + (progress - documentStops.at(-1)) * 1.4);
      ltpoReadingRail.style.setProperty('--reading-progress', semanticProgress.toFixed(3));
      ltpoReadingRailProgress?.style.setProperty('--reading-progress', semanticProgress.toFixed(3));
      if (ltpoReadingRailBeamPath && ltpoReadingRailBeamPoint) {
        const length = ltpoReadingRailBeamPath.getTotalLength();
        const traveled = length * semanticProgress;
        const point = ltpoReadingRailBeamPath.getPointAtLength(traveled);
        ltpoReadingRailBeamPath.style.strokeDasharray = `${length.toFixed(1)} ${length.toFixed(1)}`;
        ltpoReadingRailBeamPath.style.strokeDashoffset = `${(length - traveled).toFixed(1)}`;
        ltpoReadingRailBeamPoint.setAttribute('cx', point.x.toFixed(2));
        ltpoReadingRailBeamPoint.setAttribute('cy', point.y.toFixed(2));
      }
      const currentEntry = sectionEntries.reduce((current, entry) => {
        if (entry.offset <= viewportHeight * .54) return entry;
        return current;
      }, sectionEntries[0]);
      const currentStep = currentEntry?.step || 'overview';
      const currentName = ltpoReadingSectionNames.get(currentStep) || '项目概述';
      ltpoReadingRailCurrent && (ltpoReadingRailCurrent.textContent = currentName);
      ltpoReadingRailSections.forEach((button) => {
        const isCurrent = button.dataset.readingTarget === currentStep;
        button.classList.toggle('is-current', isCurrent);
        if (isCurrent) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
    };
    const onLTPOReadingPointerMove = (event) => {
      if (!ltpoReadingCursor || event.pointerType === 'touch' || caseEntryState !== CASE_ENTRY_STATES.READING || activeCaseId !== 'ltpo') return;
      const target = event.target?.closest?.('.ltpo-reading-rail, .ltpo-episode-stage, .ltpo-media-sound, .case-reading-return, .ltpo-reading-glyph-light');
      const lightTarget = event.target?.closest?.('.ltpo-reading-glyph-light');
      const kind = target?.closest?.('.ltpo-reading-rail') ? 'rail'
        : target?.closest?.('.ltpo-episode-stage')?.classList.contains('is-dragging') ? 'media-drag'
          : target?.closest?.('.ltpo-episode-stage') ? 'media'
            : target?.closest?.('.case-reading-return, .ltpo-media-sound') ? 'link'
              : lightTarget?.dataset.lightLevel === 'hero' ? 'hero'
                : lightTarget?.dataset.lightLevel === 'section' ? 'section'
                  : 'body';
      ltpoReadingCursor.dataset.cursorKind = kind;
      ltpoReadingIlluminationTargets.forEach((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const radius = candidate.dataset.lightLevel === 'hero' ? 170 : candidate.dataset.lightLevel === 'section' ? 118 : 84;
        const isActive = candidate === lightTarget
          && x >= -radius && x <= rect.width + radius
          && y >= -radius && y <= rect.height + radius;
        candidate.style.setProperty('--local-light-x', isActive ? `${x.toFixed(1)}px` : '-999px');
        candidate.style.setProperty('--local-light-y', isActive ? `${y.toFixed(1)}px` : '-999px');
        if (candidate.matches('.ltpo-reading-hero-mark')) {
          const position = clamp((x / Math.max(1, rect.width)) * 100, 8, 92);
          candidate.style.setProperty('--hero-sheen-x', `${position.toFixed(1)}%`);
          candidate.style.setProperty('--hero-sheen-opacity', isActive ? '.46' : '.22');
        }
        candidate.toggleAttribute('data-light-active', isActive);
      });
      ltpoReadingCursor.style.opacity = '1';
    };
    const onLTPOReadingPointerLeave = () => {
      // The cursor layer is global and viewport-owned. A local reading-layer
      // boundary must never be allowed to end its lifetime or hide it.
      ltpoReadingIlluminationTargets.forEach((target) => {
        target.style.setProperty('--local-light-x', '-999px');
        target.style.setProperty('--local-light-y', '-999px');
        target.removeAttribute('data-light-active');
      });
    };
    ltpoReadingRailSections.forEach((button) => {
      button.addEventListener('click', () => {
        const section = ltpoReading?.querySelector(`[data-reading-step="${button.dataset.readingTarget}"]`);
        if (!section || !caseReadingLayer) return;
        const rootRect = caseReadingLayer.getBoundingClientRect();
        const offset = section.getBoundingClientRect().top - rootRect.top + caseReadingLayer.scrollTop - caseReadingLayer.clientHeight * .08;
        caseReadingLayer.scrollTo({top: Math.max(0, offset), behavior: 'smooth'});
      });
    });
    // Keep semantic hover state on the same viewport pointer stream as the
    // world tracker. The tracker owns the actual fixed cursor position.
    window.addEventListener('pointermove', onLTPOReadingPointerMove, {passive: true});
    caseReadingLayer?.addEventListener('pointerleave', onLTPOReadingPointerLeave, {passive: true});
    syncLTPOEpisodeVisuals();
    const sectionProgress = (section, rootRect, viewportHeight, enter = .86, settle = .16) => {
      if (!section) return 0;
      const offset = section.getBoundingClientRect().top - rootRect.top;
      return clamp((viewportHeight * enter - offset) / Math.max(1, viewportHeight * (enter - settle)), 0, 1);
    };

    const renderLTPOReadingProgress = (now = performance.now()) => {
      ltpoReadingFrame = 0;
      if (!caseReadingLayer || !ltpoReading || caseEntryState !== CASE_ENTRY_STATES.READING || activeCaseId !== 'ltpo') return;
      const rootRect = caseReadingLayer.getBoundingClientRect();
      const viewportHeight = Math.max(1, caseReadingLayer.clientHeight);
      const focusLine = viewportHeight * .46;
      const progress = clamp(
        caseReadingLayer.scrollTop / Math.max(1, caseReadingLayer.scrollHeight - caseReadingLayer.clientHeight),
        0,
        1
      );
      const heroTravel = Math.max(1, (ltpoReadingHero?.offsetHeight || viewportHeight) - viewportHeight);
      const heroStart = ltpoReadingHeroStart;
      const heroProgress = clamp((caseReadingLayer.scrollTop - heroStart) / heroTravel, 0, 1);
      const projectHandoff = rangeProgress(heroProgress, .02, .58);
      const projectExit = rangeProgress(heroProgress, .76, 1);
      const overviewProgress = sectionProgress(ltpoReadingOverview, rootRect, viewportHeight, .9, .18);
      const challengeProgress = sectionProgress(ltpoReadingChallenge, rootRect, viewportHeight, .9, .18);
      const valuesOffset = ltpoReadingValues
        ? ltpoReadingValues.getBoundingClientRect().top - rootRect.top
        : viewportHeight;
      const benefitProgress = clamp(
        (viewportHeight * .86 - valuesOffset) / Math.max(1, viewportHeight * 1.1),
        0,
        1
      );
      const challengeTakeover = rangeProgress(challengeProgress, .08, .68);
      const challengeRelation = rangeProgress(challengeProgress, .28, .78);
      const strategyOffset = ltpoReadingStrategy
        ? ltpoReadingStrategy.getBoundingClientRect().top - rootRect.top
        : viewportHeight;
      const strategyHeight = Math.max(viewportHeight, ltpoReadingStrategy?.offsetHeight || viewportHeight);
      // Strategy progress starts only when its sticky stage reaches the top.
      // The former viewport-minus-offset mapping consumed the intro before the
      // stage arrived and allowed every later scene to coexist in one frame.
      strategyProgressTarget = clamp(
        -strategyOffset / Math.max(1, strategyHeight - viewportHeight),
        0,
        1
      );
      if (!strategyProgressLastTime) {
        strategyProgressVisual = strategyProgressTarget;
      } else {
        const elapsed = clamp((now - strategyProgressLastTime) / 1000, .001, .08);
        const follow = 1 - Math.exp(-elapsed / STRATEGY_SCRUB_SECONDS);
        strategyProgressVisual += (strategyProgressTarget - strategyProgressVisual) * follow;
      }
      strategyProgressLastTime = now;
      if (Math.abs(strategyProgressTarget - strategyProgressVisual) < .0005) {
        strategyProgressVisual = strategyProgressTarget;
      }
      const strategyProgress = strategyProgressVisual;
      // Four owned states: the media and responsibility pass are deliberately
      // one continuous 02 composition rather than two pages competing for the
      // same sticky viewport.
      const strategyIntroEnter = rangeProgress(strategyProgress, 0, .035);
      const strategyIntroLeave = rangeProgress(strategyProgress, .155, .19);
      const strategyFoundationEnter = rangeProgress(strategyProgress, .185, .22);
      const strategyFoundationLeave = rangeProgress(strategyProgress, .39, .425);
      const strategyAmplificationEnter = rangeProgress(strategyProgress, .42, .455);
      const strategyAmplificationLeave = rangeProgress(strategyProgress, .57, .605);
      const mediaEnter = rangeProgress(strategyProgress, .60, .64);
      const mediaRelease = rangeProgress(strategyProgress, .94, .99);
      const ownershipEnter = rangeProgress(strategyProgress, .82, .89);
      const strategyIntro = strategyIntroEnter * (1 - strategyIntroLeave);
      const strategyFoundation = strategyFoundationEnter * (1 - strategyFoundationLeave);
      const strategyAmplification = strategyAmplificationEnter * (1 - strategyAmplificationLeave);
      const evidenceReveal = rangeProgress(strategyProgress, .22, .255);
      const evidenceExit = rangeProgress(strategyProgress, .39, .425);
      const foundationExit = strategyFoundationLeave;
      const mediaProgress = mediaEnter * (1 - mediaRelease);
      const ownershipProgress = ownershipEnter * (1 - mediaRelease);
      const mediaStoryProgress = rangeProgress(strategyProgress, .645, .82);
      const mediaCollapse = rangeProgress(strategyProgress, .82, .94);
      const resultProgress = sectionProgress(ltpoReadingResult, rootRect, viewportHeight, .92, .2);
      const resultHeroProgress = rangeProgress(resultProgress, .25, .82);
      const resultSupportProgress = rangeProgress(resultProgress, .65, 1);
      setLTPOChallengeTerms(challengeRelation);
      setLTPOMethodEmphasis(rangeProgress(strategyProgress, .47, .59));
      ltpoReadingStrategyBridgeTerms.forEach((term, index) => {
        const bridgeProgress = rangeProgress(strategyProgress, .055 + index * .045, .22 + index * .10);
        term.style.setProperty('--bridge-term', bridgeProgress.toFixed(3));
      });
      updateLTPOReadingRail(progress, rootRect, viewportHeight, strategyProgress);
      const focusValues = new Map();
      ltpoReadingSections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        const sectionCenter = rect.top - rootRect.top + rect.height * .5;
        focusValues.set(section, clamp(1 - Math.abs(sectionCenter - focusLine) / (viewportHeight * .92), 0, 1));
      });

      ltpoReading.style.setProperty('--reading-progress', progress.toFixed(3));
      ltpoReading.style.setProperty('--project-handoff', projectHandoff.toFixed(3));
      ltpoReading.style.setProperty('--project-exit', projectExit.toFixed(3));
      ltpoReading.style.setProperty('--hero-sheen-opacity', (.1 + Math.max(.14, 1 - heroProgress) * .28).toFixed(3));
      ltpoReading.style.setProperty('--hero-sheen-translate', `${(-projectHandoff * 2.5).toFixed(2)}vw`);
      ltpoReading.style.setProperty('--what-progress', overviewProgress.toFixed(3));
      ltpoReading.style.setProperty('--overview-progress', overviewProgress.toFixed(3));
      ltpoReading.style.setProperty('--benefit-progress', overviewProgress.toFixed(3));
      ltpoReading.style.setProperty('--challenge-progress', challengeProgress.toFixed(3));
      ltpoReading.style.setProperty('--challenge-takeover', challengeTakeover.toFixed(3));
      ltpoReading.style.setProperty('--challenge-relation', challengeRelation.toFixed(3));
      ltpoReading.style.setProperty('--strategy-progress', strategyProgress.toFixed(3));
      ltpoReading.style.setProperty('--strategy-foundation', strategyFoundation.toFixed(3));
      ltpoReading.style.setProperty('--strategy-amplification', strategyAmplification.toFixed(3));
      ltpoReading.style.setProperty('--strategy-intro', strategyIntro.toFixed(3));
      ltpoReading.style.setProperty('--strategy-intro-enter', strategyIntroEnter.toFixed(3));
      ltpoReading.style.setProperty('--strategy-intro-leave', strategyIntroLeave.toFixed(3));
      ltpoReading.style.setProperty('--strategy-foundation-enter', strategyFoundationEnter.toFixed(3));
      ltpoReading.style.setProperty('--strategy-foundation-leave', strategyFoundationLeave.toFixed(3));
      ltpoReading.style.setProperty('--strategy-amplification-enter', strategyAmplificationEnter.toFixed(3));
      ltpoReading.style.setProperty('--strategy-amplification-leave', strategyAmplificationLeave.toFixed(3));
      ltpoReading.style.setProperty('--strategy-evidence', evidenceReveal.toFixed(3));
      ltpoReading.style.setProperty('--strategy-evidence-exit', evidenceExit.toFixed(3));
      ltpoReading.style.setProperty('--strategy-foundation-exit', foundationExit.toFixed(3));
      ltpoReading.style.setProperty('--media-progress', mediaProgress.toFixed(3));
      ltpoReading.style.setProperty('--media-enter', mediaEnter.toFixed(3));
      ltpoReading.style.setProperty('--media-leave', mediaRelease.toFixed(3));
      ltpoReading.style.setProperty('--media-story-progress', mediaStoryProgress.toFixed(3));
      ltpoReading.style.setProperty('--media-stack-collapse', mediaCollapse.toFixed(3));
      ltpoReading.style.setProperty('--ownership-progress', ownershipProgress.toFixed(3));
      ltpoReading.style.setProperty('--ownership-enter', ownershipEnter.toFixed(3));
      ltpoReading.style.setProperty('--ownership-leave', mediaRelease.toFixed(3));
      ltpoReading.style.setProperty('--result-progress', resultProgress.toFixed(3));
      ltpoReading.style.setProperty('--result-hero-progress', resultHeroProgress.toFixed(3));
      ltpoReading.style.setProperty('--result-support-progress', resultSupportProgress.toFixed(3));
      ltpoReading.style.setProperty('--signal-landing-opacity', (.07 * (1 - heroProgress)).toFixed(3));
      ltpoReading.style.setProperty('--signal-overview-opacity', (.18 * rangeProgress(overviewProgress, .12, .88)).toFixed(3));
      ltpoReading.style.setProperty('--signal-strategy-opacity', (.26 * rangeProgress(strategyProgress, .05, .72) * (1 - mediaRelease)).toFixed(3));
      ltpoMediaStackCollapse = mediaCollapse;
      if (mediaEnter >= .02 && mediaRelease < 1) triggerLTPOMediaAffordance();
      syncLTPOEpisodeVisuals();
      ltpoReading.dataset.strategyCurrent = strategyProgress < .185 ? '' : strategyProgress < .42 ? '01' : '02';
      ltpoReading.dataset.strategyScene = strategyProgress < .185
        ? 'intro'
        : strategyProgress < .42
          ? 'foundation'
          : strategyProgress < .60
            ? 'amplification'
            : strategyProgress < .99
              ? 'media'
              : 'exit';
      ltpoReading.dataset.strategyState = ltpoReading.dataset.strategyScene;
      ltpoReading.dataset.strategyMediaPhase = strategyProgress < .60
        ? 'pre'
        : strategyProgress < .64
          ? 'arrival'
          : strategyProgress < .82
            ? 'hold'
            : strategyProgress < .94
              ? 'release'
              : 'exit';
      ltpoReading.dataset.strategyEvidencePhase = strategyProgress < .22
        ? 'pre'
        : strategyProgress < .255
          ? 'enter'
          : strategyProgress < .39
            ? 'hold'
            : 'exit';
      const phaseZIndexes = strategyProgress < .42 ? [8, 5] : [5, 8];
      ltpoReadingPhases.forEach((phase, index) => {
        const focus = [strategyFoundation, strategyAmplification][index] || 0;
        phase.style.setProperty('--phase-focus', focus.toFixed(3));
        phase.style.setProperty('z-index', String(phaseZIndexes[index] || 1));
      });
      ltpoReadingSections.forEach((section) => {
        const focus = focusValues.get(section) || 0;
        section.style.setProperty('--reading-focus', focus.toFixed(3));
        const sectionOffset = section.getBoundingClientRect().top - rootRect.top;
        const dividerProgress = clamp((viewportHeight * .88 - sectionOffset) / (viewportHeight * .3), 0, 1);
        section.style.setProperty('--divider-progress', dividerProgress.toFixed(3));
        section.classList.toggle('is-reading-focus', focus > .42);
      });
      if (Math.abs(strategyProgressTarget - strategyProgressVisual) > .0005) {
        ltpoReadingFrame = window.requestAnimationFrame(renderLTPOReadingProgress);
      }
    };
    const scheduleLTPOReadingProgress = () => {
      if (ltpoReadingFrame) return;
      ltpoReadingFrame = window.requestAnimationFrame(renderLTPOReadingProgress);
    };

    ltpoEpisodeStage?.addEventListener('pointerdown', onLTPOEpisodePointerDown, { passive: true });
    ltpoEpisodeStage?.addEventListener('pointermove', onLTPOEpisodePointerMove, { passive: false });
    ltpoEpisodeStage?.addEventListener('pointerup', onLTPOEpisodePointerUp, { passive: true });
    ltpoEpisodeStage?.addEventListener('pointercancel', onLTPOEpisodePointerCancel, { passive: true });
    ltpoEpisodeStage?.addEventListener('wheel', onLTPOEpisodeWheel, { passive: false });
    ltpoEpisodeSelects.forEach((button, index) => {
      button.addEventListener('click', () => {
        markLTPOMediaInteracted();
        selectLTPOEpisode(index);
      });
    });
    ltpoMediaSoundToggle?.addEventListener('click', () => {
      ltpoMediaSoundEnabled = !ltpoMediaSoundEnabled;
      syncLTPOMediaSound();
      const activeVideo = ltpoEpisodeVideos[ltpoEpisodeActiveIndex];
      if (activeVideo) {
        activeVideo.muted = !ltpoMediaSoundEnabled;
        playLTPOEpisode();
      }
    });
    ltpoEpisodeVideos.forEach((video) => {
      video.addEventListener('play', () => {
        ltpoEpisodeVideos.forEach((otherVideo) => {
          if (otherVideo !== video) otherVideo.pause();
        });
      });
    });
    if (ltpoEpisodeStage && 'IntersectionObserver' in window) {
      const ltpoEpisodeObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (!entry || !entry.isIntersecting || entry.intersectionRatio < .22) {
          pauseLTPOEpisodeVideos();
        } else {
          playLTPOEpisode();
        }
      }, { root: caseReadingLayer, threshold: [.22] });
      ltpoEpisodeObserver.observe(ltpoEpisodeStage);
    }
    if (ltpoReadingValues && 'IntersectionObserver' in window) {
      const ltpoBenefitObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || entry.intersectionRatio < .28) stopLTPOBenefitLoop();
        else startLTPOBenefitLoop();
      }, { root: caseReadingLayer, threshold: [.28] });
      ltpoBenefitObserver.observe(ltpoReadingValues);
    }
    if (ltpoReadingResult && 'IntersectionObserver' in window) {
      const ltpoResultObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && entry.intersectionRatio >= .34) playLTPOResultPulse();
      }, { root: caseReadingLayer, threshold: [.34] });
      ltpoResultObserver.observe(ltpoReadingResult);
    }

    const isReadingCursorRuntimeVisible = () => {
      const cursor = ltpoReadingCursor;
      const light = cursor?.querySelector('.cursor-light');
      if (!cursor || !light) return false;
      const cursorStyle = window.getComputedStyle(cursor);
      const lightStyle = window.getComputedStyle(light);
      const rect = light.getBoundingClientRect();
      return cursorStyle.display !== 'none'
        && cursorStyle.visibility !== 'hidden'
        && Number(cursorStyle.opacity) > 0
        && lightStyle.display !== 'none'
        && lightStyle.visibility !== 'hidden'
        && Number(lightStyle.opacity) > 0
        && rect.width > 0
        && rect.height > 0;
    };

    const setReadingView = (caseId = null) => {
      const activeView = caseId === 'ltpo' ? 'ltpo' : 'placeholder';
      if (activeView !== 'ltpo') {
        ltpoEpisodeVideos.forEach((video) => video.pause());
      }
      caseReadingViews.forEach((view, viewName) => {
        view.hidden = viewName !== activeView;
      });
      caseReadingLayer?.setAttribute('data-reading-mode', activeView);
      if (activeView === 'ltpo' && ltpoReading) {
        if (ltpoReadingCursor) {
          ltpoReadingCursor.dataset.cursorMode = 'reading';
          ltpoReadingCursor.dataset.cursorKind = 'body';
          ltpoReadingCursor.style.opacity = '1';
          if (isReadingCursorRuntimeVisible()) ltpoReading.dataset.livingCursor = 'ready';
          else ltpoReading.removeAttribute('data-living-cursor');
        } else ltpoReading.removeAttribute('data-living-cursor');
        strategyProgressTarget = 0;
        strategyProgressVisual = 0;
        strategyProgressLastTime = 0;
        ltpoEpisodeVideos.forEach((video) => {
          video.pause();
          video.currentTime = 0;
          video.muted = true;
          video.loop = true;
        });
        ltpoMediaSoundEnabled = false;
        syncLTPOMediaSound();
        ltpoReading.removeAttribute('data-media-interacted');
        stopLTPOBenefitLoop();
        setLTPOBenefitState(0);
        if (ltpoMediaAffordanceTimer) window.clearTimeout(ltpoMediaAffordanceTimer);
        ltpoMediaAffordanceTimer = null;
        ltpoMediaAffordancePlayed = false;
        ltpoMediaStackCollapse = 0;
        ltpoResultPulsePlayed = false;
        if (ltpoResultPulseTimer) window.clearTimeout(ltpoResultPulseTimer);
        ltpoResultPulseTimer = null;
        ltpoReadingResult?.classList.remove('is-result-pulse');
        ltpoEpisodeStage?.classList.remove('is-affordance-nudge', 'is-affordance-nudge-active');
        selectLTPOEpisode(0);
        caseReadingLayer.scrollTop = 0;
        ltpoReadingHeroStart = ltpoReadingHero?.offsetTop || 0;
        window.requestAnimationFrame(renderLTPOReadingProgress);
      } else {
        if (ltpoReadingCursor) {
          ltpoReadingCursor.dataset.cursorMode = 'world';
          ltpoReadingCursor.removeAttribute('data-cursor-kind');
          ltpoReadingCursor.style.opacity = '';
        }
        ltpoReading?.removeAttribute('data-living-cursor');
      }
    };
    setReadingView();
    caseReadingLayer?.addEventListener('scroll', scheduleLTPOReadingProgress, { passive: true });
    window.addEventListener('resize', scheduleLTPOReadingProgress, { passive: true });

    const setCaseEntryState = (state, caseId = null) => {
      caseEntryState = state;
      activeCaseId = caseId;
      world.dataset.caseEntryState = state;
      if (caseId) world.dataset.caseEntryCase = caseId;
      else delete world.dataset.caseEntryCase;
    };
    setCaseEntryState(CASE_ENTRY_STATES.FREE);

    const clearCaseDiscovery = () => {
      caseDiscoveryButtons.forEach((button) => {
        button.hidden = true;
        button.classList.remove('is-visible');
        button.removeAttribute('aria-hidden');
      });
    };

    const renderCaseDiscovery = () => {
      if (!caseDiscoveryLayer || caseEntryState === CASE_ENTRY_STATES.READING) return;
      const snapshot = worldProjection.refresh();
      const rootRect = snapshot.rootRect;
      const diver = tracker.getPosition();
      const diverScreen = { x: rootRect.left + diver.x, y: rootRect.top + diver.y };
      const diverWorld = worldProjection.screenToWorld(diverScreen);
      const nearby = new Map(
        caseApproachesAt(diverWorld)
          .filter((item) => CASE_ENTRY_CONFIG[item.caseId])
          .map((item) => [item.caseId, item])
      );
      const nextState = nearby.size ? CASE_ENTRY_STATES.PROXIMITY : CASE_ENTRY_STATES.FREE;
      if (caseEntryState !== nextState) setCaseEntryState(nextState);
      caseDiscoveryButtons.forEach((button, caseId) => {
        const item = nearby.get(caseId);
        if (!item) {
          button.hidden = true;
          button.classList.remove('is-visible');
          return;
        }
        const anchor = worldProjection.worldToScreen(item.worldAnchor);
        button.style.setProperty('--case-screen-x', `${(anchor.x - rootRect.left).toFixed(1)}px`);
        button.style.setProperty('--case-screen-y', `${(anchor.y - rootRect.top).toFixed(1)}px`);
        button.hidden = false;
        button.classList.add('is-visible');
        button.dataset.caseState = CASE_ENTRY_STATES.PROXIMITY;
        button.setAttribute('aria-label', `进入 ${CASE_ENTRY_CONFIG[caseId].label}`);
      });
    };

    const captureCaseSnapshot = () => ({
      scrollY: window.scrollY,
      position: tracker.getPosition(),
      previous: { ...tracker.previous },
      pointerPosition: tracker.getPointerPosition(),
      diverTarget: tracker.getDiverTargetPosition(),
      heading: tracker.heading,
      poseAngle: tracker.poseAngle,
      targetPoseAngle: tracker.targetPoseAngle,
      facingScale: tracker.facingScale,
      targetFacingScale: tracker.targetFacingScale,
      facing: tracker.facing,
      facingTarget: tracker.facingTarget,
      pointerFollowEnabled: tracker.pointerFollowEnabled,
      readingChromeHidden: readingChrome.map((element) => element.hidden)
    });

    const setReadingChromeHidden = (hidden, snapshot = null) => {
      readingChrome.forEach((element, index) => {
        element.hidden = hidden
          ? true
          : Boolean(snapshot?.readingChromeHidden?.[index]);
      });
    };

    const restoreCaseSnapshot = (snapshot) => {
      if (!snapshot) return;
      setReadingChromeHidden(false, snapshot);
      tracker.position = { ...snapshot.position };
      tracker.previous = { ...snapshot.previous };
      tracker.pointerPosition = { ...snapshot.pointerPosition };
      tracker.diverTarget = { ...snapshot.diverTarget };
      tracker.heading = snapshot.heading;
      tracker.poseAngle = snapshot.poseAngle;
      tracker.targetPoseAngle = snapshot.targetPoseAngle;
      tracker.facingScale = snapshot.facingScale;
      tracker.targetFacingScale = snapshot.targetFacingScale;
      tracker.facing = snapshot.facing;
      tracker.facingTarget = snapshot.facingTarget;
      tracker.setPointerFollowEnabled(snapshot.pointerFollowEnabled !== false);
      tracker.holdPointerFollowAtCurrentPosition();
      tracker.renderPosition(snapshot.pointerPosition.x, snapshot.pointerPosition.y);
      tracker.renderDiver();
    };

    const openCaseLanding = (caseId) => {
      if (caseEntryState !== CASE_ENTRY_STATES.PROXIMITY || !CASE_ENTRY_CONFIG[caseId] || !caseReadingLayer) return;
      const item = DEEP_SEA_CASE_ANCHORS.find((candidate) => candidate.caseId === caseId);
      if (!item || item.status !== 'CONFIRMED' || !item.enabled) return;
      caseSnapshot = captureCaseSnapshot();
      setCaseEntryState(CASE_ENTRY_STATES.READING, caseId);
      clearCaseDiscovery();
      world.classList.add('is-case-reading');
      document.body.classList.add('is-case-reading');
      setReadingChromeHidden(true);
      caseReadingLayer.hidden = false;
      caseReadingLayer.dataset.caseId = caseId;
      if (caseReadingTitle) caseReadingTitle.textContent = CASE_ENTRY_CONFIG[caseId].label;
      setReadingView(caseId);
      tracker.setPointerFollowEnabled(false);
      tracker.holdPointerFollowAtCurrentPosition();
      if (caseId === 'ltpo') {
        // Focus the scroll container, not the final return button. Focusing a
        // button several viewports below can pull the fresh reading state away
        // from its landing composition in some browsers.
        caseReadingLayer.focus({ preventScroll: true });
        caseReadingLayer.scrollTop = 0;
        window.requestAnimationFrame(() => {
          caseReadingLayer.scrollTop = 0;
          renderLTPOReadingProgress();
        });
      } else {
        caseReadingReturns.find((button) => (
          button.closest('[data-reading-view]')?.dataset.readingView === 'placeholder'
        ))?.focus({ preventScroll: true });
      }
    };

    const closeCaseLanding = () => {
      if (caseEntryState !== CASE_ENTRY_STATES.READING) return;
      const snapshot = caseSnapshot;
      caseSnapshot = null;
      caseReadingLayer.hidden = true;
      caseReadingLayer.removeAttribute('data-case-id');
      setReadingView();
      world.classList.remove('is-case-reading');
      document.body.classList.remove('is-case-reading');
      setCaseEntryState(CASE_ENTRY_STATES.FREE);
      if (snapshot) window.scrollTo(0, snapshot.scrollY);
      restoreCaseSnapshot(snapshot);
      dirty = true;
      renderCaseDiscovery();
    };

    caseDiscoveryButtons.forEach((button, caseId) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openCaseLanding(caseId);
      });
    });
    caseReadingReturns.forEach((button) => button.addEventListener('click', closeCaseLanding));
    const lockCaseReadingScroll = (event) => {
      if (caseEntryState === CASE_ENTRY_STATES.READING && !caseReadingLayer?.contains(event.target)) {
        event.preventDefault();
      }
    };
    window.addEventListener('wheel', lockCaseReadingScroll, { passive: false });
    window.addEventListener('touchmove', lockCaseReadingScroll, { passive: false });

    const renderSwimMapDebug = (progress, worldProgress) => {
      if (!debugSwimMap || !swimMapDebugPlot || !swimMapDebugReadout) return;
      const snapshot = worldProjection.refresh();
      const rootRect = snapshot.rootRect;
      const imageRect = snapshot.imageRect;
      const toLocalScreen = (point) => ({ x: point.x - rootRect.left, y: point.y - rootRect.top });
      swimMapDebugPlot.setAttribute('viewBox', `0 0 ${Math.max(1, rootRect.width)} ${Math.max(1, rootRect.height)}`);
      swimMapDebugMaster?.setAttribute('x', String(imageRect.left - rootRect.left));
      swimMapDebugMaster?.setAttribute('y', String(imageRect.top - rootRect.top));
      swimMapDebugMaster?.setAttribute('width', String(imageRect.width));
      swimMapDebugMaster?.setAttribute('height', String(imageRect.height));
      const polygonPath = (polygon) => {
        const points = polygon.map((point) => toLocalScreen(worldProjection.worldToScreen(point)));
        return `M ${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')} Z`;
      };
      const lanePath = (region) => {
        const samples = Array.from({ length: 16 }, (_, index) => (
          region.yStart + (region.yEnd - region.yStart) * index / 15
        ));
        const leftPoints = samples.map((y) => toLocalScreen(worldProjection.worldToScreen({ x: swimLaneAt(y).left, y })));
        const rightPoints = samples.map((y) => toLocalScreen(worldProjection.worldToScreen({ x: swimLaneAt(y).right, y })));
        return [
          `M ${leftPoints.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')}`,
          `L ${rightPoints.reverse().map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')}`,
          'Z'
        ].join(' ');
      };
      const freeGeometryPath = DEEP_SEA_SWIM_MAP.regions.map((region) => {
        const geometry = swimGeometryAt((region.yStart + region.yEnd) / 2);
        return geometry
          ? geometry.freeWaterPolygons.map(polygonPath).join(' ')
          : lanePath(region);
      }).join(' ');
      swimMapDebugFree?.setAttribute('d', freeGeometryPath);
      if (swimMapDebugBlocked) {
        const geometries = [
          DEEP_SEA_SWIM_MAP.geometry.greatChamber,
          DEEP_SEA_SWIM_MAP.geometry.deeperOpenSea
        ];
        swimMapDebugBlocked.replaceChildren(...geometries.flatMap((geometry) => geometry.blockedPolygons.map((item) => {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', polygonPath(item.polygon));
          path.dataset.geometryId = item.id;
          return path;
        })));
      }
      if (swimMapDebugReserved) {
        const geometry = DEEP_SEA_SWIM_MAP.geometry.greatChamber;
        swimMapDebugReserved.replaceChildren(...geometry.reservedCorridors.map((corridor) => {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', polygonPath(corridor.polygon));
          path.dataset.geometryId = corridor.id;
          path.dataset.routeId = corridor.routeId;
          return path;
        }));
      }
      if (swimMapDebugApproaches) {
        swimMapDebugApproaches.replaceChildren(...placedCaseAnchors().map((item) => {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', polygonPath(item.approachRegion.polygon));
          path.dataset.caseId = item.caseId;
          path.dataset.approachId = item.approachRegion.id;
          return path;
        }));
      }
      if (swimMapDebugAnchors) {
        swimMapDebugAnchors.replaceChildren(...placedCaseAnchors().flatMap((item) => {
          const point = toLocalScreen(worldProjection.worldToScreen(item.worldAnchor));
          const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          marker.setAttribute('cx', String(point.x));
          marker.setAttribute('cy', String(point.y));
          marker.setAttribute('r', '8');
          marker.dataset.caseId = item.caseId;
          const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          label.setAttribute('x', String(point.x + 12));
          label.setAttribute('y', String(point.y - 10));
          label.dataset.caseId = item.caseId;
          label.textContent = item.label;
          const type = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          type.setAttribute('x', String(point.x + 12));
          type.setAttribute('y', String(point.y + 5));
          type.dataset.caseId = item.caseId;
          type.textContent = item.spatialType;
          return [marker, label, type];
        }));
      }
      const pointer = tracker.getPointerPosition();
      const pointerScreen = { x: rootRect.left + pointer.x, y: rootRect.top + pointer.y };
      const diver = tracker.getPosition();
      const diverScreen = { x: rootRect.left + diver.x, y: rootRect.top + diver.y };
      const cursorPoint = toLocalScreen(pointerScreen);
      const diverPoint = toLocalScreen(diverScreen);
      swimMapDebugCursor?.setAttribute('cx', String(cursorPoint.x));
      swimMapDebugCursor?.setAttribute('cy', String(cursorPoint.y));
      swimMapDebugDiver?.setAttribute('cx', String(diverPoint.x));
      swimMapDebugDiver?.setAttribute('cy', String(diverPoint.y));
      const cursorWorld = worldProjection.screenToWorld(pointerScreen);
      const diverWorld = worldProjection.screenToWorld(diverScreen);
      const swimDebug = tracker.getSwimDebugState();
      const rawTargetWorld = swimDebug?.rawWorld || cursorWorld;
      const projectedWorld = swimDebug?.projectedWorld || projectSwimWorldPoint(cursorWorld);
      const diverApproaches = caseApproachesAt(diverWorld);
      const cursorApproaches = caseApproachesAt(cursorWorld);
      if (swimMapDebugCaseList) {
        swimMapDebugCaseList.replaceChildren(...DEEP_SEA_CASE_ANCHORS.map((item) => {
          const row = document.createElement('div');
          row.className = 'swim-map-debug-case-row';
          const placed = item.status === 'CONFIRMED' && item.enabled && item.worldAnchor && item.approachRegion?.polygon;
          const diverIn = placed && diverApproaches.some((candidate) => candidate.caseId === item.caseId);
          const cursorIn = placed && cursorApproaches.some((candidate) => candidate.caseId === item.caseId);
          row.dataset.caseId = item.caseId;
          row.dataset.diverInApproach = String(diverIn);
          row.dataset.cursorInApproach = String(cursorIn);
          const title = document.createElement('b');
          title.textContent = item.label;
          const details = document.createElement('span');
          details.textContent = placed
            ? `${item.spatialType}  |  ${item.interactionType}`
            : 'PENDING  |  UNPLACED';
          const coords = document.createElement('small');
          coords.textContent = placed
            ? `ANCHOR (${item.worldAnchor.x.toFixed(3)}, ${item.worldAnchor.y.toFixed(3)})  |  APPROACH REGION ${item.approachRegion.id}`
            : 'ANCHOR —  |  APPROACH REGION —  |  EXCLUDED';
          const state = document.createElement('em');
          state.textContent = placed
            ? `${diverIn ? 'DIVER IN APPROACH' : 'DIVER OUT'}${cursorIn ? '  ·  CURSOR IN' : ''}`
            : 'PENDING / UNPLACED';
          row.append(title, details, coords, state);
          return row;
        }));
      }
      swimMapDebugReadout.textContent = [
        `SWIM MAP ${DEEP_SEA_SWIM_MAP.version}  |  ${swimLaneAt(cursorWorld.y).region.id}`,
        `master image  x:${imageRect.left.toFixed(1)} y:${imageRect.top.toFixed(1)} w:${imageRect.width.toFixed(1)} h:${imageRect.height.toFixed(1)}`,
        `scroll ${progress.toFixed(3)}  world ${worldProgress.toFixed(3)}`,
        `cursor screen (${pointer.x.toFixed(1)}, ${pointer.y.toFixed(1)})  world (${cursorWorld.x.toFixed(3)}, ${cursorWorld.y.toFixed(3)})`,
        `diver  screen (${diver.x.toFixed(1)}, ${diver.y.toFixed(1)})  world (${diverWorld.x.toFixed(3)}, ${diverWorld.y.toFixed(3)})`,
        `target raw (${rawTargetWorld.x.toFixed(3)}, ${rawTargetWorld.y.toFixed(3)})  projected (${projectedWorld.x.toFixed(3)}, ${projectedWorld.y.toFixed(3)})${projectedWorld.reservedRoute ? `  [RESERVED_APPROACH: ${projectedWorld.reservedRoute}]` : projectedWorld.wasBlocked ? `  [BLOCKED → FREE_WATER${projectedWorld.blockedBy?.length ? `: ${projectedWorld.blockedBy.join(', ')}` : ''}]` : '  [FREE_WATER]'}`,
        `case approach: ${diverApproaches.map((item) => item.label).join(', ') || 'none'}  | cursor: ${cursorApproaches.map((item) => item.label).join(', ') || 'none'}`,
        `geometry: ${swimGeometryAt(cursorWorld.y) ? `${swimLaneAt(cursorWorld.y).region.id} polygon + rock boundaries` : 'coarse lane'}  | routes reserved: ${DEEP_SEA_SWIM_MAP.routes.length}`
      ].join('\n');
    };
    let riftAutoDive = false;
    let riftCompleted = false;
    let riftAutoState = { t: 0 };
    let riftAutoMode = RIFT_AUTO_STATES.FREE;
    let riftAutoPath = null;
    let riftTimeline = null;
    let riftLandingTimer = null;
    let riftAutoScrollStart = null;
    let riftAutoScrollEnd = null;

    const setRiftAutoMode = (mode) => {
      riftAutoMode = mode;
      world.dataset.riftAutoState = mode;
    };
    setRiftAutoMode(RIFT_AUTO_STATES.FREE);
    const riftAutoWindow = {
      triggerStart: DEEP_SEA_WORLD_RANGES.riftApproach.scrollStart,
      triggerEnd: DEEP_SEA_WORLD_RANGES.rift.scrollEnd,
      exitStart: DEEP_SEA_WORLD_RANGES.riftExit.scrollStart,
      chamberStart: DEEP_SEA_WORLD_RANGES.greatChamber.scrollStart,
      diverTriggerY: .46,
      diverLaneLeft: .24,
      diverLaneRight: .76
    };

    const renderRiftVisual = (progress) => {
      // The reset world is downstream-only: terrain stays dormant until the
      // confirmed Profile / Experience / Education field has left the frame.
      const legacyProgress = toLegacyScrollProgress(progress);
      const dropoff = clamp((legacyProgress - .34) / .12, 0, 1);
      const dropIn = clamp((legacyProgress - .34) / .16, 0, 1);
      const dropOut = clamp((.72 - legacyProgress) / .17, 0, 1);
      const auto = riftAutoDive ? riftAutoState.t : 0;
      const visibility = Math.max(riftCompleted ? .72 : 0, dropIn * dropOut);
      const restriction = Math.max(clamp((legacyProgress - .36) / .22, 0, 1), auto);
      const chamber = clamp((legacyProgress - .62) / .2, 0, 1);
      const openBelow = clamp((legacyProgress - .78) / .2, 0, 1);
      const exit = riftAutoDive
        ? .22 + auto * .68
        : riftCompleted
          ? .82
          : clamp((legacyProgress - .58) / .12, 0, 1) * .58;
      world.style.setProperty('--rift-visibility', visibility.toFixed(3));
      world.style.setProperty('--rift-exit-opacity', exit.toFixed(3));
      world.style.setProperty('--rift-left-width', `${(29 + restriction * 14).toFixed(2)}%`);
      world.style.setProperty('--rift-right-width', `${(25 + restriction * 18).toFixed(2)}%`);
      world.style.setProperty('--rift-front-width', `${(35 + restriction * 13).toFixed(2)}%`);
      world.style.setProperty('--terrain-dropoff', dropoff.toFixed(3));
      world.style.setProperty('--terrain-rift', visibility.toFixed(3));
      world.style.setProperty('--terrain-restriction', restriction.toFixed(3));
      world.style.setProperty('--terrain-chamber', chamber.toFixed(3));
      world.style.setProperty('--terrain-open-below', openBelow.toFixed(3));
    };

    const renderDownstreamVisual = (progress, depth) => {
      const worldProgress = mapScrollToWorldProgress(progress);
      const legacyProgress = toLegacyScrollProgress(progress);
      if (!downstreamScene) return { worldProgress };
      const sceneReveal = clamp((legacyProgress - .16) / .14, 0, 1);
      const lightFade = clamp((legacyProgress - .22) / .34, 0, 1);
      const lightFalloff = lightFade * lightFade * (3 - 2 * lightFade);
      const oldLayerFade = clamp((legacyProgress - .22) / .28, 0, 1);
      const oldLayerFalloff = oldLayerFade * oldLayerFade * (3 - 2 * oldLayerFade);
      const sceneTravel = Math.max(0, downstreamScene.offsetHeight - viewport.height);
      const worldDepth = worldProgress * sceneTravel;
      world.classList.toggle('is-long-world-active', progress > .30);
      world.classList.remove('is-downstream-clean');
      downstreamScene.style.setProperty('--scene-shift', `${(-worldDepth).toFixed(1)}px`);
      downstreamScene.style.setProperty('--scene-opacity', sceneReveal.toFixed(3));
      // The master remains the world baseline. Atmosphere layers drift only a
      // trace slower, creating depth without turning the scene into a demo.
      downstreamScene.style.setProperty('--scene-water-shift', `${(-worldDepth * .018).toFixed(1)}px`);
      downstreamScene.style.setProperty('--scene-depth-shift', `${(-worldDepth * .008).toFixed(1)}px`);
      downstreamScene.style.setProperty('--downstream-water-alpha', (.07 + worldProgress * .015).toFixed(3));
      downstreamScene.style.setProperty('--downstream-depth-alpha', (.035 + worldProgress * .025).toFixed(3));
      world.style.setProperty('--long-world-light', (.84 * (1 - lightFalloff)).toFixed(3));
      world.style.setProperty('--long-world-old-opacity', (1 - oldLayerFalloff).toFixed(3));
      world.dataset.scrollProgress = progress.toFixed(4);
      world.dataset.worldProgress = worldProgress.toFixed(4);
      world.dataset.worldRangeMap = JSON.stringify(DEEP_SEA_WORLD_RANGES);
      return { worldProgress, worldDepth };
    };

    const setRiftAutoMotion = (progress) => {
      riftAutoState.t = clamp(progress, 0, 1);
      const t = riftAutoState.t;
      const enteringBlend = smoothstep(clamp(t / .055, 0, 1));
      const scrollProgress = clamp(currentDepth / Math.max(1, viewport.maxDepth), 0, 1);
      const timelineExitBlend = smoothstep(clamp((t - .92) / .08, 0, 1));
      const scrollExitBlend = riftAutoDive ? 0 : clamp(
        (scrollProgress - riftAutoWindow.exitStart)
        / Math.max(.0001, riftAutoWindow.chamberStart - riftAutoWindow.exitStart),
        0,
        1
      );
      const exitingBlend = Math.max(timelineExitBlend, scrollExitBlend);
      const pathInfluence = t < .08 ? enteringBlend : 1;
      const followWeight = 1 - pathInfluence;
      if (exitingBlend > 0) setRiftAutoMode(RIFT_AUTO_STATES.EXITING_RIFT);
      else if (t < .18) setRiftAutoMode(RIFT_AUTO_STATES.ENTERING_RIFT);
      else if (t < .92) setRiftAutoMode(RIFT_AUTO_STATES.AUTO_DIVE);
      else setRiftAutoMode(RIFT_AUTO_STATES.EXITING_RIFT);
      if (riftAutoPath) {
        const arc = Math.sin(t * Math.PI);
        const centerEase = smoothstep(clamp(t / .62, 0, 1));
        const caveApproachEase = smoothstep(clamp((t - .52) / .48, 0, 1));
        const drift = Math.sin(t * Math.PI * 1.12) * (.006 + arc * riftAutoPath.drift);
        const x = riftAutoPath.originX
          + (riftAutoPath.centerX - riftAutoPath.originX) * centerEase
          + (riftAutoPath.arrivalX - riftAutoPath.centerX) * caveApproachEase
          + drift;
        const y = riftAutoPath.originY
          + (riftAutoPath.destinationY - riftAutoPath.originY) * (t * .22 + t * t * .78)
          - arc * .006;
        tracker.setCinematicTarget(x * viewport.width, y * viewport.height, pathInfluence);
        const headDownBlend = smoothstep(clamp((t - .015) / .22, 0, 1));
        const headingDelta = ((-90 - riftAutoPath.startHeading + 540) % 360) - 180;
        const descentHeading = riftAutoPath.startHeading + headingDelta * headDownBlend;
        const caveLiftBlend = smoothstep(clamp((t - .72) / .28, 0, 1));
        tracker.setCinematicHeading(
          descentHeading + (riftAutoPath.arrivalHeading - descentHeading) * caveLiftBlend
        );
      }
      if (riftAutoScrollStart != null && riftAutoScrollEnd != null) {
        const cameraT = smoothstep(t);
        targetDepth = riftAutoScrollStart + (riftAutoScrollEnd - riftAutoScrollStart) * cameraT;
        dirty = true;
      }
      riftAutoState.pathInfluence = pathInfluence;
      riftAutoState.followWeight = followWeight;
      world.dataset.riftAutoPathInfluence = pathInfluence.toFixed(3);
      world.dataset.riftAutoFollowWeight = followWeight.toFixed(3);
      world.style.setProperty('--rift-auto-progress', riftAutoState.t.toFixed(3));
      world.style.setProperty('--rift-auto-distant', `${(riftAutoState.t * 34).toFixed(1)}px`);
      world.style.setProperty('--rift-auto-middle', `${(riftAutoState.t * 78).toFixed(1)}px`);
      world.style.setProperty('--rift-auto-foreground', `${(riftAutoState.t * 132).toFixed(1)}px`);
      world.style.setProperty('--rift-auto-content', `${(riftAutoState.t * 84).toFixed(1)}px`);
      renderRiftVisual(clamp(currentDepth / Math.max(1, viewport.maxDepth), 0, 1));
    };

    const lockRiftScroll = (event) => {
      if (riftAutoDive) event.preventDefault();
    };

    const unlockRift = () => {
      if (riftTimeline) riftTimeline.kill();
      if (riftLandingTimer) window.clearTimeout(riftLandingTimer);
      riftTimeline = null;
      riftLandingTimer = null;
      riftAutoDive = false;
      riftCompleted = true;
      riftAutoPath = null;
      if (riftAutoScrollEnd != null) {
        targetDepth = riftAutoScrollEnd;
        window.scrollTo(0, riftAutoScrollEnd);
      }
      riftAutoScrollStart = null;
      riftAutoScrollEnd = null;
      window.removeEventListener('wheel', lockRiftScroll);
      window.removeEventListener('touchmove', lockRiftScroll);
      setRiftAutoMode(RIFT_AUTO_STATES.FREE_IN_CHAMBER);
      world.classList.remove('is-rift-auto');
      document.body.classList.remove('is-rift-auto');
      world.style.setProperty('--rift-auto-progress', '0');
      world.style.setProperty('--rift-auto-distant', '0px');
      world.style.setProperty('--rift-auto-middle', '0px');
      world.style.setProperty('--rift-auto-foreground', '0px');
      world.style.setProperty('--rift-auto-content', '0px');
      // Keep the visible landing point until the user's next real pointer
      // movement; otherwise the restored follow target immediately erases the
      // chosen chamber arrival on the same frame.
      tracker.clearCinematicTarget({ preserveTarget: true });
      tracker.clearCinematicHeading();
      tracker.setPointerFollowEnabled(true);
      tracker.holdPointerFollowAtCurrentPosition();
      renderRiftVisual(clamp(currentDepth / Math.max(1, viewport.maxDepth), 0, 1));
    };

    const settleRiftLanding = () => {
      // A short, still arrival makes the destination legible before free swim
      // resumes. Cursor Light stays on the user's actual pointer throughout.
      if (riftAutoPath) tracker.snapCinematicHeading(riftAutoPath.arrivalHeading);
      setRiftAutoMode(RIFT_AUTO_STATES.SETTLING_IN_CHAMBER);
      riftLandingTimer = window.setTimeout(unlockRift, 820);
    };

    const beginRiftAutoDive = () => {
      const triggerStart = riftAutoWindow.triggerStart;
      const triggerEnd = riftAutoWindow.triggerEnd;
      const scrollProgress = clamp(targetDepth / Math.max(1, viewport.maxDepth), 0, 1);
      if (
        riftAutoMode !== RIFT_AUTO_STATES.FREE
        || riftAutoDive
        || riftCompleted
        || ascentActive
        || scrollProgress < triggerStart
        || scrollProgress > triggerEnd
      ) return;
      riftAutoDive = true;
      riftAutoScrollStart = clamp(currentDepth, 0, viewport.maxDepth);
      riftAutoScrollEnd = clamp(
        riftAutoWindow.chamberStart * viewport.maxDepth,
        riftAutoScrollStart,
        viewport.maxDepth
      );
      riftAutoState = { t: .055, pathInfluence: 0, followWeight: 1 };
      world.classList.add('is-rift-auto');
      document.body.classList.add('is-rift-auto');
      window.addEventListener('wheel', lockRiftScroll, { passive: false });
      window.addEventListener('touchmove', lockRiftScroll, { passive: false });
      tracker.setPointerFollowEnabled(false);
      const origin = tracker.getPosition();
      const originX = clamp(origin.x / Math.max(1, viewport.width), .08, .92);
      const originY = clamp(origin.y / Math.max(1, viewport.height), .18, .82);
      riftAutoPath = {
        originX,
        originY,
        startHeading: tracker.heading,
        // Chamber landing is anchored to the approved composition: central
        // lower waterway, head lifted toward the upper-left, clear of both
        // walls and the Primary Cave mouth.
        arrivalHeading: 42,
        centerX: clamp(.5 + (originX - .5) * .2, .39, .61),
        // Land in the open water immediately in front of the LTPO Primary
        // Cave. This normalized screen position maps into the existing
        // ltpoApproach polygon at the chamber handoff without moving its
        // anchor or changing any collision geometry.
        arrivalX: .29,
        // Lift the first-arrival pose slightly in the chamber viewport while
        // keeping the landing inside the existing LTPO approach polygon.
        destinationY: .68,
        drift: .010
      };
      setRiftAutoMotion(riftAutoState.t);
      if (!gs || reducedMotion) {
        riftAutoState.t = 1;
        setRiftAutoMotion(1);
        window.setTimeout(settleRiftLanding, reducedMotion ? 140 : 420);
        return;
      }
      riftTimeline = gs.to(riftAutoState, {
        t: 1,
        duration: 6.25,
        ease: 'power1.inOut',
        onUpdate: () => setRiftAutoMotion(riftAutoState.t),
        onComplete: settleRiftLanding
      });
    };

    const dismissOnboarding = () => {
      if (onboardingDismissed || !onboarding) return;
      onboardingDismissed = true;
      onboarding.classList.add('is-dismissed');
      window.removeEventListener('pointermove', markOnboardingSwim);
      window.removeEventListener('mousemove', markOnboardingSwim);
      window.removeEventListener('keydown', onOnboardingKey);
    };

    const maybeDismissOnboarding = () => {
      if (onboardingHasScrolled && onboardingHasSwum) dismissOnboarding();
    };

    const markOnboardingSwim = () => {
      if (onboardingDismissed || onboardingHasSwum) return;
      const pointer = tracker.getPointerPosition();
      onboardingHasSwum = Math.hypot(
        pointer.x - onboardingStartPointer.x,
        pointer.y - onboardingStartPointer.y
      ) >= ONBOARDING_SWIM_DISTANCE;
      maybeDismissOnboarding();
    };

    const onOnboardingKey = (event) => {
      if (['ArrowDown', 'PageDown', ' ', 'Spacebar'].includes(event.key)) {
        onboardingHasScrolled = true;
        maybeDismissOnboarding();
      }
    };

    const setPullVisual = (distance) => {
      if (!lifeline) return;
      pullDistance = clamp(distance, 0, PULL_MAX);
      const ratio = pullDistance / PULL_MAX;
      lifeline.style.setProperty('--rope-pull', `${pullDistance.toFixed(1)}px`);
      lifeline.style.setProperty('--rope-stretch', ratio.toFixed(3));
    };

    const setLifelineDepth = (progress) => {
      if (!lifeline) return;
      // The buoy remains the persistent return-to-surface anchor while the
      // rope gathers from its fixed upper attachment. The visual length is
      // capped at a deliberate half-length and never disappears.
      const ropeRetract = clamp((progress - .015) / .14, 0, .5);
      lifeline.style.setProperty('--rope-retract', ropeRetract.toFixed(3));
      // Compress the rope from its fixed upper attachment so the lower knot
      // travels with the rope instead of being erased by a bottom clip.
      lifeline.style.setProperty('--rope-tail-lift', `${(-ropeRetract * 188).toFixed(1)}px`);
      lifeline.style.setProperty('--lifeline-lift', '0px');
      const promptDock = clamp((progress - .025) / .1, 0, 1);
      lifeline.style.setProperty('--return-copy-x', `${(promptDock * 105).toFixed(1)}px`);
      lifeline.style.setProperty('--return-copy-y', `${(-promptDock * 176).toFixed(1)}px`);
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

    const autoPullLifeline = () => {
      if (ascentActive || clickPullActive || !lifeline) return;
      clickPullActive = true;
      lifeline.classList.add('is-near', 'is-pulling', 'has-been-touched');
      tracker.setPointerFollowEnabled(false);
      if (gs && !reducedMotion) {
        gs.timeline({
          onComplete: () => {
            clickPullActive = false;
            beginAscent();
          }
        })
          .to(lifeline, { '--rope-pull': '126px', '--rope-stretch': .78, duration: .34, ease: 'power2.in' })
          .to(lifeline, { '--rope-pull': '104px', '--rope-stretch': .48, duration: .2, ease: 'power1.out' })
          .to(lifeline, { '--rope-pull': '0px', '--rope-stretch': 0, duration: .48, ease: 'elastic.out(1,.42)' });
      } else {
        setPullVisual(126);
        window.setTimeout(() => {
          setPullVisual(0);
          clickPullActive = false;
          beginAscent();
        }, 480);
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
      const diverOffsetX = diverOrigin.x - tracker.box.width / 2;
      const diverOffsetY = diverOrigin.y - tracker.box.height / 2;
      const setFallbackDiverPose = (offsetY = diverOffsetY) => {
        swimmer.style.transition = reducedMotion ? 'none' : 'transform .58s cubic-bezier(.2,.72,.24,1)';
        swimmer.style.transform = `translate(-50%,-50%) translate3d(${diverOffsetX}px,${offsetY}px,0) rotate(56deg) scaleX(1)`;
      };
      lifeline.classList.remove('is-pulling');
      lifeline.classList.add('is-ascent');
      document.body.classList.add('is-ascent-active');
      world.classList.add('is-ascent-active');
      window.addEventListener('wheel', lockAscentScroll, { passive: false });
      tracker.setPointerFollowEnabled(false);
      tracker.destroy();
      if (!gs || reducedMotion) {
        setFallbackDiverPose();
        world.style.setProperty('--ascent-light', '1');
        world.style.setProperty('--ascent-bubbles-opacity', reducedMotion ? '0' : '.72');
        if (reducedMotion) {
          resetDepthBehindBubbles();
          window.setTimeout(finishAscent, 520);
        } else {
          world.classList.add('is-fallback-ascent');
          world.style.setProperty('--ascent-distant-shift', '30vh');
          world.style.setProperty('--ascent-middle-shift', '58vh');
          world.style.setProperty('--ascent-foreground-shift', '76vh');
          world.style.setProperty('--ascent-content-shift', '92vh');
          startBubbleStream(diverOrigin);
          window.setTimeout(() => setFallbackDiverPose(diverOffsetY - 230), 180);
          window.setTimeout(() => {
            world.style.setProperty('--ascent-distant-shift', '62vh');
            world.style.setProperty('--ascent-middle-shift', '106vh');
            world.style.setProperty('--ascent-foreground-shift', '138vh');
            world.style.setProperty('--ascent-content-shift', '164vh');
            world.style.setProperty('--ascent-light', '.94');
            world.style.setProperty('--ascent-bubbles-opacity', '1');
          }, 430);
          window.setTimeout(() => {
            resetDepthBehindBubbles();
            world.style.setProperty('--ascent-light', '1');
          }, 620);
          window.setTimeout(finishAscent, 1160);
        }
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
        .to(swimmer, { rotation: 56, duration: .72, ease: 'power2.inOut' }, 0)
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
        .to(swimmer, { y: -560, rotation: 52, duration: 2.2, ease: 'power2.in' }, .92)
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
        if (ascentActive || clickPullActive || event.button !== 0) return;
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
        const wasClick = pullDistance < 10;
        pullActive = false;
        pullPointerId = null;
        lifeline.releasePointerCapture?.(event.pointerId);
        if (reached) beginAscent();
        else if (wasClick) autoPullLifeline();
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

    const refreshGeometry = () => {
      const rect = world.getBoundingClientRect();
      const swimmerRect = swimmer?.getBoundingClientRect();
      viewport.width = rect.width;
      viewport.height = rect.height;
      updateDeepSeaWorldRanges(viewport.width, viewport.height);
      viewport.halfW = (swimmerRect?.width || 132) / 2;
      viewport.halfH = (swimmerRect?.height || 94) / 2;
      viewport.maxDepth = Math.max(1, (scrollSpacer?.offsetHeight || document.documentElement.scrollHeight) - viewport.height);
      riftAutoWindow.triggerStart = DEEP_SEA_WORLD_RANGES.riftApproach.scrollStart;
      riftAutoWindow.triggerEnd = DEEP_SEA_WORLD_RANGES.rift.scrollEnd;
      riftAutoWindow.exitStart = DEEP_SEA_WORLD_RANGES.riftExit.scrollStart;
      riftAutoWindow.chamberStart = DEEP_SEA_WORLD_RANGES.greatChamber.scrollStart;
      targetDepth = clamp(window.scrollY, 0, viewport.maxDepth);
      currentDepth = clamp(currentDepth, 0, viewport.maxDepth);
      tracker.refreshBox();
      dirty = true;
    };

    const applyBounds = (progress) => {
      // The coarse collision map owns the world-space water lane. These are
      // only viewport safety margins for the rendered sprite itself.
      worldProjection.refresh();
      const edge = Math.max(18, viewport.halfW * .34);
      const minX = viewport.halfW + edge;
      const maxX = Math.max(minX, viewport.width - viewport.halfW - edge);
      const minY = viewport.halfH + 18;
      const maxY = Math.max(minY, viewport.height - viewport.halfH - 22);
      tracker.setDiveBounds({
        minX,
        maxX,
        minY,
        maxY,
        hardMinY: minY,
        hardMaxY: maxY
      });
      const screenPointer = {
        x: worldProjection.getSnapshot().rootRect.left + tracker.getPointerPosition().x,
        y: worldProjection.getSnapshot().rootRect.top + tracker.getPointerPosition().y
      };
      const pointerWorld = worldProjection.screenToWorld(screenPointer);
      world.dataset.depthZone = swimLaneAt(pointerWorld.y).region.id;
      world.dataset.safeLeft = minX.toFixed(1);
      world.dataset.safeRight = maxX.toFixed(1);
    };

    const render = () => {
      const delta = targetDepth - currentDepth;
      const diverPosition = tracker.getPosition();
      const diverMoved = Math.hypot(
        diverPosition.x - lastProximityPosition.x,
        diverPosition.y - lastProximityPosition.y
      ) > .35;
      if (!dirty && Math.abs(delta) < .08 && !diverMoved) return;
      currentDepth += reducedMotion ? delta : delta * .105;
      if (Math.abs(targetDepth - currentDepth) < .08) currentDepth = targetDepth;
      const progress = clamp(currentDepth / viewport.maxDepth, 0, 1);
      const legacyProgress = toLegacyScrollProgress(progress);
      world.classList.toggle(
        'is-rift-passage',
        progress > DEEP_SEA_WORLD_RANGES.riftApproach.scrollStart
        && progress < DEEP_SEA_WORLD_RANGES.greatChamber.scrollEnd
      );
      world.style.setProperty('--depth-light-loss', (Math.pow(legacyProgress, .72) * .52).toFixed(3));
      world.style.setProperty('--descent-depth', `${-currentDepth}px`);
      world.style.setProperty('--depth-distant', `${-currentDepth * .42}px`);
      world.style.setProperty('--depth-middle', `${-currentDepth * .9}px`);
      world.style.setProperty('--depth-foreground', `${-currentDepth * 1.08}px`);
      world.style.setProperty('--depth-content', `${-currentDepth}px`);
      const downstreamState = renderDownstreamVisual(progress, currentDepth);
      applyBounds(progress);
      setLifelineDepth(legacyProgress);
      renderRiftVisual(progress);
      renderSwimMapDebug(progress, downstreamState.worldProgress);
      renderCaseDiscovery();
      const riftTriggerStart = riftAutoWindow.triggerStart;
      const riftTriggerEnd = riftAutoWindow.triggerEnd;
      const riftTriggerProgress = clamp(targetDepth / Math.max(1, viewport.maxDepth), 0, 1);
      if (
        riftAutoMode === RIFT_AUTO_STATES.FREE
        && !riftAutoDive
        && !riftCompleted
        && riftTriggerProgress >= riftTriggerStart
        && riftTriggerProgress <= riftTriggerEnd
      ) {
        const diver = tracker.getPosition();
        const nearRiftOpening = diver.y > viewport.height * riftAutoWindow.diverTriggerY;
        const insideRiftLane = diver.x > viewport.width * riftAutoWindow.diverLaneLeft
          && diver.x < viewport.width * riftAutoWindow.diverLaneRight;
        if (nearRiftOpening && insideRiftLane) beginRiftAutoDive();
      }
      const maxDepthMeters = 420;
      const depthMeters = 6 + Math.round((downstreamState?.worldProgress ?? progress) * (maxDepthMeters - 6));
      if (depthReadout) depthReadout.textContent = `${String(depthMeters).padStart(3, '0')}m`;
      if (instruction) instruction.style.opacity = String(.92 - legacyProgress * .58);
      const fadeStart = viewport.height * .30;
      const fadeEnd = viewport.height * .07;
      informationNodes.forEach((node) => {
        const infoRect = node.getBoundingClientRect();
        const fade = clamp((fadeStart - infoRect.top) / Math.max(1, fadeStart - fadeEnd), 0, 1);
        const baseOpacity = Number(node.style.getPropertyValue('--information-base-opacity')) || 0;
        node.style.setProperty('--information-opacity', (baseOpacity * (1 - fade * .94)).toFixed(3));
        node.style.setProperty('--information-blur', `${(fade * 1.35).toFixed(2)}px`);
      });
      lastProximityPosition = diverPosition;
      dirty = Math.abs(targetDepth - currentDepth) >= .08;
    };

    const onScroll = () => {
      if (ascentActive) return;
      targetDepth = clamp(window.scrollY, 0, viewport.maxDepth);
      if (targetDepth > ONBOARDING_SCROLL_DISTANCE) {
        onboardingHasScrolled = true;
        maybeDismissOnboarding();
      }
      dirty = true;
    };

    refreshGeometry();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', markOnboardingSwim, { passive: true });
    window.addEventListener('mousemove', markOnboardingSwim, { passive: true });
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
