export const TEX = 256;

export function hash(n: number): number {
  n = (n + 0x9e3779b9) | 0;
  n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
  n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

export function hash2(x: number, y: number): number {
  return hash((Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0);
}

export function vnoise(x: number, seed: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = hash(i + seed), b = hash(i + 1 + seed);
  return (a + (b - a) * u) * 2 - 1;
}

export interface Bump {
  x: Float32Array;
  y: Float32Array;
}

export interface Facets {
  x: Float32Array;
  y: Float32Array;
  rand: Float32Array;
  edge: Float32Array;
}

let bump: Bump | undefined;
let facets: Facets | undefined;

// Slope of a tileable cloud pattern. Tilts the surface a little so snow looks clumpy.
export function bumpTexture(): Bump {
  if (bump) return bump;
  const field = new Float32Array(TEX * TEX);
  const octave = (cell: number, amp: number, seed: number): void => {
    const n = TEX / cell;
    for (let y = 0; y < TEX; y++) {
      const gy = y / cell, iy = Math.floor(gy), fy = gy - iy, uy = fy * fy * (3 - 2 * fy);
      const y0 = iy % n, y1 = (iy + 1) % n;
      for (let x = 0; x < TEX; x++) {
        const gx = x / cell, ix = Math.floor(gx), fx = gx - ix, ux = fx * fx * (3 - 2 * fx);
        const x0 = (ix % n) + seed, x1 = ((ix + 1) % n) + seed;
        const top = hash2(x0, y0) + (hash2(x1, y0) - hash2(x0, y0)) * ux;
        const bottom = hash2(x0, y1) + (hash2(x1, y1) - hash2(x0, y1)) * ux;
        field[y * TEX + x] += amp * (top + (bottom - top) * uy);
      }
    }
  };
  octave(32, 1, 1000);
  octave(16, 0.55, 2000);
  octave(8, 0.3, 3000);
  octave(4, 0.16, 4000);

  const x = new Float32Array(TEX * TEX), y = new Float32Array(TEX * TEX), mask = TEX - 1;
  for (let j = 0; j < TEX; j++) {
    for (let i = 0; i < TEX; i++) {
      const o = j * TEX + i;
      x[o] = field[j * TEX + ((i + 1) & mask)] - field[j * TEX + ((i - 1) & mask)];
      y[o] = field[((j + 1) & mask) * TEX + i] - field[((j - 1) & mask) * TEX + i];
    }
  }
  return (bump = { x, y });
}

// Tileable ice shards: per texel the shard's tilt, a random value and the distance to its border.
export function facetTexture(): Facets {
  if (facets) return facets;
  const cell = 8, grid = TEX / cell, total = grid * grid;
  const px = new Float32Array(total), py = new Float32Array(total);
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      px[j * grid + i] = (i + 0.15 + 0.7 * hash2(i + 11, j + 500)) * cell;
      py[j * grid + i] = (j + 0.15 + 0.7 * hash2(i + 77, j + 900)) * cell;
    }
  }
  const x = new Float32Array(TEX * TEX), y = new Float32Array(TEX * TEX);
  const rand = new Float32Array(TEX * TEX), edge = new Float32Array(TEX * TEX);
  for (let v = 0; v < TEX; v++) {
    for (let u = 0; u < TEX; u++) {
      const ci = Math.floor(u / cell), cj = Math.floor(v / cell);
      let nearest = 1e9, second = 1e9, id = 0;
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -1; di <= 1; di++) {
          const gi = ci + di, gj = cj + dj;
          const wi = (gi + grid) % grid, wj = (gj + grid) % grid, k = wj * grid + wi;
          const dx = u - (px[k] + (gi - wi) * cell);
          const dy = (v - (py[k] + (gj - wj) * cell)) * 0.6;
          const dist = dx * dx + dy * dy;
          if (dist < nearest) { second = nearest; nearest = dist; id = k; }
          else if (dist < second) second = dist;
        }
      }
      const o = v * TEX + u;
      x[o] = hash(id * 3 + 31) * 2 - 1;
      y[o] = hash(id * 3 + 53) * 2 - 1;
      rand[o] = hash(id * 3 + 97);
      edge[o] = Math.sqrt(second) - Math.sqrt(nearest);
    }
  }
  return (facets = { x, y, rand, edge });
}
