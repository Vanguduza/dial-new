'use client';

import { useEffect, useRef, useState } from 'react';

type Part = { code: number; id: string; section: string; visualCategoryId: string };
type Manifest = { visualFamilyId: string; fps: number; frames: { file: string; progress: number }[]; navigation: string; states: { hero: string; exploded: string } };
type Navigation = { width: number; height: number; ownershipAsset: string; parts: Part[] };
const assetUrl = (base: string, file: string) => {
  if (!/^[a-zA-Z0-9_/-]+\.(webp|png|json)$/.test(file) || file.split('/').includes('..')) throw new Error('Invalid pack asset path');
  return `${base}/${file}`;
};
const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new window.Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Vehicle image unavailable')); image.src = url;
});

/** Diagnostic player for real frame packs. No polygons or vehicle artwork in code. */
export function RasterJourney({ base, model, familyId }: { base: string; model: string; familyId: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const owner = useRef<{ pixels: Uint8ClampedArray; nav: Navigation } | null>(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<Part | null>(null);
  const [categories, setCategories] = useState<Part[]>([]);
  useEffect(() => {
    let cancelled = false;
    const pending = new Map<number, Promise<HTMLImageElement>>();
    const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    owner.current = null; setState('loading'); setError(''); setSelection(null);
    const run = async () => {
      const fetchJson = async (file: string) => { const r = await fetch(assetUrl(base, file)); if (!r.ok) throw new Error('Vehicle pack unavailable'); return r.json(); };
      const pack = await fetchJson('manifest.json') as Manifest;
      if (pack.visualFamilyId !== familyId || !Array.isArray(pack.frames) || pack.frames.length < 48 || pack.frames.length > 512 || pack.frames[0].progress !== 0 || pack.frames.at(-1)?.progress !== 1 || pack.frames.some((f, i) => !Number.isFinite(f.progress) || (i > 0 && f.progress <= pack.frames[i - 1].progress))) throw new Error('Vehicle pack does not match this selection');
      const nav = await fetchJson(pack.navigation) as Navigation;
      if (!(nav.width > 0 && nav.height > 0 && nav.width <= 1920 && nav.height <= 1080) || !Array.isArray(nav.parts)) throw new Error('Invalid navigation geometry');
      const ownerImage = await loadImage(assetUrl(base, nav.ownershipAsset));
      if (cancelled) return;
      const offscreen = document.createElement('canvas'); offscreen.width = nav.width; offscreen.height = nav.height;
      if (ownerImage.naturalWidth !== nav.width || ownerImage.naturalHeight !== nav.height) throw new Error('Click map dimensions differ from artwork');
      const ctx = offscreen.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(ownerImage, 0, 0);
      owner.current = { pixels: ctx.getImageData(0, 0, nav.width, nav.height).data, nav };
      setCategories([...new Map(nav.parts.map(part => [part.visualCategoryId, part])).values()]);
      const destination = canvas.current!; destination.width = nav.width; destination.height = nav.height;
      const draw = (image: HTMLImageElement) => {
        if (image.naturalWidth !== nav.width || image.naturalHeight !== nav.height) throw new Error('Frame dimensions changed');
        destination.getContext('2d')!.drawImage(image, 0, 0);
      };
      const completedKey = `dial:raster-lab:${familyId}:${base}`; // Lab only; not a customer completion fingerprint.
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced || sessionStorage.getItem(completedKey) === 'complete') {
        const image = await loadImage(assetUrl(base, pack.states.exploded));
        if (!cancelled) { draw(image); setState('complete'); } return;
      }
      const frame = (index: number) => {
        if (!pending.has(index)) pending.set(index, loadImage(assetUrl(base, pack.frames[index].file)));
        return pending.get(index)!;
      };
      // Bounded decoded-image window: do not load hundreds of full-resolution
      // bitmaps into mobile memory. Never skip a missing frame to catch up.
      for (let i = 0; i < pack.frames.length && !cancelled; i++) {
        for (let j = i; j < Math.min(i + 4, pack.frames.length); j++) void frame(j).catch(() => {});
        const image = await frame(i);
        if (cancelled) return;
        draw(image); setState(i === pack.frames.length - 1 ? 'complete' : 'playing');
        pending.delete(i);
        const next = pack.frames[i + 1];
        if (next) await sleep(Math.max(16, (next.progress - pack.frames[i].progress) * 5000));
        image.src = '';
      }
      if (!cancelled) sessionStorage.setItem(completedKey, 'complete');
    };
    void run().catch(e => { if (!cancelled) { setError(e instanceof Error ? e.message : 'Preview unavailable'); setState('failed'); owner.current = null; } });
    return () => { cancelled = true; for (const promise of pending.values()) void promise.then(image => { image.src = ''; }, () => {}); pending.clear(); };
  }, [base, familyId]);

  function pick(clientX: number, clientY: number) {
    if (state !== 'complete' || !canvas.current || !owner.current) return;
    const rect = canvas.current.getBoundingClientRect(), { nav, pixels } = owner.current;
    // Canvas itself has the artwork aspect ratio. Its bounding box IS the
    // shared contain transform; no independently cropped hotspot overlay.
    const x = (clientX - rect.left) * nav.width / rect.width, y = (clientY - rect.top) * nav.height / rect.height;
    const at = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < nav.width && yy < nav.height ? pixels[(yy * nav.width + xx) * 4] : 0;
    let code = at(Math.floor(x), Math.floor(y));
    if (!code) {
      let best = 22 ** 2;
      const radius = Math.ceil(22 * nav.width / rect.width);
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const next = at(Math.floor(x) + dx, Math.floor(y) + dy), distance = (dx * rect.width / nav.width) ** 2 + (dy * rect.height / nav.height) ** 2;
        if (next && distance < best) { best = distance; code = next; }
      }
    }
    setSelection(nav.parts.find(part => part.code === code) ?? null);
  }
  return <>
    <div role="region" aria-label={`Interactive ${model} visual transformation`} data-flow-state={state} className="relative flex min-h-[420px] items-center overflow-hidden rounded-2xl border border-white/10 bg-[#080b0e]">
      <canvas ref={canvas} aria-hidden="true" className="block h-auto w-full cursor-pointer" onClick={e => pick(e.clientX, e.clientY)} />
      <p className="pointer-events-none absolute left-0 right-0 top-3 text-center text-xs text-white/70">click on the category image to browse parts</p>
      <p className="pointer-events-none absolute bottom-5 left-5 max-w-[50%] text-base text-white">{`Know your ${model}. Find the right part.`}</p>
    </div>
    {error && <p role="alert" className="mt-4 text-amber-200">{error}</p>}
    <ul aria-label="Vehicle categories" className="mt-5 flex flex-wrap gap-2">{categories.map(part => <li key={part.visualCategoryId}><button className="min-h-11 rounded-lg border border-white/15 px-4 text-sm" onClick={() => setSelection(part)}>{part.visualCategoryId.replace('VC-', '')}</button></li>)}</ul>
    <p className="mt-4 text-sm text-white/60" aria-live="polite">{selection ? `Selected ${selection.id} → ${selection.section}. Exact catalog routing is pending catalog injection for this diagnostic pack.` : 'Development inspection only. These candidates are not approved for customer display.'}</p>
  </>;
}
