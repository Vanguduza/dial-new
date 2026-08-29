import type { ReactNode } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronRight, Search, ShieldCheck } from 'lucide-react';
import { EPC_VEHICLE_BASE, vehicleFamily } from '@/lib/epc-catalog';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function EpcHeader() {
  return (
    <header className="border-b border-white/10 bg-[#070c11]/95">
      <div className="mx-auto flex h-[68px] max-w-[1500px] items-center gap-4 px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Dial genuine parts home">
          <span className="grid size-9 place-items-center rounded-sm bg-[#ff6b35] text-sm font-black tracking-[-.08em] text-[#160b07]">D</span>
          <span>
            <span className="block text-[15px] font-black uppercase tracking-[.18em]">Dial</span>
            <span className="block text-[9px] uppercase tracking-[.22em] text-muted-foreground">EPC catalogue</span>
          </span>
        </Link>
        <div className="ml-auto hidden items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[.06] px-3 py-1.5 text-[11px] text-emerald-100 md:flex">
          <CheckCircle2 className="size-3.5 text-emerald-300" />
          {vehicleFamily.model} · {vehicleFamily.generation} · {vehicleFamily.bodyStyle}
        </div>
        <Link
          href={`${EPC_VEHICLE_BASE}?fitment=${encodeURIComponent(vehicleFamily.fitmentId)}`}
          className="grid size-8 place-items-center rounded-md border border-white/10 text-white/55 transition hover:border-white/25 hover:text-white"
          aria-label="Browse all EPC sections"
        >
          <Search className="size-4" />
        </Link>
      </div>
    </header>
  );
}

export function EpcBreadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[.08em] text-white/38" aria-label="EPC breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
          {index > 0 && <ChevronRight className="size-3 text-white/20" />}
          {item.href ? <Link href={item.href} className="transition hover:text-white">{item.label}</Link> : <span className="text-white/78">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function VehicleContextBar() {
  return (
    <section className="grid gap-3 border-y border-white/8 bg-[#081018] px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-[.18em] text-[#ff7a45]">Selected vehicle</p>
        <p className="mt-1 truncate text-sm font-semibold text-white">
          {vehicleFamily.make} {vehicleFamily.model} · {vehicleFamily.generation} · {vehicleFamily.bodyStyle}
        </p>
        <p className="mt-1 text-[10px] text-white/38">
          {vehicleFamily.chassisCodes.join(' / ')} · {vehicleFamily.engineCodes.join(' / ')} · {vehicleFamily.market}
        </p>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-emerald-200">
        <ShieldCheck className="size-4 text-emerald-300" />
        Fitment context preserved
      </div>
    </section>
  );
}

export function EpcPage({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#05090d] text-foreground">
      <EpcHeader />
      {children}
      <footer className="border-t border-white/8 px-5 py-7 text-center text-[10px] leading-5 text-white/35 sm:px-8">
        Visual-family navigation helps you find the assembly. Exact part applicability remains controlled by the selected fitment.
      </footer>
    </main>
  );
}
