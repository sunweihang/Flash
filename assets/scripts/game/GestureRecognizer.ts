import { Vec2 } from 'cc';

export type GestureKind = 'flick' | 'fan' | 'arc' | 'cross' | 'pierce';

export type GestureResult = {
  kind: GestureKind;
  /** Normalized aim on screen: x/y in [-1, 1], y up. */
  aim: Vec2;
  /** Stroke length in UI pixels. */
  length: number;
  label: string;
};

/**
 * Classify a drag stroke for the HUD label only.
 * Knives stream while drawing (see GameController); this just names the path.
 */
export function classifyGesture(points: ReadonlyArray<Vec2>): GestureResult | null {
  if (points.length < 1) return null;

  // Tap / stationary click: still throw a single knife forward.
  if (points.length === 1) {
    return { kind: 'flick', aim: new Vec2(0, 1), length: 0, label: 'FLICK' };
  }

  const start = points[0];
  const end = points[points.length - 1];
  const net = new Vec2(end.x - start.x, end.y - start.y);
  const netLen = net.length();
  const polyLen = polylineLength(points);

  // Near-tap: tiny jitter still counts as flick.
  if (netLen < 6 && polyLen < 14) {
    return { kind: 'flick', aim: new Vec2(0, 1), length: polyLen, label: 'FLICK' };
  }

  let length = 0;
  let turnAcc = 0;
  let dirFlips = 0;
  let prevDir: Vec2 | null = null;
  let absDx = 0;
  let absDy = 0;

  for (let i = 1; i < points.length; i++) {
    const d = new Vec2(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    const seg = d.length();
    if (seg < 0.5) continue;
    length += seg;
    absDx += Math.abs(d.x);
    absDy += Math.abs(d.y);
    const dir = d.normalize();
    if (prevDir) {
      const cross = prevDir.x * dir.y - prevDir.y * dir.x;
      const dot = prevDir.x * dir.x + prevDir.y * dir.y;
      turnAcc += Math.abs(Math.atan2(cross, dot));
      if (dot < -0.2) dirFlips += 1;
    }
    prevDir = dir;
  }

  // Prefer net displacement when sampling was sparse (few move events).
  length = Math.max(length, netLen);
  if (length < 6) {
    return { kind: 'flick', aim: new Vec2(0, 1), length, label: 'FLICK' };
  }

  const straightness = netLen / Math.max(length, 1);
  const horizRatio = absDx / Math.max(absDx + absDy, 1);
  // Also consider net axis when absDx/absDy sampling is noisy.
  const netHorizRatio = Math.abs(net.x) / Math.max(Math.abs(net.x) + Math.abs(net.y), 1);
  const axisHoriz = Math.max(horizRatio, netHorizRatio * 0.85);
  const aim = netLen > 1 ? net.normalize() : new Vec2(0, 1);

  let kind: GestureKind;
  let label: string;

  if (dirFlips >= 2 || (dirFlips >= 1 && turnAcc > 2.2)) {
    kind = 'cross';
    label = 'CROSS SLASH';
  } else if (turnAcc > 1.35 && straightness < 0.72) {
    kind = 'arc';
    label = 'ARC VOLLEY';
  } else if (axisHoriz > 0.62 && straightness > 0.4) {
    kind = 'fan';
    label = 'FAN THROW';
  } else if (
    // Vertical / long straight → pierce (includes short-ish up/down flicks).
    (axisHoriz < 0.38 && straightness > 0.55 && length > 48) ||
    (straightness > 0.82 && length > 140)
  ) {
    kind = 'pierce';
    label = 'PIERCE';
  } else {
    kind = 'flick';
    label = 'FLICK';
  }

  return { kind, aim, length, label };
}

function polylineLength(points: ReadonlyArray<Vec2>): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Vec2.distance(points[i - 1], points[i]);
  }
  return len;
}
