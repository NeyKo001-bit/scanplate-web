// Reproduit GeminiVisionService.swift : mêmes prompts, même schéma JSON
// (foods: name/estimatedGrams/calories/proteins/carbs/fats + totaux),
// mais la clé Gemini reste ici, côté serveur (variable d'environnement
// GEMINI_API_KEY), jamais envoyée au navigateur.

const MODEL = "gemini-3.1-flash-lite";

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

function analyzePrompt() {
  return `Tu es un assistant nutritionnel. Analyse cette photo de plat et identifie chaque aliment visible avec une estimation de son poids en grammes. Calcule ensuite les calories, protéines, glucides et lipides pour chaque aliment, puis les totaux.

${JSON_FORMAT_INSTRUCTIONS}`;
}

function refinePrompt(previousResult, answers) {
  const extraInfoLines = [];
  if (answers.fatType) extraInfoLines.push(`- Matière grasse utilisée : ${answers.fatType}`);
  if (answers.hiddenSauce) extraInfoLines.push(`- Sauce ou assaisonnement signalé : ${answers.hiddenSauce}`);

  for (const food of previousResult.foods || []) {
    const corrected = answers.adjustedGrams ? answers.adjustedGrams[food.id] : undefined;
    if (corrected !== undefined && Math.abs(corrected - food.estimatedGrams) > 0.5) {
      extraInfoLines.push(`- "${food.name}" : poids réel ${Math.round(corrected)} g (estimation initiale : ${Math.round(food.estimatedGrams)} g)`);
    }
  }

  const extraInfo = extraInfoLines.length ? extraInfoLines.join("\n") : "Aucune précision supplémentaire fournie.";

  return `Tu es un assistant nutritionnel. Tu as déjà analysé une première fois cette photo de plat, avec ce résultat :
${JSON.stringify(previousResult)}

L'utilisateur a maintenant fourni des précisions supplémentaires :
${extraInfo}

Recalcule une estimation plus précise en tenant compte de ces précisions. Si un poids réel est donné pour un aliment, utilise-le comme la valeur exacte (à la place de l'estimation initiale) et recalcule ses calories et macros proportionnellement à ce nouveau poids. Une matière grasse ajoute des calories et des lipides. Une sauce cachée ajoute des calories et peut devenir un aliment à part entière dans la liste si elle n'y figure pas déjà.

${JSON_FORMAT_INSTRUCTIONS}`;
}

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
    const { mode, imageBase64, mimeType, previousResult, refinementAnswers } = req.body || {};
    if (!imageBase64 || !mimeType) {
      res.status(400).json({ error: "Image manquante." });
      return;
    }

    const prompt = mode === "refine"
      ? refinePrompt(previousResult || { foods: [] }, refinementAnswers || {})
      : analyzePrompt();

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }
          ],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
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
      res.status(502).json({ error: "Impossible de lire l'analyse renvoyée par l'IA.", raw: text });
      return;
    }

    const foods = (parsed.foods || []).map((f, i) => ({
      id: `${Date.now()}-${i}`,
      name: f.name,
      estimatedGrams: f.estimatedGrams || 0,
      calories: f.calories || 0,
      proteins: f.proteins || 0,
      carbs: f.carbs || 0,
      fats: f.fats || 0
    }));

    res.status(200).json({
      foods,
      totalCalories: parsed.totalCalories || 0,
      totalProteins: parsed.totalProteins || 0,
      totalCarbs: parsed.totalCarbs || 0,
      totalFats: parsed.totalFats || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Erreur serveur." });
  }
}
