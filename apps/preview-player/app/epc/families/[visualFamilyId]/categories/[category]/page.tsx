import { notFound, redirect } from 'next/navigation';
import { VISUAL_FAMILY_ID, getLegacyCategoryRoute, legacyCategoryRoutes, sectionHref } from '@/lib/epc-catalog';

type PageProps = {
  params: Promise<{ visualFamilyId: string; category: string }>;
  searchParams: Promise<{ focus?: string | string[] }>;
};

export function generateStaticParams() {
  return legacyCategoryRoutes.map((category) => ({ visualFamilyId: VISUAL_FAMILY_ID, category: category.slug }));
}

export default async function LegacyEpcCategoryRedirect({ params, searchParams }: PageProps) {
  const { visualFamilyId, category: slug } = await params;
  if (visualFamilyId !== VISUAL_FAMILY_ID) notFound();
  const category = getLegacyCategoryRoute(slug);
  if (!category) notFound();
  const query = await searchParams;
  const oldFocus = Array.isArray(query.focus) ? query.focus[0] : query.focus;
  redirect(sectionHref(category.sectionSlug, oldFocus ?? category.groupSlug));
}
