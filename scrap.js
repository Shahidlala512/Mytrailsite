// Vercel Serverless Function (Backend Scraper)
export default async function handler(req, res) {
  const { query } = req.query;
  const targetUrl = `https://moviesmint.app/?s=${encodeURIComponent(query || '1080p')}`;

  try {
    const response = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await response.text();

    // Basic Regex Parsing (Posters, Titles & Page Links)
    const movies = [];
    const articleRegex = /<article[\s\S]*?<\/article>/g;
    const matches = html.match(articleRegex) || [];

    matches.slice(0, 8).forEach(article => {
      const titleMatch = article.match(/alt="([^"]+)"/);
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

    res.status(200).json({ success: true, count: movies.length, data: movies });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Scraping Failed' });
  }
}
