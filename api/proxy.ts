export default async function handler(req: any, res: any) {
  const { path } = req.query;
  const rawPath = Array.isArray(path) ? path.join("/") : (path || "");

  // Reconstituer les paramètres d'URL (ex: range=1d&interval=2m)
  const fullUrlObj = new URL(req.url, "http://localhost");
  fullUrlObj.searchParams.delete("path");
  const queryStr = fullUrlObj.searchParams.toString();
  const targetUrl = `https://query1.finance.yahoo.com/${rawPath}${queryStr ? `?${queryStr}` : ""}`;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });

    const data = await upstreamRes.text();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, s-maxage=10, stale-while-revalidate=30");
    return res.status(upstreamRes.status).send(data);
  } catch (err: any) {
    return res.status(502).json({ error: "Échec de récupération Yahoo Finance", details: err?.message });
  }
}
