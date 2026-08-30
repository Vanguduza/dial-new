'use client';
import { useState } from 'react';
import Link from 'next/link';
import { RasterJourney } from '@/components/raster-journey';

export default function RasterLab() {
  const [vehicle, setVehicle] = useState('hilux');
  return <main className="min-h-screen bg-[#05090d] px-5 py-8 text-white"><div className="mx-auto max-w-6xl">
    <Link href="/" className="text-sm text-white/60">Return to current website preview</Link>
    <h1 className="mt-7 text-3xl font-semibold">Hilux-style raster engine · development inspection</h1>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">Same photographic layer engine, different vehicle source. This page inspects motion and pixel ownership; it does not certify the artwork or change the production catalog.</p>
    <label className="my-6 block text-sm">Vehicle <select className="ml-3 min-h-11 rounded border border-white/20 bg-[#101820] px-4" value={vehicle} onChange={e => setVehicle(e.target.value)}><option value="hilux">Toyota Hilux · pickup</option><option value="acura">Acura CL · coupe</option></select></label>
    <RasterJourney key={vehicle} base={`/raster-packs/${vehicle}`} model={vehicle === 'hilux' ? 'Toyota Hilux' : 'Acura CL'} familyId={vehicle === 'hilux' ? 'VF-TOYOTA-HILUX-AN130-DC-FL' : 'VF-ACURA-CL'} />
  </div></main>;
}
