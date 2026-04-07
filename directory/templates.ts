/**
 * DIRECTORY WEBSITE TEMPLATE
 * Next.js 14 App Router · Prisma · Meilisearch · Schema.org
 * 
 * Features:
 * - Programmatic listing pages with SEO-optimized metadata
 * - Category pages, compare pages, best-for pages
 * - Brand sponsor widget on every page
 * - Schema.org JSON-LD structured data
 * - Instant search via Meilisearch
 * - Auto-generated sitemap.xml
 * - IndexNow integration on new listings
 */

// ─────────────────────────────────────────────────────────
// prisma/schema.prisma
// ─────────────────────────────────────────────────────────
export const PRISMA_SCHEMA = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Listing {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  description String
  longDesc    String?
  category    String
  subcategory String?
  tags        String[]
  website     String?
  location    String?
  rating      Float?
  reviewCount Int      @default(0)
  highlights  String[]
  logo        String?
  screenshot  String?
  founded     String?
  pricing     String?
  verified    Boolean  @default(false)
  featured    Boolean  @default(false)
  sponsorClick Int     @default(0)
  views       Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([category])
  @@index([slug])
  @@index([tags])
}

model Category {
  id          String @id @default(cuid())
  slug        String @unique
  name        String
  description String
  count       Int    @default(0)
  icon        String?
}
`;

// ─────────────────────────────────────────────────────────
// app/[category]/[slug]/page.tsx — Individual listing page
// ─────────────────────────────────────────────────────────
export const LISTING_PAGE = `
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { BrandSponsorWidget } from '@/components/BrandSponsorWidget';
import { ListingSchema } from '@/components/structured-data';
import { Metadata } from 'next';

export async function generateStaticParams() {
  const listings = await prisma.listing.findMany({ select: { category: true, slug: true } });
  return listings.map(l => ({ category: l.category.toLowerCase().replace(/ /g,'-'), slug: l.slug }));
}

