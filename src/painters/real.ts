import { bumpTexture, hash2 } from '../noise';
import type { Surface } from '../surface';
import type { Geo } from './shared';
import { LIGHT, SHADOW, buffers, commit, palette } from './shared';

// Treats the pile as a rounded ridge under one light and shades every pixel.
// Light wraps past the shadow line, which is what makes it read as snow.
export function paintReal(s: Surface, geo: Geo): void {
  const { cols, rows, top: y0, scale: d, stride } = geo;
  const { columns, pixels } = buffers();
  const T = columns.top, B = columns.bottom, RISE = columns.rise, COVER = columns.cover, BASE = columns.base, AVG = columns.average;
  const bump = bumpTexture(), bumpX = bump.x, bumpY = bump.y;
  const pal = palette(s.backdrop), S = pal.shade, M = pal.mid, W = pal.lit, E = s.fill, rim = pal.rim;
  const Lx = LIGHT[0], Ly = LIGHT[1], Lz = LIGHT[2];
  const slopeSpan = Math.max(1, Math.round(1.5 * d)), shadowShift = Math.round(1.5 * d);
  const texels = 1.5 / d, offset = s.seed & 255, peak = s.peak;

  for (let c = 0; c < cols; c++) {
    const cover = COVER[c], cs = c - shadowShift, coverS = cs >= 0 ? COVER[cs] : 0;
    if (cover <= 0.02 && coverS <= 0.02) continue;
    const Tc = T[c], Bc = B[c], thick = Bc - Tc, base = BASE[c];
    const c0 = c - slopeSpan < 0 ? 0 : c - slopeSpan, c1 = c + slopeSpan >= cols ? cols - 1 : c + slopeSpan, run = (c1 - c0) / d;
    let slopeTop = (RISE[c1] - RISE[c0]) / run, slopeLip = (B[c1] - B[c0]) / run;
    slopeTop = slopeTop > 1.6 ? 1.6 : slopeTop < -1.6 ? -1.6 : slopeTop;
    slopeLip = slopeLip > 1.2 ? 1.2 : slopeLip < -1.2 ? -1.2 : slopeLip;
    const edge = thick > 0.01 ? RISE[c] / thick : 0.5;
    let dip = (AVG[c] - RISE[c]) / (peak * 0.1);
    dip = dip > 1 ? 1 : dip < -1 ? -1 : dip;
    const BS = coverS > 0.02 ? B[cs] : -1e9;
    const thickS = coverS > 0.02 ? B[cs] - T[cs] : 0, shadowLen = 2 + 0.16 * thickS, shadowEnd = 3.2 * shadowLen;
    const solid = thick >= 4.5 ? 1 : thick / 4.5, solidS = thickS >= 4.5 ? 1 : thickS / 4.5;
    const rowTop = Math.max(0, Math.floor((Tc - 1.6 - y0) * d));
    const rowEnd = Math.min(rows - 1, Math.ceil(((BS > Bc ? BS : Bc) + shadowEnd - y0) * d));
    const bu = (c * texels + offset) & 255, grainX = ((c / d) * 1.3) | 0;

    for (let r = rowTop; r <= rowEnd; r++) {
      const y = (r + 0.5) / d + y0;
      let a = 0, cr = 0, cg = 0, cb = 0;

      if (cover > 0.02 && y < Bc + 0.6) {
        const g = hash2(c, r);
        const fromTop = y - Tc + (g - 0.5) * 0.9, fromBottom = Bc - y;
        const aTop = fromTop <= 0 ? 0 : fromTop >= 1.2 ? 1 : fromTop / 1.2;
        const aBottom = fromBottom <= -0.5 ? 0 : fromBottom >= 0.7 ? 1 : (fromBottom + 0.5) / 1.2;
        a = aTop * aBottom;
        if (a > 0.004) {
          let v = (y - Tc) / thick;
          v = v < 0 ? 0 : v > 1 ? 1 : v;
          let angle: number, under = 0;
          if (v < edge) angle = 0.15 + 1.1 * Math.pow(v / edge, 1.1);
          else {
            under = ((v - edge) / (1 - edge + 1e-4)) * solid * solid;
            angle = 1.25 + 1.3 * Math.pow(under, 0.85);
          }
          let ny = Math.cos(angle);
          const nz = Math.sin(angle), up = 1 - v;
          let nx = -slopeTop * 1.9 * up * Math.sqrt(up) - slopeLip * 1.3 * v * v;
          const bi = (((r * texels + offset * 3) & 255) << 8) | bu;
          nx += bumpX[bi] * 3;
          ny -= bumpY[bi] * 3;
          const grain = hash2(grainX + 7919, (((r / d) * 1.3) | 0) + 104729), g2 = hash2(c + 15485863, r + 32452843);
          if (solid < 1) {
            const keep = (grain - 1.3 * (1 - solid) + 0.3) / 0.3;
            a *= keep <= 0 ? 0 : keep >= 1 ? 1 : keep;
          }
          nx += (grain - 0.5) * 0.2 + (g - 0.5) * 0.08;
          ny += (g2 - 0.5) * 0.14;
          const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
          let light = ((nx * Lx + ny * Ly + nz * Lz) * inv + 0.32) / 1.32;
          light -= 0.13 * dip * up;
          light += (grain - 0.5) * 0.3 * light * (1 - light);
          light = light < 0 ? 0 : light > 1 ? 1 : light;
          if (light < 0.42) {
            let k = light / 0.42;
            k = k * k * (3 - 2 * k);
            cr = S[0] + (M[0] - S[0]) * k; cg = S[1] + (M[1] - S[1]) * k; cb = S[2] + (M[2] - S[2]) * k;
          } else if (light < 0.8) {
            let k = (light - 0.42) / 0.38;
            k = k * k * (3 - 2 * k);
            cr = M[0] + (W[0] - M[0]) * k; cg = M[1] + (W[1] - M[1]) * k; cb = M[2] + (W[2] - M[2]) * k;
          } else {
            const k = (light - 0.8) / 0.2;
            cr = W[0] + (255 - W[0]) * k; cg = W[1] + (255 - W[1]) * k; cb = W[2] + (255 - W[2]) * k;
          }
          if (under > 0) {
            const occlusion = 1 - 0.2 * under * under, bounce = 0.24 * under;
            cr = (cr + (E[0] - cr) * bounce) * occlusion;
            cg = (cg + (E[1] - cg) * bounce) * occlusion;
            cb = (cb + (E[2] - cb) * bounce) * occlusion;
          }
          if (rim > 0 && fromTop < 2.4) {
            const k = rim * (1 - fromTop / 2.4);
            cr += (S[0] - cr) * k; cg += (S[1] - cg) * k; cb += (S[2] - cb) * k;
          }
          if (g2 > 0.988 && light > 0.5) { cr += 16; cg += 16; cb += 16; }
        } else a = 0;
      }

      let shadow = 0;
      if (a < 0.999 && coverS > 0.02 && y >= base) {
        const below = y > BS ? y - BS : 0;
        if (below < shadowEnd) shadow = coverS * solidS * solidS * (0.26 * Math.exp(-below / 1.6) + 0.2 * Math.exp(-below / shadowLen)) * (1 - below / shadowEnd);
      }
      const alpha = a + shadow * (1 - a);
      if (alpha <= 0.004) continue;
      const o = (r * stride + c) * 4, snow = a / alpha, rest = 1 - snow;
      pixels[o] = cr * snow + SHADOW[0] * rest;
      pixels[o + 1] = cg * snow + SHADOW[1] * rest;
      pixels[o + 2] = cb * snow + SHADOW[2] * rest;
      pixels[o + 3] = alpha * 255;
    }
  }
  commit(s, geo);
}
