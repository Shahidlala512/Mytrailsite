export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { query, detailUrl } = req.query;

  // Helper function to automatically unwrap /goto/ links to final destination
  async function resolveUrl(url) {
    if (!url.includes('/goto/')) return url;
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        }
      });

      // If HTTP redirect happened, get destination URL
      if (response.url && response.url !== url && !response.url.includes('/goto/')) {
        return response.url;
      }

      // If HTML redirect/button page, extract target link
      const htmlText = await response.text();
      const targetMatch =
        htmlText.match(/href="([^"]*(?:linkspoint|gdflix|filepress|mega|gofile|drive)[^"]*)"/i) ||
        htmlText.match(/location\.href\s*=\s*['"]([^'"]+)['"]/i);

      if (targetMatch) {
        return targetMatch[1];
      }
    } catch (e) {
      // Fallback to original URL on error
    }
    return url;
  }

  // LAYER 2: Extract & Resolve Links from Single Movie Page
  if (detailUrl) {
    try {
      const response = await fetch(detailUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (!response.ok) {
        return res.status(200).json({ success: false, error: 'Could not fetch movie details' });
      }

      let html = await response.text();

      // Remove headers, footers, sidebars, related/recommended sections
      html = html.replace(/<header[\s\S]*?<\/header>/gi, '');
      html = html.replace(/<footer[\s\S]*?<\/footer>/gi, '');
      html = html.replace(/<aside[\s\S]*?<\/aside>/gi, '');
      html = html.replace(/<div[^>]*class="[^"]*(sidebar|related|recommended|widgets|popular)[^"]*"[\s\S]*?<\/div>/gi, '');

      const rawLinks = [];
      const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;

      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1].trim();
        let text = match[2].replace(/<[^>]+>/g, '').trim();

        const isMoviesMintPost = (href.includes('moviesmint.app') || href.startsWith('/')) && !href.includes('/goto/');

        const isJunk =
          isMoviesMintPost ||
          href.includes('#') ||
          href.includes('/category/') ||
          href.includes('/tag/') ||
          href.includes('/page/') ||
          href.endsWith('.jpg') ||
          href.endsWith('.png') ||
          href.endsWith('.css') ||
          href.endsWith('.js') ||
          href.includes('facebook.com') ||
          href.includes('telegram');

        const isGotoOrDriveLink =
          href.includes('/goto/') ||
          href.includes('/link/') ||
          href.includes('linkspoint') ||
          href.includes('gdflix') ||
          href.includes('filepress') ||
          href.includes('drive.google') ||
          href.includes('mega.nz');

        const isDownloadText =
          text.toLowerCase().includes('download') ||
          text.toLowerCase().includes('480p') ||
          text.toLowerCase().includes('720p') ||
          text.toLowerCase().includes('1080p') ||
          text.toLowerCase().includes('4k') ||
          text.toLowerCase().includes('gdrive') ||
          text.toLowerCase().includes('direct');

        if (!isJunk && (isGotoOrDriveLink || isDownloadText)) {
          let fullHref = href;
          if (href.startsWith('/')) {
            fullHref = `https://moviesmint.app${href}`;
          }
          rawLinks.push({ name: text || 'Download Link', url: fullHref });
        }
      }

      // Deduplicate
      const uniqueRaw = [];
      const seen = new Set();
      for (const item of rawLinks) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          uniqueRaw.push(item);
        }
      }

      // Un-wrap all /goto/ links to their direct targets (linkspoint/gdflix) in parallel
      const resolvedLinks = await Promise.all(
        uniqueRaw.map(async (item) => {
          const finalUrl = await resolveUrl(item.url);
          return {
            name: item.name,
            url: finalUrl
          };
        })
      );

      return res.status(200).json({ success: true, links: resolvedLinks });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // LAYER 1: Search Catalog
  const targetUrl = `https://moviesmint.app/?s=${encodeURIComponent(query || 'Avatar')}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      return res.status(200).json({ success: false, error: `Blocked by site (Status: ${response.status})` });
    }

    const html = await response.text();
    const movies = [];

    const cardRegex = /<(article|div)[^>]*class="[^"]*(item|post|movie|entry|result|box)[^"]*"[\s\S]*?<\/\1>/gi;
    let matches = html.match(cardRegex) || [];

    if (matches.length === 0) {
      matches = html.match(/<article[\s\S]*?<\/article>/gi) || [];
    }

    matches.slice(0, 15).forEach(block => {
      const linkMatch = block.match(/href="([^"]+)"/);
      const imgMatch = block.match(/(?:data-src|data-lazy-src|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
      const titleMatch = block.match(/alt="([^"]+)"/) || block.match(/title="([^"]+)"/) || block.match(/<h[234][^>]*>(.*?)<\/h[234]>/);

      if (linkMatch && imgMatch) {
        let cleanTitle = 'Movie Item';
        if (titleMatch) {
          cleanTitle = (titleMatch[1] || titleMatch[0]).replace(/<[^>]+>/g, '').trim();
        }

        if (!linkMatch[1].includes('/category/') && !linkMatch[1].includes('/tag/')) {
          movies.push({
            title: cleanTitle,
            poster: imgMatch[1],
            pageUrl: linkMatch[1]
          });
        }
      }
    });

    return res.status(200).json({ success: true, count: movies.length, data: movies });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
