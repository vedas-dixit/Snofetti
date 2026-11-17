import { PRISM } from '../colors';
import { bumpTexture, facetTexture, hash } from '../noise';
import type { Surface } from '../surface';
import type { Geo } from './shared';
import { HALF, LIGHT, SHADOW, buffers, commit, palette } from './shared';

const CLEAR = [208, 231, 253];

function blade(at: number, seed: number, size: number): number {
  const cell = Math.floor(at / 10);
  let tall = 0;
  for (let k = cell - 1; k <= cell + 1; k++) {
    if (hash(k * 4 + seed) > 0.5) continue;
    const half = 1.6 + 2.2 * hash(k * 4 + 2 + seed);
    const dx = at - (k + hash(k * 4 + 1 + seed)) * 10;
    const tip = (hash(k * 4 + 3 + seed) - 0.5) * 1.2 * half;
    const t = dx < tip ? (dx + half) / (tip + half) : (half - dx) / (half - tip);
    if (t > 0) {
      const v = t * size * (0.4 + 0.6 * hash(k * 4 + seed + 77));
      if (v > tall) tall = v;
    }
  }
  const u = at / 2.6 + 17.3, j = Math.floor(u), f = u - j, tip = 0.2 + 0.6 * hash(j * 2 + seed + 9999);
  const fringe = (f < tip ? f / tip : (1 - f) / (1 - tip)) * hash(j * 2 + 1 + seed + 9999) * size * 0.28;
  return tall > fringe ? tall : fringe;
}

function icicle(at: number, seed: number, size: number): number {
  const cell = Math.floor(at / 9);
  if (hash(cell * 3 + seed + 5555) > 0.28) return 0;
  const center = (cell + 0.25 + 0.5 * hash(cell * 3 + 1 + seed + 5555)) * 9;
  const half = 1.3 + 1.1 * hash(cell * 3 + 2 + seed + 5555);
  const k = 1 - Math.abs(at - center) / half;
  return k <= 0 ? 0 : Math.pow(k, 0.7) * size * (0.35 + 0.65 * hash(cell * 3 + seed + 7777));
}

