import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, CheckCircle2, ChevronRight } from 'lucide-react';
import { EpcBreadcrumb, EpcPage, VehicleContextBar } from '@/components/epc/epc-shell';
import {
  EPC_VEHICLE_BASE,
  diagramHref,
  epcSections,
  getComponentFamily,
  getEpcDiagram,
  getEpcGroup,
  getEpcSection,
  sectionHref,
  vehicleFamily,
} from '@/lib/epc-catalog';

type PageProps = {
  params: Promise<{ familySlug: string; sectionSlug: string }>;
  searchParams: Promise<{ group?: string | string[]; component?: string | string[] }>;
};

export function generateStaticParams() {
  return epcSections.map((section) => ({ familySlug: vehicleFamily.familySlug, sectionSlug: section.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sectionSlug } = await params;
  const section = getEpcSection(sectionSlug);
  return section
    ? { title: `${section.title} · Toyota Hilux EPC | Dial Genuine Parts`, description: section.description }
    : { title: 'EPC section not found | Dial Genuine Parts' };
}

export default async function EpcSectionPage({ params, searchParams }: PageProps) {
  const { familySlug, sectionSlug } = await params;
  if (familySlug !== vehicleFamily.familySlug) notFound();
  const section = getEpcSection(sectionSlug);
  if (!section) notFound();

  const query = await searchParams;
  const groupSlug = Array.isArray(query.group) ? query.group[0] : query.group;
  const componentFamilyId = Array.isArray(query.component) ? query.component[0] : query.component;
  const component = componentFamilyId ? getComponentFamily(componentFamilyId) : undefined;
  const requestedGroup = groupSlug ? getEpcGroup(section.slug, groupSlug) : undefined;
  const selectedGroup = requestedGroup ?? (component?.target.groupSlug ? getEpcGroup(section.slug, component.target.groupSlug) : undefined);
  const selectedDiagrams = selectedGroup?.diagramIds.map(getEpcDiagram).filter(Boolean) ?? [];

  return (
    <EpcPage>
      <div className="mx-auto max-w-[1500px] px-4 pb-14 sm:px-8">
        <div className="py-5">
          <EpcBreadcrumb items={[
            { label: 'Vehicle visual', href: '/' },
            { label: 'EPC catalog', href: EPC_VEHICLE_BASE },
            { label: `${vehicleFamily.make} ${vehicleFamily.model}`, href: EPC_VEHICLE_BASE },
            { label: section.title },
          ]} />
        </div>
        <VehicleContextBar />

        <section className="py-8">
          <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#ff7a45]">Vehicle section</p>
          <h1 className="mt-2 text-3xl font-semibold uppercase tracking-[-.035em] text-white sm:text-4xl">{section.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/48">{section.description}</p>
          {component && (
            <div className="mt-5 flex max-w-2xl items-start gap-3 rounded-md border border-[#ff6b35]/35 bg-[#ff6b35]/[.08] p-4">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#ff8a5b]" />
              <div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#ff8a5b]">Selected from the visual vehicle</p><p className="mt-1 text-sm font-semibold text-white">{component.label}</p><p className="mt-1 text-[10px] leading-4 text-white/42">Mapped to {selectedGroup?.title ?? section.title}. The complete section remains available below.</p></div>
            </div>
          )}
        </section>

        <nav className="flex gap-2 overflow-x-auto border-y border-white/8 py-3" aria-label="Vehicle systems">
          {epcSections.map((item) => (
            <Link key={item.slug} href={sectionHref(item.slug)} className={`shrink-0 rounded-sm border px-3 py-2 text-[10px] font-semibold transition ${item.slug === section.slug ? 'border-[#ff6b35]/65 bg-[#ff6b35]/12 text-white' : 'border-white/10 text-white/42 hover:border-white/22 hover:text-white'}`}>{item.title}</Link>
          ))}
        </nav>

        <section className="py-9">
          <div className="flex items-end justify-between gap-4"><div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-white/35">Megazip-style hierarchy</p><h2 className="mt-1 text-xl font-semibold uppercase tracking-[.02em] text-white">Assembly groups</h2></div><p className="text-[10px] text-white/30">{section.groups.length} groups</p></div>
          <ul className="mt-5 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-0">
            {section.groups.map((assemblyGroup) => {
              const active = assemblyGroup.slug === selectedGroup?.slug;
              return (
                <li key={assemblyGroup.groupId}>
                  <Link href={sectionHref(section.slug, assemblyGroup.slug, component?.componentFamilyId)} className={`group flex h-full gap-4 rounded-md border p-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35]/60 ${active ? 'border-[#ff6b35]/65 bg-[#ff6b35]/[.09]' : 'border-white/10 bg-white/[.025] hover:border-[#ff6b35]/38 hover:bg-[#ff6b35]/[.045]'}`}>
                    <span className={`grid size-10 shrink-0 place-items-center rounded-sm border font-mono text-[10px] ${active ? 'border-[#ff6b35]/55 bg-[#ff6b35]/15 text-[#ff9b74]' : 'border-white/10 bg-black/20 text-white/35'}`}>{String(section.groups.indexOf(assemblyGroup) + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{assemblyGroup.title}</span><span className="mt-1.5 block text-[10px] leading-4 text-white/38">{assemblyGroup.description}</span><span className="mt-3 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[.1em] text-[#ff8a5b]">View diagrams <ChevronRight className="size-3 transition group-hover:translate-x-0.5" /></span></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {selectedGroup && (
          <section className="border-t border-white/8 pt-9">
            <p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#ff7a45]">Selected group</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{selectedGroup.title}</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {selectedDiagrams.map((diagram) => diagram && (
                <Link key={diagram.diagramId} href={diagramHref(diagram.diagramId, component?.preferredPosition)} className="group overflow-hidden rounded-md border border-white/10 bg-[#0a1016] transition hover:-translate-y-0.5 hover:border-[#ff6b35]/55">
                  <span className="relative block aspect-[16/9] bg-[#070b10]"><Image src={diagram.imageSrc ?? '/actual-demo/line-art.avif'} alt="" fill unoptimized sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover opacity-75 transition group-hover:opacity-100" /></span>
                  <span className="block p-4"><span className="font-mono text-[9px] text-[#ff8a5b]">{diagram.diagramId}</span><span className="mt-1.5 block text-sm font-semibold text-white">{diagram.title}</span><span className="mt-2 block text-[10px] text-white/35">{diagram.parts.length} positions · {diagram.applicability}</span><span className="mt-4 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[.12em] text-emerald-300">Open diagram <ArrowRight className="size-3" /></span></span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </EpcPage>
  );
}
