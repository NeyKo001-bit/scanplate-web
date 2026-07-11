# ScanPlate — version web

Version web de ScanPlate : même principe que l'app iOS (photo → analyse
Gemini → calories/macros → historique), mais utilisable sur **n'importe
quel téléphone** (Android compris) via le navigateur, gratuitement,
sans App Store ni Play Store.

## Déploiement (gratuit) avec Vercel

1. Crée un compte gratuit sur https://vercel.com (tu peux te connecter
   avec GitHub).
2. Mets ce dossier dans un dépôt GitHub :
   - Crée un nouveau repo sur https://github.com/new (ex: `scanplate-web`)
   - Depuis ce dossier, dans un terminal :
     ```
     git init
     git add .
     git commit -m "ScanPlate web"
     git branch -M main
     git remote add origin https://github.com/TON-USER/scanplate-web.git
     git push -u origin main
     ```
3. Sur Vercel : **Add New → Project**, importe le repo `scanplate-web`.
   Laisse les réglages par défaut (Vercel détecte automatiquement le
   dossier `api/` comme des fonctions serverless).
4. Avant de déployer, ajoute la variable d'environnement :
   - Nom : `GEMINI_API_KEY`
   - Valeur : ta clé API Gemini (celle que tu utilises déjà dans l'app iOS)
   - (Project Settings → Environment Variables, puis redeploy)
5. Déploie. Vercel te donne une URL du type
   `https://scanplate-web.vercel.app`.

C'est cette URL que tu donnes à ta mère (par SMS, WhatsApp, peu importe).

> Alternative à Vercel : Netlify fonctionne pareil (fonctions serverless
> gratuites + variables d'environnement). GitHub Pages, en revanche, ne
> permet PAS les fonctions serverless — à éviter ici puisqu'on a besoin
> de cacher la clé API côté serveur.

## Installer comme une appli sur Android

Une fois l'URL ouverte dans Chrome sur son téléphone :
1. Menu **⋮** (trois points en haut à droite)
2. **Ajouter à l'écran d'accueil** (ou "Installer l'application" si
   Chrome le propose directement)
3. Une icône ScanPlate apparaît sur l'écran d'accueil, s'ouvre en plein
   écran sans barre d'adresse, exactement comme une appli installée.

Le fichier `manifest.json` + `sw.js` fournis sont justement là pour que
cette installation fonctionne proprement (icône, nom, lancement en mode
"standalone").

## Structure du projet

```
index.html        → structure de la page
style.css          → design (cadran de calories/macros façon tableau de bord)
app.js             → logique : capture photo, appel API, affichage, historique local
manifest.json      → rend l'app installable sur Android
sw.js              → service worker (mise en cache de la coquille de l'app)
api/analyze.js     → fonction serverless qui appelle Gemini avec la clé API cachée
icons/             → icônes de l'app
```

## Ce qui correspond à quoi côté iOS

| iOS (Swift)              | Web                                   |
|---------------------------|----------------------------------------|
| `ImagePicker.swift`       | `<input type="file" capture="environment">` |
| `GeminiVisionService.swift` | `api/analyze.js` (+ `fetch` dans `app.js`) |
| `ScanHistoryStore.swift`  | `localStorage` dans `app.js`          |
| `ScanResultView.swift`    | le "dial" de macros dans `index.html`/`style.css` |

## Limites de cette V1 web (par rapport à l'app iOS)

- Le mode "Affiner le résultat" (V2/V3 sur iOS) n'est pas encore repris
  ici — seule l'analyse initiale est branchée. On peut l'ajouter ensuite
  en suivant le même modèle (un second appel à `api/analyze.js` avec les
  précisions de l'utilisateur).
- L'historique est stocké en local dans le navigateur (`localStorage`) :
  il est propre à chaque appareil, comme sur iOS (pas de compte, pas de
  serveur qui garde les données).
