export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");

  const url = req.query.url;
  if (!url) {
    return res.json({ status: "error", message: "No URL provided" });
  }

  try {
    const api = "https://iamtarek.ct.ws/fbdw.php?url=" + encodeURIComponent(url);
    const response = await fetch(api);
    const json = await response.json();
    return res.json(json);
  } catch (err) {
    return res.json({ status: "error", message: "Server error" });
  }
}

