// src/app/robots.ts
// Blocks all search engine crawlers site-wide while in pre-launch.
// Next.js generates /robots.txt from this. NOTE: robots.txt only asks crawlers
// not to CRAWL; the noindex meta tag in layout.tsx is what prevents INDEXING.
// Both together = a reliable pre-launch block. REMOVE/RELAX this at launch.

import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
  };
}
