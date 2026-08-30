import type { z } from "zod";
import type { VisualCategoryId } from "../../contracts/src/index.js";
import type { catalogBindingSchema } from "./contracts.js";

export interface ActiveVehicle {
  catalogReleaseId: string; visualFamilyId: string; fitmentId: string; variantId: string | null;
}

/** Family artwork never contributes an exact fitment. Resolve it from the active selection. */
export function resolveBoundCategory(
  visualFamilyId: string,
  binding: z.infer<typeof catalogBindingSchema> | undefined,
  category: VisualCategoryId,
  active: ActiveVehicle | null,
) {
  if (!binding || !active || active.visualFamilyId !== visualFamilyId || active.catalogReleaseId !== binding.catalogReleaseId) return null;
  if (!binding.coverage.some((entry) => entry.fitmentId === active.fitmentId && entry.variantId === active.variantId)) return null;
  const target = binding.categories.find((entry) => entry.visualCategoryId === category);
  if (!target || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(binding.familySlug)) return null;
  const params = new URLSearchParams({ fitment: active.fitmentId, source: "visual-transition" });
  return `/epc/vehicles/${binding.familySlug}/sections/${target.sectionSlug}?${params}`;
}
