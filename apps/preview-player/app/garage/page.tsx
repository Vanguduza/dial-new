import Link from 'next/link';
import { ArrowRight, CarFront, CheckCircle2, Search, ShieldCheck, Warehouse, Wrench } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { EPC_VEHICLE_BASE, FITMENT_ID, vehicleFamily } from '@/lib/epc-catalog';

export default function GaragePage() {
  const epcHref = `${EPC_VEHICLE_BASE}?fitment=${encodeURIComponent(FITMENT_ID)}`;
  return (
    <main className="min-h-dvh bg-[#05090d] text-white">
      <header className="border-b border-white/10 bg-[#070c11]">
        <div className="mx-auto flex h-[68px] max-w-[1450px] items-center gap-4 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Dial genuine parts home">
            <span className="grid size-9 place-items-center rounded-sm bg-[#ff6b35] text-sm font-black text-[#160b07]">D</span>
            <span><span className="block text-sm font-black uppercase tracking-[.18em]">Dial</span><span className="block text-[9px] uppercase tracking-[.2em] text-white/45">Genuine parts</span></span>
          </Link>
          <nav className="ml-auto flex items-center gap-5 text-xs text-white/65">
            <Link href="/" className="hover:text-white">Find parts</Link>
            <Link href="/epc" className="hover:text-white">Browse EPC</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 sm:py-16">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#ff7a45]"><Warehouse className="size-4" /> My Garage</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-.045em] sm:text-6xl">Your vehicles, ready when you are.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-white/50">Use the visual journey when you want help recognising a system, or open the selected variant’s EPC categories immediately.</p>

        <article className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-[#0a121b] shadow-2xl">
          <div className="grid gap-0 lg:grid-cols-[1fr_.75fr]">
            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span className="grid size-12 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/[.06]"><CarFront className="size-6 text-emerald-300" /></span>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-emerald-300">Primary vehicle</p>
                    <h2 className="mt-1 text-2xl font-semibold">{vehicleFamily.make} {vehicleFamily.model}</h2>
                    <p className="mt-1 text-sm text-white/45">{vehicleFamily.generation} · {vehicleFamily.bodyStyle} · {vehicleFamily.visualPhase}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[.06] px-3 py-1.5 text-[10px] text-emerald-200"><CheckCircle2 className="size-3.5" /> Development flow complete</span>
              </div>

              <dl className="mt-7 grid gap-3 text-xs sm:grid-cols-3">
                <div className="rounded-lg border border-white/8 bg-white/[.025] p-3"><dt className="text-white/35">Chassis</dt><dd className="mt-1 font-semibold">GUN125 / GUN126</dd></div>
                <div className="rounded-lg border border-white/8 bg-white/[.025] p-3"><dt className="text-white/35">Engine</dt><dd className="mt-1 font-semibold">2GD-FTV</dd></div>
                <div className="rounded-lg border border-white/8 bg-white/[.025] p-3"><dt className="text-white/35">Market</dt><dd className="mt-1 font-semibold">ZA · 4×4 · 6MT</dd></div>
              </dl>
            </div>

            <div className="border-t border-white/8 bg-[#081019] p-6 sm:p-8 lg:border-l lg:border-t-0">
              <h3 className="text-sm font-semibold">Choose how to continue</h3>
              <div className="mt-4 grid gap-3">
                <Link href="/?autostart=1&source=garage" className={buttonVariants({ size: 'lg', className: 'h-11 justify-between' })}><span className="inline-flex items-center gap-2"><Search className="size-4" /> Start visual parts journey</span><ArrowRight className="size-4" /></Link>
                <Link href={epcHref} className={buttonVariants({ size: 'lg', variant: 'outline', className: 'h-11 justify-between' })}><span className="inline-flex items-center gap-2"><Wrench className="size-4" /> Open EPC categories</span><ArrowRight className="size-4" /></Link>
              </div>
              <p className="mt-4 flex items-start gap-2 text-[10px] leading-5 text-white/35"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-300" /> Both paths retain the same selected fitment. The visual route never changes catalog truth.</p>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
