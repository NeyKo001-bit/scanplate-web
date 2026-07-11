// api/analyze.js — Analyse initiale d'une photo (équivalent GeminiVisionService.analyze)
// La clé GEMINI_API_KEY reste côté serveur, jamais exposée au navigateur.

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';

const JSON_FORMAT_INSTRUCTIONS = `Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown, exactement dans ce format :
{
  "foods": [
    {"name": "string", "estimatedGrams": number, "calories": number, "proteins": number, "carbs": number, "fats": number}
  ],
  "totalCalories": number,
  "totalProteins": number,
  "totalCarbs": number,
  "totalFats": number
}`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Méthode non autorisée');
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).send('GEMINI_API_KEY manquante côté serveur');
    return;
  }

  const { image } = req.body || {};
  if (!image) {
    res.status(400).send('Image manquante');
    return;
  }

  const prompt = `Tu es un assistant nutritionnel. Analyse cette photo de plat et identifie chaque aliment visible avec une estimation de son poids en grammes. Calcule ensuite les calories, protéines, glucides et lipides pour chaque aliment, puis les totaux.

${JSON_FORMAT_INSTRUCTIONS}`;

  try {
    const result = await callGemini(apiKey, prompt, image);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).send(err.message || 'Erreur analyse Gemini');
  }
};

async function callGemini(apiKey, prompt, base64Image) {
  const url = `${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: 'image/jpeg', data: base64Image } }
      ]
    }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erreur API Gemini (${response.status}) : ${text}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Réponse Gemini vide ou invalide.");

  const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Impossible de lire l'analyse renvoyée par l'IA.");
  }
  return parsed;
}

module.exports.callGemini = callGemini;
