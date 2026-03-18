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
    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + key,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: "You are a nutrition expert. I will give you a recipe URL. Using your knowledge of common recipes and ingredients, estimate the total nutritional content for the ENTIRE recipe at that URL. If you recognize the recipe from the URL or site name, use that. Otherwise make a reasonable estimate based on the recipe name in the URL.\n\nReturn ONLY raw JSON with no markdown or explanation, in exactly this format:\n{\"name\":\"Recipe name\",\"servings\":4,\"total\":{\"calories\":1200,\"protein\":80,\"carbs\":120,\"fat\":40,\"fiber\":15,\"sugar\":20}}\n\nAll values must be numbers. servings is your best estimate.\n\nRecipe URL: " + url
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
