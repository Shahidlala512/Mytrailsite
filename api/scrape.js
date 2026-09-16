export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { query } = req.query;
  const targetUrl = `https://moviesmint.app/?s=${encodeURIComponent(query || 'Avatar')}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    if (!response.ok) {
      return res.status(200).json({ success: false, error: `Blocked by site (HTTP Status: ${response.status})` });
    }

    const html = await response.text();
    const movies = [];

    // Flexible regex for Movie Cards (matches <article> or <div class="item/post/movie">)
    const cardRegex = /<(article|div)[^>]*class="[^"]*(item|post|movie|entry|result|box)[^"]*"[\s\S]*?<\/\1>/gi;
    let matches = html.match(cardRegex) || [];

    // Fallback if theme uses standard links
    if (matches.length === 0) {
      matches = html.match(/<article[\s\S]*?<\/article>/gi) || [];
    }

    matches.slice(0, 15).forEach(block => {
      // Extract Link
      const linkMatch = block.match(/href="([^"]+)"/);
      // Extract Poster (supporting lazy-loading attributes: data-src, data-lazy-src, src)
      const imgMatch = block.match(/(?:data-src|data-lazy-src|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
      // Extract Title
      const titleMatch = block.match(/alt="([^"]+)"/) || block.match(/title="([^"]+)"/) || block.match(/<h[234][^>]*>(.*?)<\/h[234]>/);

      if (linkMatch && imgMatch) {
        let cleanTitle = 'Movie Item';
        if (titleMatch) {
          cleanTitle = (titleMatch[1] || titleMatch[0]).replace(/<[^>]+>/g, '').trim();
        }

        // Filter out duplicate or non-movie asset links
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
