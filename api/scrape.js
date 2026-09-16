export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { query, detailUrl } = req.query;

  // LAYER 2: Extract Direct Download Links from Single Movie Page
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

      // Step 1: Strip out Header, Footer, Sidebar, and Recommended sections from HTML
      html = html.replace(/<header[\s\S]*?<\/header>/gi, '');
      html = html.replace(/<footer[\s\S]*?<\/footer>/gi, '');
      html = html.replace(/<aside[\s\S]*?<\/aside>/gi, '');
      html = html.replace(/<div[^>]*class="[^"]*(sidebar|related|recommended|widgets|popular)[^"]*"[\s\S]*?<\/div>/gi, '');

      const downloadLinks = [];
      const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;

      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1].trim();
        let text = match[2].replace(/<[^>]+>/g, '').trim();

        // STRICT FILTER: If link is another MoviesMint movie post page (and NOT a /goto/ download link), REJECT IT!
        const isMoviesMintPost = (href.includes('moviesmint.app') || href.startsWith('/')) && !href.includes('/goto/');

        // Junk filter
        const isJunk =
          isMoviesMintPost ||
          href.includes('#') ||
          href.includes('/category/') ||
          href.includes('/tag/') ||
          href.includes('/page/') ||
          href.includes('/author/') ||
          href.endsWith('.jpg') ||
          href.endsWith('.png') ||
          href.endsWith('.webp') ||
          href.endsWith('.css') ||
          href.endsWith('.js') ||
          href.includes('facebook.com') ||
          href.includes('telegram') ||
          href.includes('t.me') ||
          href.includes('whatsapp') ||
          href.includes('twitter');

        // Check if it's a genuine link shortener or cloud drive URL
        const isGotoOrDriveLink =
          href.includes('/goto/') ||
          href.includes('/link/') ||
          href.includes('linkspoint') ||
          href.includes('gdflix') ||
          href.includes('filepress') ||
          href.includes('drive.google') ||
          href.includes('mega.nz') ||
          href.includes('pixeldrain') ||
          href.includes('hubcloud') ||
          href.includes('fastdl');

        const isDownloadText =
          text.toLowerCase().includes('download') ||
          text.toLowerCase().includes('480p') ||
          text.toLowerCase().includes('720p') ||
          text.toLowerCase().includes('1080p') ||
          text.toLowerCase().includes('4k') ||
          text.toLowerCase().includes('gdrive') ||
          text.toLowerCase().includes('direct link') ||
          text.toLowerCase().includes('zip');

        if (!isJunk && (isGotoOrDriveLink || isDownloadText)) {
          downloadLinks.push({
            name: text || 'Download Link',
            url: href
          });
        }
      }

      // Remove duplicates
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
