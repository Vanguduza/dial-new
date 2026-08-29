'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  CarFront,
  CheckCircle2,
  ChevronRight,
  Warehouse,
  Menu,
  Pencil,
  Search,
  ShieldCheck,
  ShoppingBag,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  categoryBindings,
  categoryHref,
  sectionHref,
  targetHref,
  vehicleFamily,
  type EpcCategoryBinding,
  type VisualCategoryId,
} from '@/lib/epc-catalog';

const pack = '/packs/VF-TOYOTA-HILUX-AN130-DC-FL/v1';
const demo = '/actual-demo';

const sceneVisuals = {
  hero: `${demo}/hero.avif`,
  cgi: `${demo}/cgi.avif`,
  lineArt: `${demo}/line-art.avif`,
  exploded: `${demo}/exploded-single-wheel-v2.avif`,
} as const;

const categoryHitAreas: Array<{
  id: string;
  visualCategoryId: VisualCategoryId;
  clipPath: string;
  priority: number;
}> = [
  {
    id: 'body',
    visualCategoryId: 'VC-BODY',
    clipPath: 'polygon(6% 6%, 98% 6%, 98% 64%, 5% 64%)',
    priority: 0,
  },
  {
    id: 'rear-chassis-family',
    visualCategoryId: 'VC-RSUS',
    clipPath: 'polygon(3% 51%, 45% 49%, 48% 94%, 3% 95%)',
    priority: 10,
  },
  {
    id: 'front-chassis-family',
    visualCategoryId: 'VC-FSUS',
    clipPath: 'polygon(54% 54%, 98% 50%, 99% 95%, 52% 95%)',
    priority: 10,
  },
  {
    id: 'transmission',
    visualCategoryId: 'VC-TRN',
    clipPath: 'polygon(40% 50%, 65% 48%, 69% 84%, 39% 86%)',
    priority: 20,
  },
  {
    id: 'engine',
    visualCategoryId: 'VC-ENG',
    clipPath: 'polygon(62% 29%, 84% 29%, 85% 58%, 61% 59%)',
    priority: 30,
  },
];

const settledExplosionScale = 1.04;

const explosionVisualLayers: Array<{
  id: string;
  clipPath: string;
  fromX: number;
  fromY: number;
  fromScale: number;
  delay: number;
}> = [
  {
    id: 'roof-panel',
    clipPath: 'polygon(36% 7%, 69% 7%, 70% 18%, 35% 19%)',
    fromX: 3,
    fromY: 20,
    fromScale: 0.91,
    delay: 0.02,
  },
  {
    id: 'cargo-bed',
    clipPath: 'polygon(8% 25%, 37% 24%, 38% 56%, 8% 57%)',
    fromX: 14,
    fromY: 10,
    fromScale: 0.86,
    delay: 0.04,
  },
  {
    id: 'tail-lamps',
    clipPath: 'polygon(5% 33%, 11% 32%, 12% 51%, 4% 52%)',
    fromX: 17,
    fromY: 7,
    fromScale: 0.94,
    delay: 0.09,
  },
  {
    id: 'rear-bumper',
    clipPath: 'polygon(6% 46%, 25% 45%, 26% 59%, 5% 60%)',
    fromX: 15,
    fromY: 4,
    fromScale: 0.9,
    delay: 0.11,
  },
  {
    id: 'rear-door',
    clipPath: 'polygon(27% 19%, 43% 19%, 43% 59%, 26% 60%)',
    fromX: 12,
    fromY: 7,
    fromScale: 0.88,
    delay: 0.03,
  },
  {
    id: 'front-door',
    clipPath: 'polygon(38% 17%, 57% 18%, 58% 61%, 37% 62%)',
    fromX: 10,
    fromY: 6,
    fromScale: 0.88,
    delay: 0.01,
  },
  {
    id: 'cab-fender',
    clipPath: 'polygon(49% 16%, 71% 17%, 72% 63%, 49% 64%)',
    fromX: 8,
    fromY: 4,
    fromScale: 0.9,
    delay: 0.06,
  },
  {
    id: 'hood',
    clipPath: 'polygon(60% 20%, 92% 20%, 93% 39%, 59% 40%)',
    fromX: 4,
    fromY: 15,
    fromScale: 0.9,
    delay: 0.05,
  },
  {
    id: 'engine',
    clipPath: 'polygon(63% 31%, 83% 30%, 84% 61%, 62% 62%)',
    fromX: 5,
    fromY: 2,
    fromScale: 0.82,
    delay: 0.08,
  },
  {
    id: 'headlamps-grille',
    clipPath: 'polygon(76% 32%, 96% 31%, 97% 51%, 75% 52%)',
    fromX: 3,
    fromY: 8,
    fromScale: 0.92,
    delay: 0.1,
  },
  {
    id: 'front-bumper',
    clipPath: 'polygon(76% 43%, 99% 42%, 99% 66%, 75% 67%)',
    fromX: 4,
    fromY: 2,
    fromScale: 0.92,
    delay: 0.13,
  },
  {
    id: 'chassis',
    clipPath: 'polygon(19% 48%, 74% 47%, 76% 88%, 20% 91%)',
    fromX: 5,
    fromY: -9,
    fromScale: 0.78,
    delay: 0,
  },
  {
    id: 'rear-wheel-group',
    clipPath: 'polygon(4% 56%, 31% 55%, 33% 82%, 3% 84%)',
    fromX: 18,
    fromY: -6,
    fromScale: 0.84,
    delay: 0.07,
  },
  {
    id: 'front-wheel-group',
    clipPath: 'polygon(73% 56%, 98% 56%, 99% 91%, 72% 92%)',
    fromX: -13,
    fromY: -8,
    fromScale: 0.84,
    delay: 0.1,
  },
];

