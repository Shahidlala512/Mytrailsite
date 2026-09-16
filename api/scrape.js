export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { query } = req.query;
  
  // URL ya Keyword check
  let targetUrl = '';
  if (query && query.startsWith('http')) {
    targetUrl = query;
  } else {
    targetUrl = `https://moviesmint.app/?s=${encodeURIComponent(query || '1080p')}`;
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ 
        success: false, 
        error: `Target site ne block kiya (HTTP Status: ${response.status})` 
      });
    }

    const html = await response.text();
    const movies = [];
    const articleRegex = /<article[\s\S]*?<\/article>/g;
    const matches = html.match(articleRegex) || [];

    matches.slice(0, 10).forEach(article => {
      const titleMatch = article.match(/alt="([^"]+)"/) || article.match(/title="([^"]+)"/);
      const imageMatch = article.match(/src="([^"]+)"/);
      const linkMatch = article.match(/href="([^"]+)"/);

      if (titleMatch && imageMatch && linkMatch) {
        movies.push({
          title: titleMatch[1],
          poster: imageMatch[1],
          pageUrl: linkMatch[1]
        });
      }
    });

    return res.status(200).json({ success: true, count: movies.length, data: movies });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
