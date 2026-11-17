import type { Profile, Surface } from '../surface';
import { profile } from '../surface';
import type { Geo } from './shared';
import { wipe } from './shared';

const point: Profile = { rise: 0, lip: 0, base: 0, cover: 0 };

function trace(ctx: CanvasRenderingContext2D, top: number[], bottom: number[]): void {
  const n = top.length / 2;
  ctx.beginPath();
  ctx.moveTo(top[0], top[1]);
  for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(top[2 * i], top[2 * i + 1], (top[2 * i] + top[2 * i + 2]) / 2, (top[2 * i + 1] + top[2 * i + 3]) / 2);
  ctx.lineTo(top[2 * n - 2], top[2 * n - 1]);
  ctx.lineTo(bottom[2 * n - 2], bottom[2 * n - 1]);
  for (let i = n - 2; i > 0; i--) ctx.quadraticCurveTo(bottom[2 * i], bottom[2 * i + 1], (bottom[2 * i] + bottom[2 * i - 2]) / 2, (bottom[2 * i + 1] + bottom[2 * i - 1]) / 2);
  ctx.lineTo(bottom[0], bottom[1]);
  ctx.closePath();
}

// A smooth illustrated cap drawn with paths and gradients.
export function paintSoft(s: Surface, geo: Geo): void {
  const ctx = s.ctx!, k = geo.scale, n = s.count;
  const top: number[] = [], bottom: number[] = [], rises: number[] = [];
  let tallest = 0, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < n; i++) {
    const at = s.insetL + i * s.step;
    profile(s, at, true, point);
    top.push(at, point.base - point.rise);
    bottom.push(at, point.base + point.lip);
    rises.push(point.rise);
    if (point.rise > tallest) tallest = point.rise;
    if (point.base - point.rise < minY) minY = point.base - point.rise;
    if (point.base + point.lip > maxY) maxY = point.base + point.lip;
  }
  if (tallest < 0.9) {
    wipe(s, geo);
    return;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, geo.cols, geo.rows);
  ctx.setTransform(k, 0, 0, k, 0, -geo.top * k);

  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, s.width, s.height, [s.radiusL, s.radiusR, 0, 0]);
  else ctx.rect(0, 0, s.width, s.height);
  ctx.clip();
  ctx.shadowColor = 'rgba(40,58,96,0.3)';
  ctx.shadowBlur = 6 * k;
  ctx.shadowOffsetY = 3 * k;
  ctx.fillStyle = '#fff';
  trace(ctx, top, bottom);
  ctx.fill();
  ctx.restore();

  const body = ctx.createLinearGradient(0, minY, 0, maxY);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.45, '#f8fbfe');
  body.addColorStop(1, '#d3e0f1');
  trace(ctx, top, bottom);
  ctx.fillStyle = body;
  ctx.fill();

  ctx.save();
  trace(ctx, top, bottom);
  ctx.clip();
  for (const mark of s.marks) {
    const i = Math.max(0, Math.min(n - 1, Math.round((mark.at - s.insetL) / s.step))), rise = rises[i];
    if (rise < 5) continue;
    const x = top[2 * i], y = top[2 * i + 1] + rise * (mark.dark ? 0.3 : 0.5), radius = Math.max(5, rise * (mark.dark ? 0.95 : 0.85));
    const puff = ctx.createRadialGradient(x, y, 0, x, y, radius);
    puff.addColorStop(0, mark.dark ? 'rgba(146,170,208,0.34)' : 'rgba(255,255,255,0.85)');
    puff.addColorStop(1, mark.dark ? 'rgba(146,170,208,0)' : 'rgba(255,255,255,0)');
    ctx.fillStyle = puff;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  ctx.beginPath();
  ctx.moveTo(bottom[0], bottom[1] + 2);
  for (let i = 1; i < n; i++) ctx.lineTo(bottom[2 * i], bottom[2 * i + 1] + 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(130,156,198,0.6)';
  ctx.shadowColor = 'rgba(130,156,198,0.95)';
  ctx.shadowBlur = 5 * k;
  ctx.stroke();
  ctx.restore();

  trace(ctx, top, bottom);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(118,146,190,0.26)';
  ctx.stroke();
  s.drawn = true;
}
