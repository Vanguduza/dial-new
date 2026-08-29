import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Layers3 } from 'lucide-react';
import { EpcBreadcrumb, EpcPage, VehicleContextBar } from '@/components/epc/epc-shell';
import { epcSections, sectionHref, vehicleFamily } from '@/lib/epc-catalog';

type PageProps = { params: Promise<{ familySlug: string }> };

export const metadata: Metadata = {
  title: 'Toyota Hilux EPC sections | Dial Genuine Parts',
  description: 'Browse the selected Toyota Hilux catalog by vehicle system and assembly group.',
};

export function generateStaticParams() {
  return [{ familySlug: vehicleFamily.familySlug }];
}

export default async function EpcVehiclePage({ params }: PageProps) {
  const { familySlug } = await params;
  if (familySlug !== vehicleFamily.familySlug) notFound();

  return (
    <EpcPage>
      <div className="mx-auto max-w-[1500px] px-4 pb-14 sm:px-8">
        <div className="py-5">
          <EpcBreadcrumb items={[{ label: 'Vehicle visual', href: '/' }, { label: 'EPC catalog' }, { label: `${vehicleFamily.make} ${vehicleFamily.model}` }]} />
        </div>
        <VehicleContextBar />
        <section className="pt-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#ff7a45]">Parts catalog</p>
              <h1 className="mt-2 text-3xl font-semibold uppercase tracking-[-.035em] text-white sm:text-4xl">Choose a vehicle system</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/48">The six catalog sections below follow the selected vehicle. Open a system, then choose an assembly group and diagram.</p>
            </div>
            <p className="font-mono text-[9px] text-white/28">{vehicleFamily.catalogReleaseId}</p>
          </div>

          <ul className="mt-7 grid list-none grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 p-0">
            {epcSections.map((section) => (
              <li key={section.slug}>
                <Link href={sectionHref(section.slug)} className="group flex h-full flex-col overflow-hidden rounded-md border border-white/10 bg-white/[.025] text-center transition hover:-translate-y-0.5 hover:border-[#ff6b35]/55 hover:bg-[#ff6b35]/[.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35]/60">
                  <span className="relative mx-auto mt-4 block aspect-square w-24 overflow-hidden rounded-sm bg-[#10161d]">
                    <Image src={section.thumbnailSrc} alt="" fill unoptimized sizes="96px" className="object-cover opacity-72 transition group-hover:opacity-100" />
                  </span>
                  <span className="flex flex-1 flex-col p-4">
                    <span className="text-sm font-semibold text-white">{section.title}</span>
                    <span className="mt-2 line-clamp-2 text-[10px] leading-4 text-white/38">{section.description}</span>
                    <span className="mt-auto flex items-center justify-center gap-1.5 pt-4 text-[9px] font-semibold uppercase tracking-[.12em] text-[#ff8a5b]">{section.groups.length} groups <ArrowRight className="size-3 transition group-hover:translate-x-0.5" /></span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-7 flex items-start gap-3 rounded-md border border-white/8 bg-[#081018] p-4 text-xs leading-5 text-white/43">
            <Layers3 className="mt-0.5 size-4 shrink-0 text-[#ff7a45]" />
            The visual car can bypass this hub and open the exact section and assembly family. This full section grid remains available for customers who prefer conventional EPC browsing.
          </div>
        </section>
      </div>
    </EpcPage>
  );
}
