import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Toyota Hilux Parts | Dial Genuine Parts',
  description: 'Explore a Toyota Hilux from full vehicle to exploded systems, then browse the right exact-fitment parts category.',
  openGraph: {
    title: 'Know your Hilux. Find the right part.',
    description: 'An interactive Toyota Hilux systems and genuine-parts experience from Dial.',
    type: 'website',
    images: [{ url: '/og-real.png', width: 1200, height: 630, alt: 'White Toyota Hilux in a dark automotive studio' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Know your Hilux. Find the right part.',
    description: 'Explore a Toyota Hilux from full vehicle to exact-fitment systems.',
    images: ['/og-real.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