export async function generateMetadata({ params }): Promise<Metadata> {
  const listing = await prisma.listing.findUnique({ where: { slug: params.slug } });
  if (!listing) return {};
  return {
    title: \`\${listing.name} — \${listing.category} | Directory\`,
    description: listing.description,
    alternates: { canonical: \`/\${params.category}/\${params.slug}\` },
    openGraph: {
      title: listing.name,
      description: listing.description,
      images: listing.screenshot ? [listing.screenshot] : [],
    },
  };
}

export default async function ListingPage({ params }) {
  const listing = await prisma.listing.findUnique({ where: { slug: params.slug } });
  if (!listing) notFound();

  // Get related listings
  const related = await prisma.listing.findMany({
    where: { category: listing.category, NOT: { id: listing.id } },
    take: 4, orderBy: { rating: 'desc' }
  });

  // Track view
  await prisma.listing.update({ where: { id: listing.id }, data: { views: { increment: 1 } } });

  return (
    <>
      <ListingSchema listing={listing} />
      <div className="max-w-6xl mx-auto px-4 py-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main content */}
        <div className="lg:col-span-2">
          <nav className="text-sm text-gray-500 mb-6">
            <a href="/">Home</a> → <a href={\`/\${params.category}\`}>{listing.category}</a> → {listing.name}
          </nav>
          
          <div className="flex items-start gap-4 mb-6">
            {listing.logo && <img src={listing.logo} className="w-16 h-16 rounded-xl" alt={listing.name} />}
            <div>
              <h1 className="text-3xl font-bold">{listing.name}</h1>
              <p className="text-gray-600 mt-1">{listing.description}</p>
              {listing.rating && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-yellow-500">{'★'.repeat(Math.round(listing.rating))}</span>
                  <span className="text-sm text-gray-500">{listing.rating}/5 · {listing.reviewCount} reviews</span>
                </div>
              )}
            </div>
          </div>

          {listing.highlights.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <h2 className="font-semibold mb-3">Key Highlights</h2>
              <ul className="space-y-2">
                {listing.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {listing.longDesc && (
            <div className="prose max-w-none mb-8" dangerouslySetInnerHTML={{ __html: listing.longDesc }} />
          )}

          {/* Compare section for SEO */}
          {related.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-4">Compare with Similar</h2>
              <div className="grid grid-cols-2 gap-3">
                {related.slice(0,4).map(r => (
                  <a key={r.id} href={\`/compare/\${listing.slug}-vs-\${r.slug}\`}
                    className="border rounded-lg p-3 hover:border-blue-500 transition-colors text-sm">
                    {listing.name} vs {r.name} →
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {listing.website && (
            <a href={listing.website} target="_blank" rel="noopener noreferrer"
              className="block w-full bg-blue-600 text-white text-center py-3 rounded-xl font-semibold hover:bg-blue-700">
              Visit Website →
            </a>
          )}
          
          {/* BRAND SPONSOR WIDGET — appears on every listing */}
          <BrandSponsorWidget listing={listing} />

          <div className="border rounded-xl p-4 space-y-3 text-sm">
            <h3 className="font-semibold">Details</h3>
            {listing.location && <div><span className="text-gray-500">Location:</span> {listing.location}</div>}
            {listing.founded && <div><span className="text-gray-500">Founded:</span> {listing.founded}</div>}
            {listing.pricing && <div><span className="text-gray-500">Pricing:</span> {listing.pricing}</div>}
            <div><span className="text-gray-500">Tags:</span> {listing.tags.join(', ')}</div>
          </div>
        </div>
      </div>
    </>
  );
}
`;

// ─────────────────────────────────────────────────────────
// components/BrandSponsorWidget.tsx — appears on EVERY page
// This drives the referral traffic back to your brand
// ─────────────────────────────────────────────────────────
export const BRAND_SPONSOR_WIDGET = `
'use client';
import { useEffect } from 'react';

const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'Your Brand',
  url: process.env.NEXT_PUBLIC_BRAND_URL || 'https://yourbrand.com',
  logo: process.env.NEXT_PUBLIC_BRAND_LOGO || '',
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || 'The AI-powered platform for growing businesses',
  cta: process.env.NEXT_PUBLIC_BRAND_CTA || 'Try Free →',
};

export function BrandSponsorWidget({ listing }) {
  useEffect(() => {
    // Track sponsor widget impression
    fetch('/api/sponsor-impression', {
      method: 'POST',
      body: JSON.stringify({ listing_id: listing?.id, page: window.location.pathname }),
      headers: { 'Content-Type': 'application/json' }
    }).catch(() => {});
  }, []);

  const handleClick = () => {
    // Track click
    fetch('/api/sponsor-click', {
      method: 'POST',
      body: JSON.stringify({ listing_id: listing?.id }),
      headers: { 'Content-Type': 'application/json' }
    }).catch(() => {});
    window.open(BRAND.url + '?utm_source=directory&utm_medium=sponsor&utm_campaign=listing', '_blank');
  };

  return (
    <div className="border-2 border-blue-100 rounded-xl p-4 bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">Sponsored by</div>
      <div className="flex items-center gap-3 mb-3">
        {BRAND.logo && <img src={BRAND.logo} className="w-10 h-10 rounded-lg" alt={BRAND.name} />}
        <div>
          <div className="font-semibold text-sm">{BRAND.name}</div>
          <div className="text-xs text-gray-500">{BRAND.tagline}</div>
        </div>
      </div>
      <button onClick={handleClick}
        className="w-full bg-blue-600 text-white text-sm py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
        {BRAND.cta}
      </button>
    </div>
  );
}
`;

// ─────────────────────────────────────────────────────────
// app/api/indexnow/route.ts — Auto-ping IndexNow on new listings
// ─────────────────────────────────────────────────────────
export const INDEXNOW_ROUTE = `
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { urls } = await req.json();
  const domain = process.env.NEXT_PUBLIC_DOMAIN || 'yourdomain.com';
  const key = process.env.INDEXNOW_KEY || '';

  const payload = {
    host: domain,
    key,
    keyLocation: \`https://\${domain}/\${key}.txt\`,
    urlList: urls.map(u => u.startsWith('http') ? u : \`https://\${domain}\${u}\`),
  };

  // Submit to Bing/ChatGPT (they share with all other IndexNow engines)
  const res = await fetch('https://www.bing.com/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });

  // Also submit to SpeedyIndex for Google acceleration
  if (process.env.SPEEDYINDEX_KEY) {
    await fetch('https://api.speedyindex.com/v1/submit', {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${process.env.SPEEDYINDEX_KEY}\`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ urls: payload.urlList }),
    }).catch(() => {});
  }

  return NextResponse.json({ status: res.status, submitted: urls.length });
}
`;

// ─────────────────────────────────────────────────────────
// app/sitemap.ts — Auto-generated sitemap for all listings
// ─────────────────────────────────────────────────────────
export const SITEMAP_ROUTE = `
import { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const domain = process.env.NEXT_PUBLIC_DOMAIN || 'yourdomain.com';
  const listings = await prisma.listing.findMany({
    select: { category: true, slug: true, updatedAt: true }
  });
  const categories = await prisma.category.findMany({ select: { slug: true } });

  const listingUrls = listings.map(l => ({
    url: \`https://\${domain}/\${l.category.toLowerCase().replace(/ /g,'-')}/\${l.slug}\`,
    lastModified: l.updatedAt,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const categoryUrls = categories.map(c => ({
    url: \`https://\${domain}/\${c.slug}\`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  // After generating, submit ALL new URLs to IndexNow
  const allUrls = [...listingUrls, ...categoryUrls].map(u => u.url);
  fetch(\`https://\${domain}/api/indexnow\`, {
    method: 'POST',
    body: JSON.stringify({ urls: allUrls.slice(0, 100) }),
    headers: { 'Content-Type': 'application/json' }
  }).catch(() => {});

  return [
    { url: \`https://\${domain}\`, lastModified: new Date(), priority: 1.0 },
    ...categoryUrls,
    ...listingUrls,
  ];
}
`;

// ─────────────────────────────────────────────────────────
// components/structured-data.tsx — Schema.org JSON-LD
// ─────────────────────────────────────────────────────────
export const SCHEMA_ORG = `
export function ListingSchema({ listing }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: listing.name,
    description: listing.description,
    url: listing.website,
    ...(listing.rating && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: listing.rating,
        reviewCount: listing.reviewCount,
      }
    }),
    ...(listing.location && { address: { '@type': 'PostalAddress', addressLocality: listing.location } }),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}

export function DirectorySchema({ name, description, url, count }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    description,
    url,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: \`\${url}/search?q={search_term_string}\` },
      'query-input': 'required name=search_term_string'
    }
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}
`;

// ─────────────────────────────────────────────────────────
// CLAUDE CODE COMMAND — builds the whole thing
// ─────────────────────────────────────────────────────────
export const CLAUDE_BUILD_COMMAND = `
AGENT: --dangerouslySkipPermissions

Build a complete Next.js 14 directory website using these templates.

Project: {NICHE}-directory
Niche: {NICHE}
Brand sponsor: {BRAND_NAME} ({BRAND_URL})

Steps:
1. npx create-next-app@latest {NICHE}-directory --typescript --tailwind --app
2. Install: prisma @prisma/client meilisearch @meilisearch/instant-meilisearch
3. Create prisma/schema.prisma from PRISMA_SCHEMA template
4. Create all page templates (listing, category, compare, sitemap)
5. Create BrandSponsorWidget component
6. Create IndexNow API route
7. Seed database with listing data from /tmp/listings.json
8. Configure Meilisearch index and sync all listings
9. npm run build
10. Deploy to Coolify via git push

After build: POST to /api/indexnow with all generated URLs
Track with: graphed.com + Google Search Console
`;
