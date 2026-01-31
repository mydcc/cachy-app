export async function GET({ url }: { url: URL }) {
  const pages = ['academy', 'guide', 'whitepaper', 'changelog', 'privacy'];
  const langs = ['', 'de']; // '' for default/en

  const origin = url.origin;

  const urls = [];

  // App Root
  urls.push(`${origin}/`);

  for (const page of pages) {
    for (const lang of langs) {
      if (lang) {
        urls.push(`${origin}/${lang}/${page}`);
      } else {
        urls.push(`${origin}/${page}`);
      }
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<urlset
  xmlns="https://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="https://www.w3.org/1999/xhtml"
  xmlns:mobile="https://www.google.com/schemas/sitemap-mobile/1.0"
  xmlns:news="https://www.google.com/schemas/sitemap-news/0.9"
  xmlns:image="https://www.google.com/schemas/sitemap-image/1.1"
  xmlns:video="https://www.google.com/schemas/sitemap-video/1.1"
>
  ${urls.map(u => `
  <url>
    <loc>${u}</loc>
    <changefreq>daily</changefreq>
    <priority>${u === `${origin}/` ? '1.0' : '0.8'}</priority>
  </url>
  `).join('')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'max-age=0, s-maxage=3600',
    },
  });
}