interface Point {
  x: number;
  y: number;
}
interface Hotspot {
  visualCategoryId: VisualCategoryId;
  label: string;
  polygon: Point[];
  labelAnchor: Point;
}
interface PublishedEpcMapping {
  fitmentId?: string;
  vehicleContext?: { familySlug?: string };
  categories: EpcCategoryBinding[];
}

const fallbackCategories: Array<Pick<Hotspot, 'visualCategoryId' | 'label'>> =
  categoryBindings.map((category) => ({
    visualCategoryId: category.visualCategoryId,
    label: category.label,
  }));

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const phase = (value: number, from: number, to: number) => {
  const normalized = clamp((value - from) / (to - from));
  return normalized * normalized * (3 - 2 * normalized);
};

const garageVehicle = {
  maker: 'toyota',
  model: 'hilux',
  generation: 'hilux-an110-an120-an130',
  specification: '2gd-6mt-4x4-double-cab',
} as const;

type VehicleSelection = {
  maker: string;
  model: string;
  generation: string;
  specification: string;
};

const completedFlowStorageKey = 'dial:completed-visual-flow:v1';
const vehicleFingerprint = (vehicle: VehicleSelection) =>
  [
    vehicle.maker,
    vehicle.model,
    vehicle.generation,
    vehicle.specification,
  ].join('|');

function readCompletedVehicle() {
  if (typeof window === 'undefined') return null;
  try {
    const saved = JSON.parse(
      window.sessionStorage.getItem(completedFlowStorageKey) ?? 'null',
    ) as { vehicleFingerprint?: string } | null;
    return saved?.vehicleFingerprint ?? null;
  } catch {
    return null;
  }
}

function rememberCompletedVehicle(vehicle: VehicleSelection) {
  window.sessionStorage.setItem(
    completedFlowStorageKey,
    JSON.stringify({
      vehicleFingerprint: vehicleFingerprint(vehicle),
      completedAt: new Date().toISOString(),
    }),
  );
}

function clearCompletedVehicle() {
  window.sessionStorage.removeItem(completedFlowStorageKey);
}

