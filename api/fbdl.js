export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");

  const fbUrl = req.query.url;
  if (!fbUrl) {
    return res.status(400).json({ status: "error", message: "No URL provided" });
  }

  try {
    // AllOrigins proxy URL
    const proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(fbUrl);

    // Fetch FB page HTML via proxy
    const html = await fetch(proxyUrl).then(r => r.text());

    // Extract video URLs
    const hdMatch = html.match(/"playable_url_quality_hd":"(.*?)"/);
    const sdMatch = html.match(/"playable_url":"(.*?)"/);

    const hd = hdMatch ? hdMatch[1].replace(/\\u0025/g, "%").replace(/\\/g, "") : null;
    const sd = sdMatch ? sdMatch[1].replace(/\\u0025/g, "%").replace(/\\/g, "") : null;

    if (!hd && !sd) {
      return res.status(404).json({ status: "error", message: "No video URL found. Make sure video is public." });
    }

    return res.status(200).json({ status: "success", hd, sd });

  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ status: "error", message: "Server error", error: err.message });
  }
}
