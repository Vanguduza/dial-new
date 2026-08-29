import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Database, ShieldCheck } from 'lucide-react';
import { EpcDiagramBrowser } from '@/components/epc/epc-diagram-browser';
import { EpcBreadcrumb, EpcPage, VehicleContextBar } from '@/components/epc/epc-shell';
import { EPC_VEHICLE_BASE, epcDiagrams, getEpcDiagram, getEpcGroup, getEpcSection, sectionHref, vehicleFamily } from '@/lib/epc-catalog';

type PageProps = {
  params: Promise<{ familySlug: string; diagramId: string }>;
  searchParams: Promise<{ position?: string | string[] }>;
};

export function generateStaticParams() {
  return epcDiagrams.map((diagram) => ({ familySlug: vehicleFamily.familySlug, diagramId: diagram.diagramId }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { diagramId } = await params;
  const diagram = getEpcDiagram(diagramId);
  return diagram
    ? { title: `${diagram.title} diagram · Toyota Hilux EPC | Dial Genuine Parts`, description: `Browse ${diagram.title} positions for the selected Toyota Hilux fitment.` }
    : { title: 'EPC diagram not found | Dial Genuine Parts' };
}

export default async function EpcDiagramPage({ params, searchParams }: PageProps) {
  const { familySlug, diagramId } = await params;
  if (familySlug !== vehicleFamily.familySlug) notFound();
  const diagram = getEpcDiagram(diagramId);
  if (!diagram) notFound();
  const section = getEpcSection(diagram.sectionSlug);
  const group = getEpcGroup(diagram.sectionSlug, diagram.groupSlug);
  if (!section || !group) notFound();
  const query = await searchParams;
  const initialPosition = Array.isArray(query.position) ? query.position[0] : query.position;

  return (
    <EpcPage>
      <div className="mx-auto max-w-[1500px] px-4 pb-14 sm:px-8">
        <div className="py-5">
          <EpcBreadcrumb items={[
            { label: 'Vehicle visual', href: '/' },
            { label: 'EPC catalog', href: EPC_VEHICLE_BASE },
            { label: section.title, href: sectionHref(section.slug) },
            { label: group.title, href: sectionHref(section.slug, group.slug) },
            { label: diagram.title },
          ]} />
        </div>
        <VehicleContextBar />

        <section className="py-8">
          <Link href={sectionHref(section.slug, group.slug)} className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-white/42 transition hover:text-white"><ArrowLeft className="size-3" /> Back to {group.title}</Link>
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div><p className="font-mono text-[9px] text-[#ff8a5b]">{diagram.diagramId}</p><h1 className="mt-2 text-3xl font-semibold uppercase tracking-[-.035em] text-white sm:text-4xl">{diagram.title}</h1><p className="mt-3 text-sm text-white/45">{diagram.applicability}</p></div>
            <div className="flex flex-wrap gap-2 text-[9px]"><span className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-300/20 bg-emerald-300/[.055] px-2.5 py-2 text-emerald-200"><ShieldCheck className="size-3" /> Scoped internal diagram ID</span><span className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 px-2.5 py-2 font-mono text-white/35"><Database className="size-3" /> {vehicleFamily.catalogReleaseId}</span></div>
          </div>
        </section>

        <EpcDiagramBrowser diagram={diagram} initialPosition={initialPosition} />

        <aside className="mt-4 rounded-md border border-white/8 bg-[#081018] p-4 text-[10px] leading-5 text-white/38">
          The development fixture intentionally leaves PNC and OEM numbers blank. The catalog injection pipeline must populate them from verified, scoped diagram records; the UI will not invent technical identifiers.
        </aside>
      </div>
    </EpcPage>
  );
}
