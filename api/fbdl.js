// api/fbdl.js
export default async function handler(req, res) {
  // Allow CORS for browser usage
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const url = req.query.url || req.url && new URL(req.url, `http://${req.headers.host}`).searchParams.get("url");
  if (!url) {
    return res.status(400).json({ status: "error", message: "No URL provided" });
  }

  // Basic validation - only allow http/https
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ status: "error", message: "Invalid URL" });
  }

  // timeout helper using AbortController
  const controller = new AbortController();
  const timeoutMs = 15000; // 15s
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Use a desktop user-agent to get richer HTML
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    };

    const fetchRes = await fetch(url, { headers, signal: controller.signal, redirect: "follow" });
    clearTimeout(timeout);

    if (!fetchRes.ok) {
      console.error("Remote fetch returned non-200:", fetchRes.status, fetchRes.statusText);
      return res.status(502).json({ status: "error", message: `Remote fetch failed: ${fetchRes.status}` });
    }

    const text = await fetchRes.text();

    // helper to unescape common JSON escapes
    const unescapeStr = s => s.replace(/\\u0025/g, "%").replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/\\"/g, '"');

    const urls = new Map();

    // 1) Try Open Graph tags: og:video, og:video:url, og:video:secure_url
    try {
      const ogRegex = /<meta[^>]+property=["']og:video(?::url|:secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
      let m;
      while ((m = ogRegex.exec(text)) !== null) {
        let found = m[1].trim();
        found = unescapeStr(found);
        if (found) urls.set(found, { quality: "unknown", source: "og:video" });
      }
    } catch (e) {
      // ignore
    }

    // 2) Try JSON-style playable URLs (playable_url, hd_playable_url, playable_url_quality_hd, etc.)
    // We'll look for common facebook keys in the HTML/JS blob
    const jsonPatternCandidates = [
      /"playable_url_quality_hd"\s*:\s*"([^"]+)"/gi,
      /"playable_url_quality_low"\s*:\s*"([^"]+)"/gi,
      /"playable_url"\s*:\s*"([^"]+)"/gi,
      /"playable_url_quality_*[^"]*"\s*:\s*"([^"]+)"/gi,
      /"hd_src_no_ratelimit"\s*:\s*"([^"]+)"/gi,
      /"sd_src_no_ratelimit"\s*:\s*"([^"]+)"/gi,
      /"hd_src"\s*:\s*"([^"]+)"/gi,
      /"sd_src"\s*:\s*"([^"]+)"/gi,
      /"playable_url_no_dash"\s*:\s*"([^"]+)"/gi,
      /"playable_url_quality_hd"\s*:\s*'([^']+)'/gi
    ];

    for (const pat of jsonPatternCandidates) {
      let m;
      while ((m = pat.exec(text)) !== null) {
        let u = m[1];
        if (!u) continue;
        u = unescapeStr(u);
        // remove escaping
        u = u.replace(/\\u0025/g, "%").replace(/\\/g, "");
        if (u && /^https?:\/\//i.test(u)) {
          // guess quality from pattern
          const q = /hd|HD/.test(m[0]) ? "hd" : /sd|low/i.test(m[0]) ? "sd" : "unknown";
          urls.set(u, { quality: q, source: "json-blob" });
        }
      }
    }

    // 3) Try meta name="twitter:player:stream" or property= "twitter:player:stream"
    try {
      const twRegex = /<meta[^>]+(?:name|property)=["'](?:twitter:player:stream|twitter:player:stream:source)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
      let m;
      while ((m = twRegex.exec(text)) !== null) {
        let u = m[1].trim();
        u = unescapeStr(u);
        if (u) urls.set(u, { quality: "unknown", source: "twitter:player:stream" });
      }
    } catch (e) {}

    // 4) Last resort: search for direct https links that look like facebook video CDN links
    const urlRegex = /(https?:\/\/video[-.\w\/_%=?&\[\]\-]+(?:\.mp4|drm|&dl=1|_nc_cat|fbcdn\.net|cdn\.instagram\.com)[^\s"'<>]*)/gi;
    let m2;
    while ((m2 = urlRegex.exec(text)) !== null) {
      let u = m2[1];
      u = u.replace(/\\\//g, "/");
      if (u && /^https?:\/\//i.test(u)) {
        urls.set(u, { quality: "unknown", source: "direct-link" });
      }
    }

    const result = Array.from(urls.entries()).map(([u, meta]) => ({
      url: u,
      quality: meta.quality || "unknown",
      source: meta.source || "extracted"
    }));

    if (result.length === 0) {
      console.error("No video URLs extracted. Save page for debugging.");
      // Optionally include a small snippet for debugging (not whole page)
      const snippet = text.slice(0, 2000);
      return res.status(404).json({ status: "error", message: "No video URL found (public videos only).", debugSnippet: snippet });
    }

    // Return success with list (unique)
    return res.json({ status: "success", data: result });
  } catch (err) {
    clearTimeout(timeout);
    console.error("Handler error:", err && err.message ? err.message : err);
    // For debugging you can return err.message, but keep minimal for production
    return res.status(500).json({ status: "error", message: "Server error", error: String(err && err.message ? err.message : err) });
  }
}
