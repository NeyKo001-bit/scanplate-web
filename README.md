# ScanPlate — version web (fidèle à l'app iOS)

Cette version reproduit fidèlement le contenu de ton app Swift :

- **Accueil** : même icône, même titre "Scanne ton assiette", même texte,
  même bouton vert "Scanner mon assiette", même choix caméra / galerie.
- **Résultat** : badge Calories (orange), puis Protéines/Glucides/Lipides
  (rouge/bleu/jaune), liste des aliments détectés, bouton "Affiner le
  résultat".
- **Mode avancé (V2)** : feuille avec poids réel par aliment, matière
  grasse utilisée, sauce cachée — recalcul via Gemini, exactement comme
  `refine()` dans `GeminiVisionService.swift`.
- **Historique cliquable (V3)** : on tape sur un scan passé pour le
  rouvrir (sans relancer Gemini) et l'affiner à nouveau si besoin, avec
  le badge "✓ Affiné".
- Mêmes prompts envoyés à Gemini, même modèle (`gemini-3.1-flash-lite`),
  même schéma JSON (`proteins`/`carbs`/`fats`, `totalCalories`, etc.).

La clé Gemini reste **cachée côté serveur** (`api/analyze.js` +
variable d'environnement `GEMINI_API_KEY`), jamais visible dans le
navigateur.

## Mettre à jour ton déploiement existant

Tu as déjà un projet Vercel connecté à un dépôt GitHub
(`scanplate-web`). Pour remplacer l'ancienne version par celle-ci :

1. Va sur ton dépôt GitHub (`NeyKo001-bit/scanplate-web` d'après ton
   screenshot).
2. Pour chaque fichier de ce dossier (`index.html`, `style.css`,
   `app.js`, `manifest.json`, `api/analyze.js`) :
   - clique sur le fichier dans GitHub
   - clique sur l'icône crayon ✏️ (Edit) en haut à droite
   - sélectionne tout le contenu existant, supprime-le, colle le
     nouveau contenu de ce dossier
   - clique "Commit changes"
   
   Ou plus simple : sur la page principale du dépôt, bouton **"Add
   file" → "Upload files"**, glisse tous les fichiers de ce dossier
   (ça écrase automatiquement les fichiers du même nom).
3. Vercel redéploie **automatiquement** dès qu'il détecte un
   changement sur la branche `main` — pas besoin de repasser par
   "New Project". Va dans l'onglet "Deployments" de ton projet Vercel
   pour voir le nouveau déploiement se faire (30-60 secondes).
4. Une fois "Ready", reteste sur `scanplate-web.vercel.app`.

Ta clé `GEMINI_API_KEY` est déjà configurée sur Vercel, pas besoin d'y
retoucher.

## Ce qui reste différent de l'app iOS

- Le rendu visuel s'appuie sur les polices système du téléphone
  (`-apple-system` / Roboto selon l'appareil) plutôt que la police
  exacte de Xcode — impossible à reproduire à l'identique en dehors
  d'iOS, mais les couleurs, tailles et mises en page suivent celles du
  code Swift.
- L'historique est stocké dans le navigateur (`localStorage`), donc
  propre à l'appareil, comme le `Documents` local sur iOS — mais s'il
  vide le cache de son navigateur, l'historique est perdu (contrairement
  à l'app iOS où seul un effacement d'app le supprimerait).
