export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { query, detailUrl } = req.query;

  // LAYER 2: Scrape Direct Download Links from Single Movie Page
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

      const html = await response.text();
      const downloadLinks = [];

      // Regex to find all download buttons / links on target detail page
      const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;

      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        const text = match[2].replace(/<[^>]+>/g, '').trim();

        // Filter out nav/junk links, keep download links & qualities
        if (
          href &&
          !href.includes('#') &&
          !href.includes('/category/') &&
          !href.includes('/tag/') &&
          !href.includes('/page/') &&
          !href.endsWith('.jpg') &&
          !href.endsWith('.png') &&
          !href.endsWith('.css') &&
          !href.endsWith('.js') &&
          (text.toLowerCase().includes('download') || 
           text.toLowerCase().includes('480p') || 
           text.toLowerCase().includes('720p') || 
           text.toLowerCase().includes('1080p') || 
           href.includes('/link/') || 
           href.includes('drive') || 
           href.includes('t.me'))
        ) {
          downloadLinks.push({
            name: text || 'Download Link',
            url: href
          });
        }
      }

      // Deduplicate links
      const uniqueLinks = [];
      const seen = new Set();
      for (const item of downloadLinks) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          uniqueLinks.push(item);
        }
      }

      return res.status(200).json({ success: true, links: uniqueLinks });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // LAYER 1: Scrape Movie Search/Catalog Page
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
