'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { CheckCircle2, Info, RotateCcw, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { EpcDiagram } from '@/lib/epc-catalog';

export function EpcDiagramBrowser({
  diagram,
  initialPosition,
}: {
  diagram: EpcDiagram;
  initialPosition?: string | null;
}) {
  const [activePosition, setActivePosition] = useState<string | null>(initialPosition ?? null);
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(1);

  const visibleParts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return diagram.parts;
    return diagram.parts.filter((part) =>
      [part.position, part.title, part.partCode, part.oemPartNumber, part.pncCode, part.applicability]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [diagram.parts, query]);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
      <section className="overflow-hidden rounded-md border border-white/10 bg-[#0a0f14]" aria-label="Interactive EPC diagram">
        <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-white/8 bg-[#10171f] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/65">Diagram canvas</p>
          <span className="ml-auto text-[9px] text-white/32">{Math.round(zoom * 100)}%</span>
          <Button size="icon-xs" variant="ghost" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(.8, value - .2))}><ZoomOut /></Button>
          <Button size="icon-xs" variant="ghost" aria-label="Reset zoom" onClick={() => setZoom(1)}><RotateCcw /></Button>
          <Button size="icon-xs" variant="ghost" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(2, value + .2))}><ZoomIn /></Button>
        </div>
        {diagram.imageSrc ? (
          <div className="max-h-[620px] overflow-auto bg-[#070b10]">
            <div className="relative mx-auto aspect-[16/10] min-w-[640px] origin-center transition-transform duration-150" style={{ transform: `scale(${zoom})` }}>
              <Image src={diagram.imageSrc} alt={diagram.imageAlt} fill priority unoptimized sizes="(min-width: 1024px) 60vw, 100vw" className="object-contain" />
              {diagram.hotspots.map((hotspot) => {
                const active = hotspot.position === activePosition;
                return (
                  <button
                    key={hotspot.hotspotId}
                    type="button"
                    className={`absolute grid place-items-center border-2 text-[9px] font-bold transition ${active ? 'z-20 border-[#ffb191] bg-[#ff6b35]/55 text-white ring-2 ring-white/40' : 'z-10 border-[#ff6b35] bg-[#ff6b35]/18 text-white hover:bg-[#ff6b35]/38'}`}
                    style={{ left: `${hotspot.x * 100}%`, top: `${hotspot.y * 100}%`, width: `${hotspot.width * 100}%`, height: `${hotspot.height * 100}%` }}
                    aria-label={`Select diagram position ${hotspot.position}`}
                    onMouseEnter={() => setActivePosition(hotspot.position)}
                    onFocus={() => setActivePosition(hotspot.position)}
                    onClick={() => setActivePosition(hotspot.position)}
                  >
                    <span className="absolute left-0 top-0 min-w-6 bg-[#0b1118]/90 px-1 py-0.5 font-mono">{hotspot.position}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid min-h-[360px] place-items-center p-8 text-center">
            <div><Info className="mx-auto size-5 text-[#ff7a45]" /><p className="mt-3 text-sm font-semibold">Diagram image unavailable</p><p className="mt-1 text-xs text-white/40">The parts list remains available while the asset is injected.</p></div>
          </div>
        )}
        <div className="border-t border-white/8 px-3 py-2 text-[10px] text-white/38">
          Hover or tap a callout to highlight the matching row. Development diagram shown; production assets remain release-gated.
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-white/10 bg-[#0b1118]" aria-label="Diagram parts list">
        <div className="border-b border-white/8 bg-[#10171f] p-3">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/65">Parts list</p><p className="mt-0.5 text-[9px] text-white/32">{visibleParts.length} positions · OEM data pending enrichment</p></div>
            <span className="inline-flex items-center gap-1 text-[9px] text-emerald-300"><CheckCircle2 className="size-3" /> Diagram linked</span>
          </div>
          <label htmlFor="diagram-parts-filter" className="relative mt-3 block">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/30" />
            <Input id="diagram-parts-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter position or description" className="h-8 border-white/10 bg-black/20 pl-8 text-xs" />
          </label>
        </div>
        <div className="max-h-[620px] overflow-auto">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead className="sticky top-0 z-10 bg-[#121a22] text-[9px] uppercase tracking-[.08em] text-white/38">
              <tr><th className="px-3 py-2">Pos.</th><th className="px-3 py-2">Part</th><th className="px-3 py-2">PNC / OEM</th><th className="px-3 py-2 text-right">Qty.</th></tr>
            </thead>
            <tbody>
              {visibleParts.map((part) => {
                const active = part.position === activePosition;
                return (
                  <tr
                    key={part.position}
                    className={`cursor-pointer border-t border-white/[.06] transition ${active ? 'bg-[#ff6b35]/12' : 'hover:bg-white/[.035]'}`}
                    onMouseEnter={() => setActivePosition(part.position)}
                    onFocus={() => setActivePosition(part.position)}
                    onClick={() => setActivePosition(part.position)}
                    tabIndex={0}
                  >
                    <td className="px-3 py-3 align-top font-mono font-bold text-[#ff8a5b]">{part.position}</td>
                    <td className="px-3 py-3 align-top"><span className="block font-semibold text-white/88">{part.title}</span><span className="mt-1 block text-[9px] leading-4 text-white/35">{part.partCode} · {part.applicability}</span></td>
                    <td className="px-3 py-3 align-top font-mono text-[9px] text-white/38">{part.pncCode ?? 'PNC pending'}<br />{part.oemPartNumber ?? 'OEM pending'}</td>
                    <td className="px-3 py-3 text-right align-top text-white/55">{part.quantity ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleParts.length === 0 && <p className="px-4 py-10 text-center text-xs text-white/38">No diagram positions match this filter.</p>}
        </div>
      </section>
    </div>
  );
}
