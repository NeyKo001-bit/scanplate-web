// api/refine.js — Ré-analyse avec précisions utilisateur (équivalent GeminiVisionService.refine)

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

  const { image, previousResult, fatType, hiddenSauce, adjustedGrams } = req.body || {};
  if (!image || !previousResult) {
    res.status(400).send('Paramètres manquants');
    return;
  }

  const extraInfoLines = [];
  if (fatType) extraInfoLines.push(`- Matière grasse utilisée : ${fatType}`);
  if (hiddenSauce) extraInfoLines.push(`- Sauce ou assaisonnement signalé : ${hiddenSauce}`);

  (previousResult.foods || []).forEach((food, i) => {
    const corrected = adjustedGrams ? adjustedGrams[i] : undefined;
    if (corrected != null && Math.abs(corrected - food.estimatedGrams) > 0.5) {
      extraInfoLines.push(`- "${food.name}" : poids réel ${Math.round(corrected)} g (estimation initiale : ${Math.round(food.estimatedGrams)} g)`);
    }
  });

  const extraInfo = extraInfoLines.length ? extraInfoLines.join('\n') : 'Aucune précision supplémentaire fournie.';

  const prompt = `Tu es un assistant nutritionnel. Tu as déjà analysé une première fois cette photo de plat, avec ce résultat :
${JSON.stringify(previousResult)}

L'utilisateur a maintenant fourni des précisions supplémentaires :
${extraInfo}

Recalcule une estimation plus précise en tenant compte de ces précisions. Si un poids réel est donné pour un aliment, utilise-le comme la valeur exacte (à la place de l'estimation initiale) et recalcule ses calories et macros proportionnellement à ce nouveau poids. Une matière grasse ajoute des calories et des lipides. Une sauce cachée ajoute des calories et peut devenir un aliment à part entière dans la liste si elle n'y figure pas déjà.

${JSON_FORMAT_INSTRUCTIONS}`;

  try {
    const result = await callGemini(apiKey, prompt, image);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).send(err.message || 'Erreur affinage Gemini');
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
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("Impossible de lire l'analyse renvoyée par l'IA.");
  }
}