export function DvtgPreview() {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [routes, setRoutes] = useState<EpcCategoryBinding[]>([]);
  const [mappingContext, setMappingContext] = useState<{
    familySlug?: string;
    fitmentId?: string;
  }>({});
  const [selection, setSelection] = useState<VehicleSelection>({
    ...garageVehicle,
  });
  const [selectionCommitted, setSelectionCommitted] = useState(false);
  const [editingSelection, setEditingSelection] = useState(false);
  const autoStartHandled = useRef(false);

  const categories = hotspots.length ? hotspots : fallbackCategories;
  const effectiveRoutes = routes.length ? routes : categoryBindings;
  const getRouteHref = (visualCategoryId: VisualCategoryId) => {
    const route = effectiveRoutes.find(
      (item) => item.visualCategoryId === visualCategoryId,
    );
    return route
      ? targetHref(route.target, undefined, mappingContext)
      : categoryHref(visualCategoryId, undefined, mappingContext);
  };
  const getCategoryFamilyHref = (visualCategoryId: VisualCategoryId) => {
    const route = effectiveRoutes.find(
      (item) => item.visualCategoryId === visualCategoryId,
    );
    return route
      ? sectionHref(route.target.sectionSlug, null, null, mappingContext)
      : categoryHref(visualCategoryId, undefined, mappingContext);
  };
  const heroOpacity = 1 - phase(progress, 0.12, 0.29);
  const cgiOpacity =
    phase(progress, 0.12, 0.29) * (1 - phase(progress, 0.38, 0.55));
  const lineArtOpacity =
    phase(progress, 0.38, 0.55) * (1 - phase(progress, 0.62, 0.92));
  const explosionProgress = phase(progress, 0.6, 0.9);
  const explosionLayerOpacity =
    phase(progress, 0.6, 0.66) * (1 - phase(progress, 0.92, 0.99));
  const settledExplodedOpacity = phase(progress, 0.92, 0.99);

  useEffect(() => {
    Object.values(sceneVisuals).forEach((src) => {
      const image = new window.Image();
      image.src = src;
    });
    Promise.all([
      fetch(`${pack}/navigation/hotspots.json`).then(
        (response) => response.json() as Promise<{ hotspots: Hotspot[] }>,
      ),
      fetch(`${pack}/navigation/epc-mapping.json`).then(
        (response) => response.json() as Promise<PublishedEpcMapping>,
      ),
    ])
      .then(([hotspotData, epc]) => {
        setHotspots(hotspotData.hotspots);
        setRoutes(epc.categories);
        setMappingContext({
          familySlug: epc.vehicleContext?.familySlug,
          fitmentId: epc.fitmentId,
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = window.setInterval(() => {
      setProgress((value) => {
        if (value >= 1) {
          setPlaying(false);
          return 1;
        }
        return Math.min(1, value + 0.0045);
      });
    }, 33);
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion]);

  const rememberFlowCompletion = useCallback(() => {
    rememberCompletedVehicle(selection);
  }, [selection]);

  const startFlow = useCallback(() => {
    const alreadyCompleted =
      readCompletedVehicle() === vehicleFingerprint(selection);
    setSelectionCommitted(true);
    setEditingSelection(false);
    setProgress(alreadyCompleted || reducedMotion ? 1 : 0);
    setPlaying(!alreadyCompleted && !reducedMotion);
    if (reducedMotion && !alreadyCompleted) rememberCompletedVehicle(selection);
    window.setTimeout(
      () =>
        document.querySelector('#explore')?.scrollIntoView({
          behavior: reducedMotion ? 'auto' : 'smooth',
          block: 'start',
        }),
      40,
    );
  }, [reducedMotion, selection]);

  useEffect(() => {
    if (autoStartHandled.current) return;
    autoStartHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const completedVehicleMatches =
      readCompletedVehicle() === vehicleFingerprint(selection);
    const timer = window.setTimeout(() => {
      if (completedVehicleMatches) {
        setSelectionCommitted(true);
        setEditingSelection(false);
        setProgress(1);
        setPlaying(false);
      } else if (params.get('autostart') === '1') {
        startFlow();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selection, startFlow]);

  useEffect(() => {
    if (selectionCommitted && progress >= 1) rememberFlowCompletion();
  }, [progress, rememberFlowCompletion, selectionCommitted]);

  function submitVehicle(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !selection.maker ||
      !selection.model ||
      !selection.generation ||
      !selection.specification
    )
      return;
    startFlow();
  }

  function editPatch(patch: Partial<VehicleSelection>) {
    clearCompletedVehicle();
    setEditingSelection(true);
    setSelectionCommitted(false);
    setPlaying(false);
    setSelection((current) => ({ ...current, ...patch }));
  }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#05090d] text-foreground">
      <header className="relative z-50 border-b border-white/10 bg-[#070c11]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-[1600px] items-center gap-5 px-4 sm:px-7">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label="Dial genuine parts home"
          >
            <span className="grid size-9 place-items-center rounded-sm bg-[#ff6b35] text-sm font-black tracking-[-.08em] text-[#160b07]">
              D
            </span>
            <span>
              <span className="block text-[15px] font-black uppercase tracking-[.18em]">
                Dial
              </span>
              <span className="block text-[9px] uppercase tracking-[.22em] text-muted-foreground">
                Genuine parts
              </span>
            </span>
          </Link>
          <nav
            className="ml-8 hidden items-center gap-7 text-xs font-medium text-white/75 lg:flex"
            aria-label="Primary navigation"
          >
            <a href="#explore" className="transition hover:text-white">
              Find parts
            </a>
            <Link href="/garage" className="transition hover:text-white">
              My Garage
            </Link>
            <Link href="/epc" className="transition hover:text-white">
              Browse EPC
            </Link>
          </nav>
          <div className="ml-auto hidden items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[.06] px-3 py-1.5 text-[11px] text-emerald-100 md:flex">
            <CheckCircle2 className="size-3.5 text-emerald-300" /> Hilux ·
            AN120/AN130 · Double Cab
          </div>
          <Button variant="ghost" size="icon" aria-label="Search">
            <Search />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden sm:inline-flex"
            aria-label="Shopping bag"
          >
            <ShoppingBag />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open menu"
          >
            <Menu />
          </Button>
        </div>
      </header>

      <section
        className="border-b border-white/8 bg-[#081019]"
        aria-labelledby="vehicle-search-title"
      >
        <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-8 sm:py-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#ff7a45]">
                <Warehouse className="size-4" /> My Garage · primary vehicle
                loaded
              </div>
              <h1
                id="vehicle-search-title"
                className="mt-2 text-2xl font-semibold tracking-[-.035em] text-white sm:text-3xl"
              >
                Find parts for your vehicle
              </h1>
              <p className="mt-1 text-xs leading-5 text-white/45">
                Confirm the saved vehicle or edit the progressive selections.
                Search starts the visual journey automatically.
              </p>
            </div>
            <Link
              href="/garage"
              className="inline-flex items-center gap-2 text-xs font-semibold text-white/65 hover:text-white"
            >
              <Warehouse className="size-4" /> Manage My Garage
            </Link>
          </div>

          <form
            onSubmit={submitVehicle}
            className="mt-5 grid gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
            aria-label="Progressive vehicle selection"
          >
            <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-white/45">
              1 · Make
              <select
                value={selection.maker}
                onFocus={() => setEditingSelection(true)}
                onChange={(event) =>
                  editPatch({
                    maker: event.target.value,
                    model: '',
                    generation: '',
                    specification: '',
                  })
                }
                className={`h-11 rounded-md border border-white/12 bg-[#0c151f] px-3 text-sm outline-none transition focus:border-[#ff7a45] ${selectionCommitted && !editingSelection ? 'text-white/35' : 'text-white'}`}
              >
                <option value="toyota">Toyota</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-white/45">
              2 · Model
              <select
                value={selection.model}
                disabled={!selection.maker}
                onFocus={() => setEditingSelection(true)}
                onChange={(event) =>
                  editPatch({
                    model: event.target.value,
                    generation: '',
                    specification: '',
                  })
                }
                className={`h-11 rounded-md border border-white/12 bg-[#0c151f] px-3 text-sm outline-none transition focus:border-[#ff7a45] disabled:opacity-35 ${selectionCommitted && !editingSelection ? 'text-white/35' : 'text-white'}`}
              >
                <option value="hilux">Hilux</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-white/45">
              3 · Generation
              <select
                value={selection.generation}
                disabled={!selection.model}
                onFocus={() => setEditingSelection(true)}
                onChange={(event) =>
                  editPatch({
                    generation: event.target.value,
                    specification: '',
                  })
                }
                className={`h-11 rounded-md border border-white/12 bg-[#0c151f] px-3 text-sm outline-none transition focus:border-[#ff7a45] disabled:opacity-35 ${selectionCommitted && !editingSelection ? 'text-white/35' : 'text-white'}`}
              >
                <option value="hilux-an110-an120-an130">
                  AN120/AN130 · 2020 facelift
                </option>
              </select>
            </label>
            <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-white/45">
              4 · Variant / engine
              <select
                value={selection.specification}
                disabled={!selection.generation}
                onFocus={() => setEditingSelection(true)}
                onChange={(event) =>
                  editPatch({ specification: event.target.value })
                }
                className={`h-11 rounded-md border border-white/12 bg-[#0c151f] px-3 text-sm outline-none transition focus:border-[#ff7a45] disabled:opacity-35 ${selectionCommitted && !editingSelection ? 'text-white/35' : 'text-white'}`}
              >
                <option value="2gd-6mt-4x4-double-cab">
                  2GD-FTV · 6MT · 4×4 · Double Cab
                </option>
              </select>
            </label>
            <Button
              type="submit"
              size="lg"
              className="mt-auto h-11"
              disabled={
                !selection.specification || (playing && selectionCommitted)
              }
            >
              <Search />{' '}
              {playing && selectionCommitted ? 'Opening vehicle…' : 'Search'}
            </Button>
          </form>
          <div
            className="mt-3 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-2 text-[10px] leading-5 text-white/38"
            aria-live="polite"
          >
            <span className="inline-flex items-center gap-1.5">
              <CarFront className="size-3.5 text-emerald-300" /> Toyota Hilux is
              the current complete development flow pack.
            </span>
            {selectionCommitted && !editingSelection ? (
              <span className="inline-flex items-center gap-1.5 text-white/48">
                <Pencil className="size-3.5" /> Selection retained in the
                fields; focus any field to edit it.
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section
        id="explore"
        className="relative mx-auto max-w-[1600px] px-0 sm:px-4 lg:px-6"
      >
        <div
          className="hero-stage relative isolate min-h-[690px] touch-pan-y overflow-hidden border-x border-white/8 bg-[#070b10] sm:mt-4 sm:min-h-0 sm:rounded-2xl sm:border sm:aspect-[16/9]"
          aria-label="Interactive Hilux visual transformation"
        >
          <Image
            src={sceneVisuals.hero}
            alt="White Toyota Hilux double cab in a dark automotive studio"
            fill
            priority
            sizes="100vw"
            unoptimized
            className="absolute inset-0 size-full object-cover object-center"
            style={{ opacity: heroOpacity }}
          />
          <Image
            src={sceneVisuals.cgi}
            alt=""
            aria-hidden
            fill
            sizes="100vw"
            unoptimized
            className="absolute inset-0 size-full object-cover object-center"
            style={{ opacity: cgiOpacity }}
          />
          <Image
            src={sceneVisuals.lineArt}
            alt=""
            aria-hidden
            fill
            sizes="100vw"
            unoptimized
            className="absolute inset-0 size-full object-cover object-center"
            style={{ opacity: lineArtOpacity }}
          />
          {explosionVisualLayers.map((layer) => {
            const partProgress = phase(
              explosionProgress,
              layer.delay,
              Math.min(1, layer.delay + 0.78),
            );
            const remainingDistance = 1 - partProgress;
            const scale =
              layer.fromScale +
              (settledExplosionScale - layer.fromScale) * partProgress;
            return (
              <div
                key={layer.id}
                className="absolute inset-0"
                aria-hidden="true"
                style={{
                  clipPath: layer.clipPath,
                  opacity: explosionLayerOpacity,
                  mixBlendMode: 'screen',
                  transform: `translate3d(${layer.fromX * remainingDistance}%, ${layer.fromY * remainingDistance}%, 0) scale(${scale})`,
                  transformOrigin: '50% 50%',
                  willChange: 'transform, opacity',
                }}
              >
                <Image
                  src={sceneVisuals.exploded}
                  alt=""
                  fill
                  sizes="100vw"
                  unoptimized
                  className="size-full object-cover object-center"
                />
              </div>
            );
          })}
          <Image
            src={sceneVisuals.exploded}
            alt=""
            aria-hidden
            fill
            sizes="100vw"
            unoptimized
            className="absolute inset-0 size-full object-cover object-center"
            style={{
              opacity: settledExplodedOpacity,
              transform: `scale(${settledExplosionScale})`,
              transformOrigin: '50% 50%',
            }}
          />
          <div
            className="hero-grade absolute inset-0 z-[2]"
            aria-hidden="true"
          />

          <p
            className="pointer-events-none absolute left-1/2 top-5 z-40 w-max max-w-[calc(100%-2.5rem)] -translate-x-1/2 text-center text-[11px] font-medium tracking-[.02em] text-white/72 sm:top-7 sm:text-sm"
            style={{
              opacity: selectionCommitted ? phase(progress, 0.84, 0.95) : 0,
            }}
          >
            click on the category image to browse parts
          </p>

          <div className="pointer-events-none absolute bottom-5 left-5 z-40 max-w-[min(34rem,calc(100%-2.5rem))] sm:bottom-8 sm:left-8 lg:bottom-10 lg:left-10">
            <h1 className="text-[clamp(1.15rem,2.25vw,2.25rem)] font-semibold leading-[1.04] tracking-[-.04em] text-white">
              Know your {vehicleFamily.make} {vehicleFamily.model}{' '}
              {vehicleFamily.generation}.<br />
              Find the right part.
            </h1>
          </div>

          {selectionCommitted && progress >= 0.94 ? (
            <div
              className="absolute inset-0 z-30"
              aria-label="Exploded vehicle category map"
              style={{
                transform: `scale(${settledExplosionScale})`,
                transformOrigin: '50% 50%',
              }}
            >
              <Link
                href={getCategoryFamilyHref('VC-BODY')}
                onClick={rememberFlowCompletion}
                aria-label="Browse Body and exterior for the selected vehicle"
                className="absolute inset-[4%] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
              />
              {categoryHitAreas
                .filter((layer) => layer.visualCategoryId !== 'VC-BODY')
                .sort((a, b) => a.priority - b.priority)
                .map((layer) => (
                  <Link
                    key={`click-${layer.id}`}
                    href={getCategoryFamilyHref(layer.visualCategoryId)}
                    onClick={rememberFlowCompletion}
                    aria-label={`Browse ${effectiveRoutes.find((route) => route.visualCategoryId === layer.visualCategoryId)?.label ?? layer.visualCategoryId} for the selected vehicle`}
                    className="absolute inset-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
                    style={{ clipPath: layer.clipPath }}
                  />
                ))}
            </div>
          ) : null}
        </div>
      </section>

      <section
        id="systems"
        className="mx-auto grid max-w-[1500px] gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:py-24"
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.24em] text-[#ff7a45]">
            From recognition to resolution
          </p>
          <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">
            Start with the system, end with the exact part.
          </h2>
          <p className="mt-5 max-w-lg text-sm leading-6 text-white/55">
            The visual vehicle family makes navigation intuitive. The fitment
            engine keeps the catalogue precise for the vehicle you selected.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.slice(0, 6).map((category, index) => (
            <Link
              key={category.visualCategoryId}
              href={getRouteHref(category.visualCategoryId)}
              className="group flex items-center gap-4 rounded-xl border border-white/8 bg-white/[.025] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#ff7a45]/35 hover:bg-[#ff6b35]/[.06]"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/25 font-mono text-xs text-[#ff8a5b]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-white">
                  {category.label}
                </span>
                <span className="mt-1 block text-[10px] text-white/38">
                  Open exact-fitment diagrams
                </span>
              </span>
              <ChevronRight className="size-4 text-white/30 transition group-hover:translate-x-1 group-hover:text-[#ff7a45]" />
            </Link>
          ))}
        </div>
      </section>

      <section id="fitment" className="border-y border-white/8 bg-[#081018]">
        <div className="mx-auto grid max-w-[1500px] gap-6 px-5 py-10 sm:px-8 md:grid-cols-3">
          {[
            [
              'Vehicle locked',
              'Your chosen model stays visible while you browse.',
            ],
            [
              'VIN-aware fitment',
              'Exact applicability is checked separately from the visual.',
            ],
            [
              'Diagram-ready',
              'Each system can route into its verified parts diagram.',
            ],
          ].map(([title, copy], index) => (
            <div
              key={title}
              className="flex gap-4 rounded-xl border border-white/8 bg-white/[.02] p-5"
            >
              {index === 0 ? (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-300" />
              ) : index === 1 ? (
                <ShieldCheck className="size-5 shrink-0 text-emerald-300" />
              ) : (
                <Wrench className="size-5 shrink-0 text-emerald-300" />
              )}
              <div>
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-white/45">{copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1500px] flex-col gap-3 px-5 py-8 text-[10px] leading-5 text-white/36 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>
          Demo vehicle visual. Confirm every purchase against the selected
          vehicle and VIN.
        </p>
        <p>
          Source reference:{' '}
          <a
            className="text-white/60 underline decoration-white/20 underline-offset-4 hover:text-white"
            href="https://commons.wikimedia.org/wiki/File:Toyota_AN120-AN130_HiLux_Double_Cab.jpg"
            target="_blank"
            rel="noreferrer"
          >
            Wikimedia Commons · public domain
          </a>{' '}
          · studio and engineering treatments are AI-assisted.
        </p>
      </footer>
    </main>
  );
}
