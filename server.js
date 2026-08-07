const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Common legal page paths to check directly, regardless of whether they're linked
const COMMON_LEGAL_PATHS = [
  '/privacy-policy', '/privacy', '/privacy-notice',
  '/terms-of-service', '/terms', '/terms-and-conditions', '/tos',
  '/refund-policy', '/refunds', '/return-policy', '/returns',
  '/cookie-policy', '/cookies',
  '/cancellation-policy', '/shipping-policy',
];

// Keywords used to identify legal-related links in nav/footer
const LEGAL_LINK_KEYWORDS = [
  'privacy', 'terms', 'refund', 'return', 'cookie', 'cancellation', 'shipping', 'disclaimer', 'legal'
];

async function extractPageText(page) {
  // Text from the main document
  const mainText = await page.evaluate(() => document.body.innerText).catch(() => '');

  // Text from any iframes on the page
  const frames = page.frames();
  const frameTexts = [];
  for (const frame of frames) {
    if (frame === page.mainFrame()) continue;
    try {
      const text = await frame.evaluate(() => document.body?.innerText || '');
      if (text) frameTexts.push(text);
    } catch {
      // Cross-origin iframes will throw — skip them silently
    }
  }

  return [mainText, ...frameTexts].join('\n');
}

async function findLegalLinks(page, baseUrl) {
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]')).map((a) => ({
      href: a.getAttribute('href') || '',
      text: (a.textContent || '').toLowerCase(),
    }));
  });

  const origin = new URL(baseUrl).origin;
  const matched = new Set();

  for (const link of links) {
    const hrefLower = link.href.toLowerCase();
    const isLegalMatch = LEGAL_LINK_KEYWORDS.some((kw) => hrefLower.includes(kw) || link.text.includes(kw));
    if (!isLegalMatch) continue;

    try {
      const resolved = new URL(link.href, baseUrl);
      if (resolved.origin === origin) {
        matched.add(resolved.href);
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return Array.from(matched);
}

async function findLegalLinks(page, baseUrl) {
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]')).map((a) => ({
      href: a.getAttribute('href') || '',
      text: (a.textContent || '').toLowerCase(),
    }));
  });

  const origin = new URL(baseUrl).origin;
  const matched = new Set();

  for (const link of links) {
    const hrefLower = link.href.toLowerCase();
    const isLegalMatch = LEGAL_LINK_KEYWORDS.some((kw) => hrefLower.includes(kw) || link.text.includes(kw));
    if (!isLegalMatch) continue;

    try {
      const resolved = new URL(link.href, baseUrl);
      if (resolved.origin === origin) {
        matched.add(resolved.href);
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return Array.from(matched);
}
async function findLegalUrlsFromSitemap(baseUrl) {
  const origin = new URL(baseUrl).origin;
  const sitemapUrls = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  const found = new Set();

  for (const sitemapUrl of sitemapUrls) {
    try {
      const response = await fetch(sitemapUrl, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;

      const xml = await response.text();
      const urlMatches = xml.match(/<loc>(.*?)<\/loc>/g) || [];

      for (const match of urlMatches) {
        const url = match.replace(/<\/?loc>/g, '').trim();
        const isLegalMatch = LEGAL_LINK_KEYWORDS.some((kw) => url.toLowerCase().includes(kw));
        if (isLegalMatch) found.add(url);
      }
    } catch {
      continue; // sitemap doesn't exist or timed out — not every site has one
    }
  }

  return Array.from(found);
}

app.post('/api/scan', async (req, res) => {
  const { targetUrl } = req.body;

  if (!targetUrl) return res.status(400).json({ error: "Missing URL" });

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // ─── 1. Load homepage, waiting for JS-rendered content ───
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 20000 }).catch(async () => {
      // Some sites never go fully idle (polling analytics, etc.) — fall back gracefully
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    });
    await page.waitForTimeout(1000); // small buffer for late-mounting JS content

    const homepageText = await extractPageText(page);
    const scannedUrls = [targetUrl];
    let combinedText = homepageText;

    // ─── 2. Find legal-related links on the homepage (nav/footer) ───
    const discoveredLinks = await findLegalLinks(page, targetUrl);

    // ─── 3. Build candidate URLs: discovered links + sitemap links + common legal paths ───
    const origin = new URL(targetUrl).origin;
    const sitemapLinks = await findLegalUrlsFromSitemap(targetUrl);
    const candidateUrls = new Set([...discoveredLinks, ...sitemapLinks]);
    for (const path of COMMON_LEGAL_PATHS) {
      candidateUrls.add(origin + path);
    }

    // ─── 4. Visit up to 8 candidate pages, collecting text from each ───
    const MAX_PAGES = 8;
    let visited = 0;
    for (const url of candidateUrls) {
      if (visited >= MAX_PAGES) break;
      if (scannedUrls.includes(url)) continue;

      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
        if (!response || response.status() >= 400) continue;

        await page.waitForTimeout(500);
        const pageText = await extractPageText(page);
        combinedText += '\n' + pageText;
        scannedUrls.push(url);
        visited++;
      } catch {
        // Page didn't exist or timed out — skip it silently
        continue;
      }
    }

    await browser.close();

    res.json({ success: true, text: combinedText, scannedUrls });

  } catch (error) {
    if (browser) await browser.close().catch(() => { });
    console.error(error);
    res.status(500).json({ success: false, error: 'Could not access this site automatically. If your legal pages require login or are otherwise hard to detect, use the "I already have this page" option in your results.' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Scraper microservice running on port ${PORT}`));