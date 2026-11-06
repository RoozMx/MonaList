import { CFG } from '../config';
import type { Sample } from '../store';

function dist(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

export function predict(samples: Sample[], v: number[], maxDist: number) {
  if (!samples.length) return null;
  const nn = samples
    .map(s => ({ l: s.l, d: dist(s.v, v) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, CFG.K);
  if (nn[0].d > maxDist) return null;

  const votes: Record<string, number> = {};
  let total = 0;
  for (const x of nn) {
    const w = 1 / (x.d + 1e-3);
    votes[x.l] = (votes[x.l] || 0) + w;
    total += w;
  }
  const [label, w] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return { label, conf: w / total };
}