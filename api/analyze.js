// Fonction serverless Vercel.
// Elle reçoit l'image du navigateur, appelle Gemini avec la clé API
// stockée côté serveur (variable d'environnement GEMINI_API_KEY,
// jamais exposée au client), et renvoie un résultat déjà parsé.

const MODEL = "gemini-3.1-flash-lite";

const PROMPT = `Tu es un nutritionniste expert. Analyse cette photo d'assiette.
Identifie chaque aliment visible, estime son poids en grammes, ses calories,
et ses macronutriments (protéines, glucides, lipides en grammes).
Réponds UNIQUEMENT avec un JSON valide, sans texte autour, sans balises
markdown, au format exact suivant :
{
  "foods": [
    { "name": "string", "estimatedGrams": number, "calories": number, "protein": number, "carbs": number, "fat": number }
  ]
}`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Clé API Gemini absente côté serveur (variable GEMINI_API_KEY)." });
    return;
  }

  try {
    const { imageBase64, mimeType, refinementNote } = req.body || {};
    if (!imageBase64 || !mimeType) {
      res.status(400).json({ error: "Image manquante." });
      return;
    }

    const promptText = refinementNote ? `${PROMPT}\n\nPrécisions données par l'utilisateur à prendre en compte : ${refinementNote}` : PROMPT;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: promptText },
                { inline_data: { mime_type: mimeType, data: imageBase64 } }
              ]
            }
          ]
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      res.status(geminiRes.status).json({ error: `Erreur Gemini: ${errText}` });
      return;
    }

    const data = await geminiRes.json();
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      res.status(502).json({ error: "Réponse Gemini illisible.", raw: text });
      return;
    }

    const foods = (parsed.foods || []).map((f, i) => ({
      id: `${Date.now()}-${i}`,
      name: f.name,
      estimatedGrams: f.estimatedGrams || 0,
      calories: f.calories || 0,
      protein: f.protein || 0,
      carbs: f.carbs || 0,
      fat: f.fat || 0
    }));

    const totals = foods.reduce(
      (acc, f) => ({
        calories: acc.calories + f.calories,
        protein: acc.protein + f.protein,
        carbs: acc.carbs + f.carbs,
        fat: acc.fat + f.fat
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    res.status(200).json({ foods, totals });
  } catch (err) {
    res.status(500).json({ error: err.message || "Erreur serveur." });
  }
}
