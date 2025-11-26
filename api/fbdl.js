export default async function handler(req, res) {
  const videoUrl = req.query.url;

  if (!videoUrl) {
    return res.status(400).json({ status: "error", message: "No URL Provided" });
  }

  try {
    // Browser-like headers so Facebook block na kore
    const fbHtml = await fetch(videoUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }).then((r) => r.text());

    // HD extracting
    const hdRegex = /"playable_url_quality_hd":"(.*?)"/;
    const sdRegex = /"playable_url":"(.*?)"/;

    const hdMatch = fbHtml.match(hdRegex);
    const sdMatch = fbHtml.match(sdRegex);

    const hd = hdMatch ? hdMatch[1].replace(/\\u0025/g, "%").replace(/\\/g, "") : null;
    const sd = sdMatch ? sdMatch[1].replace(/\\u0025/g, "%").replace(/\\/g, "") : null;

    if (!hd && !sd) {
      return res.status(400).json({
        status: "error",
        message: "Unable to extract video. Check URL privacy."
      });
    }

    return res.status(200).json({
      status: "success",
      hd,
      sd
    });

  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Server Error",
      error: err.message
    });
  }
}
