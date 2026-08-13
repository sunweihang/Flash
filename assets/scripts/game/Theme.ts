import { Color } from 'cc';

export const DESIGN_W = 1080;
export const DESIGN_H = 1920;

export const Theme = {
  bg: new Color(0, 0, 0, 255),
  floor: new Color(8, 18, 42, 255),
  grid: new Color(40, 140, 255, 220),
  knife: new Color(210, 245, 255, 255),
  /** Keep alpha low — large soft shells read as floor puddles under the camera. */
  knifeGlow: new Color(80, 200, 255, 55),
  halo: new Color(255, 235, 40, 255),
  haloGlow: new Color(255, 220, 60, 100),
  stick: new Color(70, 200, 255, 255),
  uiWhite: new Color(245, 250, 255, 255),
  uiDim: new Color(140, 180, 220, 200),
  danger: new Color(255, 70, 90, 255),
};

/** Arena shooter: distant monsters + gesture knives. */
export const GameTune = {
  slowMoScale: 0.18,
  monsterMinZ: 28,
  monsterMaxZ: 48,
  monsterMinX: -6.5,
  monsterMaxX: 6.5,
  monsterY: 0,
  monsterApproach: 1.6,
  monsterDangerZ: 10,
  waveSize: 3,
  waveGap: 1.8,
  knifeSpeed: 62,
  /** Extra mul applied at the moment a knife leaves the hand. */
  knifeLaunchBoost: 1.55,
  /** Torso height for wheel-burst aim only (hit uses capsule below). */
  monsterHitY: 1.75,
  /** Horizontal radius of body capsule (XZ). */
  knifeHitRadius: 2.2,
  /** Capsule feet→head on scaled ~3.2 zombie (root at y=0). */
  monsterHitMinY: 0.35,
  monsterHitMaxY: 4.8,
  /** Soft Z bounds for cull / launch (not used to pin drag placement). */
  strokeNearZ: 2.0,
  strokeFarZ: 40,
  /** Camera-ray distance for drag tip (bottom of screen → near). */
  strokeNearDist: 12,
  /** Camera-ray distance for drag tip (top of screen → far). */
  strokeFarDist: 34,
  /** Fallback height when ray convert fails; drag no longer locks to this. */
  strokeHeight: 2.6,
  /** Kill knife if flight dips below this (never scrape the grid). */
  knifeMinY: 1.55,
  /** Max flight time after release — leftovers never linger as cyan scrap. */
  knifeMaxLife: 0.75,
  /** Legacy alias: tip plane when depth mapping is unavailable. */
  handZ: 5,
  /** Real-feel release: keep slow-mo while knives stream out. */
  throwSlowMo: 0.28,
  throwSlowFade: 0.85,
  /** Seconds between each knife in the release cascade. */
  knifeStagger: 0.014,
  /** Keep only the newest N knives while a stroke keeps moving. */
  maxKnivesPerStroke: 30,
  /** UI pixels of stroke travel between streamed knives (wider gaps like reference). */
  knifeFireSpacing: 42,
  hitsPerLevel: 6,
  startLives: 3,
  maxMonsters: 8,
};

