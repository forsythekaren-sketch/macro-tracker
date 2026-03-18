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

  const keyPreview = key.slice(0, 4) + "..." + key.slice(-4) + " (length: " + key.length + ")";

  try {
    let text = "";
    try {
      const pageRes = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; recipe-analyzer/1.0)" }
      });
      const html = await pageRes.text();
      text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 8000);
    } catch(e) {
      return res.status(500).json({ error: "Failed to fetch recipe page: " + e.message });
    }

    if (!text.trim()) {
      return res.status(500).json({ error: "Recipe page was empty" });
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
      return res.status(500).json({ error: "Gemini API error " + geminiRes.status + " (key: " + keyPreview + "): " + errText.slice(0, 200) });
    }

    const geminiData = await geminiRes.json();
    const responseText = geminiData.candidates && geminiData.candidates[0] && geminiData.candidates[0].content && geminiData.candidates[0].content.parts && geminiData.candidates[0].content.parts[0] && geminiData.candidates[0].content.parts[0].text || "";

    if (!responseText) {
      return res.status(500).json({ error: "Empty Gemini response: " + JSON.stringify(geminiData).slice(0, 300) });
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: "No JSON found in: " + responseText.slice(0, 200) });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    res.status(200).json(parsed);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