// The same snow, turning into clear faceted ice towards its edges, with blades on
// the crest and icicles under the lip.
export function paintCrystal(s: Surface, geo: Geo): void {
  const { cols, rows, top: y0, scale: d, stride } = geo;
  const { columns, pixels } = buffers();
  const T = columns.top, B = columns.bottom, RISE = columns.rise, COVER = columns.cover, BASE = columns.base;
  const T0 = columns.smoothTop, B0 = columns.smoothBottom;
  const peak = s.peak;

  for (let c = 0; c < cols; c++) {
    T0[c] = T[c];
    B0[c] = B[c];
    if (COVER[c] <= 0.02) continue;
    const at = (c + 0.5) / d, grown = Math.min(1, RISE[c] / (peak * 0.45));
    const up = blade(at, s.seed, (1 + 5 * grown) * COVER[c]);
    T[c] -= up;
    RISE[c] += up;
    B[c] += icicle(at, s.seed, 5.5 * grown * COVER[c]);
  }

  const bump = bumpTexture(), bumpX = bump.x, bumpY = bump.y;
  const facets = facetTexture(), facetX = facets.x, facetY = facets.y, facetRand = facets.rand, facetEdge = facets.edge;
  const pal = palette(s.backdrop), S = pal.iceShade, M = pal.iceMid, W = pal.iceLit, E = s.fill;
  const Lx = LIGHT[0], Ly = LIGHT[1], Lz = LIGHT[2], Hx = HALF[0], Hy = HALF[1], Hz = HALF[2];
  const sharpSpan = Math.max(1, Math.round(d)), smoothSpan = Math.max(1, Math.round(1.5 * d)), shadowShift = Math.round(1.5 * d);
  const facetTexels = 2.4 / d, bumpTexels = 1.5 / d, offset = s.seed & 255;

  for (let c = 0; c < cols; c++) {
    const cover = COVER[c], cs = c - shadowShift, coverS = cs >= 0 ? COVER[cs] : 0;
    if (cover <= 0.02 && coverS <= 0.02) continue;
    const Tc = T[c], Bc = B[c], T0c = T0[c], B0c = B0[c], thick = B0c - T0c, base = BASE[c];

    const c0 = c - sharpSpan < 0 ? 0 : c - sharpSpan, c1 = c + sharpSpan >= cols ? cols - 1 : c + sharpSpan, run = (c1 - c0) / d;
    let sharpTop = (RISE[c1] - RISE[c0]) / run, sharpLip = (B[c1] - B[c0]) / run;
    sharpTop = sharpTop > 1.6 ? 1.6 : sharpTop < -1.6 ? -1.6 : sharpTop;
    sharpLip = sharpLip > 1.4 ? 1.4 : sharpLip < -1.4 ? -1.4 : sharpLip;
    const a0 = c - smoothSpan < 0 ? 0 : c - smoothSpan, a1 = c + smoothSpan >= cols ? cols - 1 : c + smoothSpan, run0 = (a1 - a0) / d;
    let smoothTop = (BASE[a1] - T0[a1] - BASE[a0] + T0[a0]) / run0, smoothLip = (B0[a1] - B0[a0]) / run0;
    smoothTop = smoothTop > 1.6 ? 1.6 : smoothTop < -1.6 ? -1.6 : smoothTop;
    smoothLip = smoothLip > 1.2 ? 1.2 : smoothLip < -1.2 ? -1.2 : smoothLip;

    const edgeAt = thick > 0.01 ? (base - T0c) / thick : 0.5;
    const BS = coverS > 0.02 ? B[cs] : -1e9, BS0 = coverS > 0.02 ? B0[cs] : -1e9;
    const thickS = coverS > 0.02 ? B0[cs] - T0[cs] : 0, shadowLen = 2 + 0.16 * thickS, shadowEnd = 3.2 * shadowLen;
    const solid = thick >= 4.5 ? 1 : thick / 4.5, solidS = thickS >= 4.5 ? 1 : thickS / 4.5;
    const rowTop = Math.max(0, Math.floor((Tc - 1 - y0) * d));
    const rowEnd = Math.min(rows - 1, Math.ceil((Math.max(Bc, BS + 6, BS0 + shadowEnd) - y0) * d));
    const fu = ((c * facetTexels + offset) | 0) & 255, bu = (c * bumpTexels + offset) & 255;

    for (let r = rowTop; r <= rowEnd; r++) {
      const y = (r + 0.5) / d + y0;
      let a = 0, cr = 0, cg = 0, cb = 0;

      if (cover > 0.02 && y < Bc + 0.6) {
        const fromTop = y - Tc, fromBottom = Bc - y;
        const aTop = fromTop * d + 0.5, aBottom = fromBottom * d + 0.5;
        a = (aTop <= 0 ? 0 : aTop >= 1 ? 1 : aTop) * (aBottom <= 0 ? 0 : aBottom >= 1 ? 1 : aBottom);
        if (a > 0.004) {
          const fi = ((((r * facetTexels + offset * 5) | 0) & 255) << 8) | fu;
          const rnd = facetRand[fi], seam = facetEdge[fi];
          // depth < 0: inside a blade. drip > 0: inside an icicle.
          const depth = y - T0c, drip = y - B0c;
          let v = depth / thick;
          v = v < 0 ? 0 : v > 1 ? 1 : v;
          let angle: number, under = 0;
          if (drip > 0) angle = 1.45;
          else if (v < edgeAt) angle = 0.15 + 1.1 * Math.pow(v / edgeAt, 1.1);
          else {
            under = ((v - edgeAt) / (1 - edgeAt + 1e-4)) * solid * solid;
            angle = 1.25 + 1.3 * Math.pow(under, 0.85);
          }
          let ny = Math.cos(angle), nz = Math.sin(angle);
          const up = 1 - v;

          // 1 at the edges, 0 in the packed core
          let edge = depth <= 0 ? 1 : depth >= 7 ? 0 : 1 - depth / 7;
          if (fromBottom < 3.5) {
            const k = 1 - fromBottom / 3.5;
            if (k > edge) edge = k;
          }
          const ice = 0.12 + 0.88 * edge * edge;
          const trace = depth <= 0 ? 1 : depth >= 3 ? 0.18 : 1 - (0.82 * depth) / 3;
          let nx = -(smoothTop + (sharpTop - smoothTop) * trace) * 1.5 * up * Math.sqrt(up) - (drip > 0 ? sharpLip : smoothLip) * 1.2 * v * v;
          nx += facetX[fi] * 0.8 * ice;
          ny += facetY[fi] * 0.6 * ice;
          const bi = (((r * bumpTexels + offset * 3) & 255) << 8) | bu;
          nx += bumpX[bi] * 2.2 * (1 - ice);
          ny -= bumpY[bi] * 2.2 * (1 - ice);
          const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
          nx *= inv; ny *= inv; nz *= inv;

          let light = (nx * Lx + ny * Ly + nz * Lz + 0.3) / 1.3;
          light *= 1 + (0.24 * rnd - 0.12) * ice;
          light = light < 0 ? 0 : light > 1 ? 1 : light;
          if (light < 0.42) {
            const k = light / 0.42;
            cr = S[0] + (M[0] - S[0]) * k; cg = S[1] + (M[1] - S[1]) * k; cb = S[2] + (M[2] - S[2]) * k;
          } else if (light < 0.8) {
            const k = (light - 0.42) / 0.38;
            cr = M[0] + (W[0] - M[0]) * k; cg = M[1] + (W[1] - M[1]) * k; cb = M[2] + (W[2] - M[2]) * k;
          } else {
            const k = (light - 0.8) / 0.2;
            cr = W[0] + (255 - W[0]) * k; cg = W[1] + (255 - W[1]) * k; cb = W[2] + (255 - W[2]) * k;
          }
          if (seam < 1.2) {
            const k = (1 - seam / 1.2) * (rnd < 0.6 ? 18 : -12) * ice;
            cr += k; cg += k; cb += k;
          }
          if (rnd > 0.86 && rnd <= 0.93) {
            const tint = PRISM[(((rnd - 0.86) / 0.07) * PRISM.length) | 0], k = (0.2 + 0.25 * light) * ice;
            cr += (tint[0] - cr) * k; cg += (tint[1] - cg) * k; cb += (tint[2] - cb) * k;
          }
          if (under > 0) {
            const occlusion = 1 - 0.2 * under * under, bounce = 0.24 * under;
            cr = (cr + (E[0] - cr) * bounce) * occlusion;
            cg = (cg + (E[1] - cg) * bounce) * occlusion;
            cb = (cb + (E[2] - cb) * bounce) * occlusion;
          }

          // a tight highlight, so whole shards light up at once
          const facing = nx * Hx + ny * Hy + nz * Hz;
          let shine = facing > 0.93 ? (facing - 0.93) / 0.07 : 0;
          shine *= shine;
          if (rnd > 0.95 && shine < 0.7) shine = 0.7;
          shine *= ice;
          cr += (255 - cr) * shine; cg += (255 - cg) * shine; cb += (255 - cb) * shine;

          // clear at the edges, milky in the core
          const thin = 0.32 + 0.36 * rnd;
          let opacity: number;
          if (drip > 0) opacity = 0.5 + 0.3 * shine;
          else if (depth <= 0) opacity = thin;
          else {
            const k = depth >= 5 ? 1 : depth / 5;
            opacity = thin + (0.96 - thin) * k * (2 - k);
          }
          if (drip <= 0 && fromBottom < 2.2) opacity *= 0.72 + (0.28 * fromBottom) / 2.2;
          if (opacity < 0.9) {
            const k = (0.9 - opacity) * 0.8;
            cr += (CLEAR[0] - cr) * k; cg += (CLEAR[1] - cg) * k; cb += (CLEAR[2] - cb) * k;
          }
          if (fromTop < 0.9) {
            const k = 1 - fromTop / 0.9;
            cr += (250 - cr) * k; cg += (252 - cg) * k; cb += (255 - cb) * k;
            opacity += (0.94 - opacity) * k;
          }
          a *= opacity * (solid < 1 ? 0.35 + 0.65 * solid : 1);
        } else a = 0;
      }

      let shadow = 0;
      if (a < 0.999 && coverS > 0.02 && y >= base) {
        const belowTip = y > BS ? y - BS : 0, belowLip = y > BS0 ? y - BS0 : 0;
        const soft = belowLip < shadowEnd ? 0.2 * Math.exp(-belowLip / shadowLen) * (1 - belowLip / shadowEnd) : 0;
        shadow = coverS * solidS * solidS * (0.26 * Math.exp(-belowTip / 1.6) + soft);
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
