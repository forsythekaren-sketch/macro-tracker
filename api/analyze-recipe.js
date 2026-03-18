module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY not set in environment" });

  try {
    // Try fetching with a realistic browser user agent
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      }
    });

    const html = await pageRes.text();
    const fetchStatus = pageRes.status;

    // Strip scripts, styles, tags
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 10000);

    if (text.length < 200) {
      return res.status(500).json({ error: "Page fetch returned too little content (status: " + fetchStatus + "). Site may be blocking requests." });
    }

    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + key,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: "You are a nutrition expert. Analyze this recipe text and estimate the total nutritional content for the ENTIRE recipe. Return ONLY raw JSON with no markdown or explanation, in exactly this format:\n{\"name\":\"Recipe name\",\"servings\":4,\"total\":{\"calories\":1200,\"protein\":80,\"carbs\":120,\"fat\":40,\"fiber\":15,\"sugar\":20}}\nAll values must be numbers. servings is your best estimate of how many the recipe makes.\n\nRecipe text:\n" + text
            }]
          }],
          generationConfig: { temperature: 0.1 }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return res.status(500).json({ error: "Gemini error " + geminiRes.status + ": " + errText.slice(0, 200) });
    }

    const geminiData = await geminiRes.json();
    const responseText = (geminiData.candidates || [])[0]?.content?.parts?.[0]?.text || "";

    if (!responseText) {
      return res.status(500).json({ error: "Empty Gemini response: " + JSON.stringify(geminiData).slice(0, 300) });
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: "No JSON in response: " + responseText.slice(0, 200) });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    res.status(200).json(parsed);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
