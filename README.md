# ScanPlate — version web (identique à l'app iOS V6)

Réécriture complète pour être au même niveau que ton app Swift :

- **V1** : scan photo → analyse Gemini → calories/macros → historique
- **V2** : "Affiner le résultat" (matière grasse, sauce cachée, poids réel par aliment)
- **V3** : historique cliquable, badge "✓ Affiné"
- **V4** (nouveau ici) : onglet **Profil** — sexe/âge/poids/taille/activité/objectif,
  calcul du TDEE (Mifflin-St Jeor), objectif calorique quotidien, barre de
  progression sur l'accueil (protégée si l'objectif est nul/négatif, comme en V5)
- **V6** (nouveau ici) : onglet **Stats** — graphique à barres des calories/jour
  sur 7 ou 30 jours, ligne pointillée sur l'objectif, moyenne kcal/jour

Même modèle Gemini (`gemini-3.1-flash-lite`), mêmes prompts, clé API cachée
côté serveur (`api/analyze.js` + `api/refine.js`, variable d'environnement
`GEMINI_API_KEY` déjà configurée sur ton Vercel).

## Mettre à jour ton dépôt GitHub existant

Sur `https://github.com/NeyKo001-bit/scanplate-web`, page principale →
**"Add file" → "Upload files"** → glisse tous les fichiers ci-dessous (ça
écrase automatiquement les fichiers du même nom) :

- `index.html`
- `style.css`
- `app.js`
- `manifest.json`
- `sw.js`
- `api/analyze.js`
- `api/refine.js`

Ne touche pas au dossier `icons/` : il reste inchangé.

Commit → Vercel redéploie automatiquement en 30-60 secondes (onglet
"Deployments" de ton projet Vercel pour suivre).

## Important pour l'appareil de ta mère

`sw.js` a un cache versionné (`scanplate-cache-v7`). Dès qu'elle rouvre
l'app avec une connexion internet, le nouveau service worker s'installe et
remplace l'ancien cache automatiquement — elle n'a rien à faire de spécial,
mais il faut qu'elle ait une connexion au moins une fois après ta mise à
jour pour que ça se déclenche.

## Stockage

L'historique et le profil sont stockés dans `localStorage` du navigateur
(comme avant) — propre à l'appareil, perdu si le cache du navigateur est vidé.
