<div align="center">

# 🎬 Nuvio Repo — Animes & Films

### Trois providers, un seul dépôt : animes **et** films tout public dans Nuvio 🍿

**VOSTFR + VF · Multi-qualité · Séries & Films · Sans lien mort**

![Providers](https://img.shields.io/badge/providers-4-8A2BE2?style=for-the-badge)
![Langue](https://img.shields.io/badge/🇫🇷_VOSTFR_+_VF-1E90FF?style=for-the-badge)
![Nuvio](https://img.shields.io/badge/Nuvio-Compatible-00C853?style=for-the-badge)

</div>

---

## 📦 Ce qu'il y a dans le dépôt

| Provider | Source | Ce qu'il apporte |
|---|---|---|
| 🐍 **Anime-Sama** | anime-sama.fr | Le catalogue Anime-Sama : séries & films, VOSTFR + VF, multi-hébergeurs (Vidmoly, Sibnet, Smoothpre…), domaine qui se met à jour tout seul |
| 🍥 **French-Manga** | french-manga.net | Animes & films d'animation en VOSTFR + VF via Vidzy & Luluvdo, avec sous-titres et gestion des saisons/films |
| 🎬 **Yablom** | yablom.com | Films tout public (pas que de l'anime) en VF + VOSTFR via Sharecloudy, flux HLS direct, dossier auto-réparé si le site change |
| 🎥 **French Stream** | fs20.lol | **Films ET séries live-action** VF/TRUEFRENCH/VOSTFR via Vidzy & Uqload, épisodes par saison, flux HLS multi-qualité |

> Les quatre s'installent **d'un coup** avec un seul lien. Tu choisis la source qui répond le mieux selon le titre.

---

## 📥 Installation dans Nuvio

C'est **hyper simple**, 30 secondes ⏱️

1. Ouvre **Nuvio**
2. Va dans **Réglages ⚙️ → Plugins** (ou *Extensions / Sources*)
3. Clique sur **Ajouter un dépôt** (Add repository)
4. Colle ce lien 👇

```
https://raw.githubusercontent.com/Fluffy0000/animesama-nuvio/refs/heads/main/manifest.json
```

5. Valide ✅ → **🐍 Anime-Sama**, **🍥 French-Manga**, **🎬 Yablom** et **🎥 French Stream** apparaissent dans ta liste
6. Ouvre un anime, un film… et régale-toi 🍿

> 💡 **Astuce** : après une mise à jour, **supprime puis re-ajoute** le dépôt pour forcer Nuvio à recharger la dernière version (sinon il garde l'ancienne en cache).

---

## ✨ Pourquoi tu vas les adorer

| | |
|---|---|
| 🎌 **VOSTFR & VF** | Les deux langues récupérées automatiquement quand elles existent, regroupées proprement |
| 🏆 **Meilleure qualité en avant** | 1080p / 720p / 480p détectés et **triés du meilleur au moins bon** |
| 🎬 **Films de séries gérés** | Mugen Train, Broly, One Piece Film RED, les films de saga… trouvés **par leur nom** |
| 🔗 **Jamais de lien mort** | Chaque source est **vérifiée vivante** avant de t'être proposée |
| 🌐 **Domaine auto** | Les sites changent de nom de domaine ? Les providers **suivent tout seuls** |
| 🏷️ **Sources lisibles** | Chaque ligne affiche `Hébergeur · Qualité · Langue` — tu choisis en un coup d'œil |
| ⚡ **Anti-coupures** | Flux à qualité fixe (pas d'adaptatif capricieux) pour une lecture plus stable |

---

## 🎯 Ce que tu peux regarder

- 📺 **Séries animées** — One Piece, Naruto, Demon Slayer, Jujutsu Kaisen, Attack on Titan, Solo Leveling, Dandadan, Chainsaw Man… et des centaines d'autres
- 🎞️ **Films d'animation** — Studio Ghibli, Your Name, Suzume, les films Demon Slayer / Dragon Ball / One Piece…
- 🎬 **Films tout public** — via **Yablom** : blockbusters, drames, comédies… en VF (et VOSTFR quand dispo)
- 🎥 **Films & séries live-action** — via **French Stream** (fs20.lol) : films récents et séries complètes (par saison/épisode), VF/TRUEFRENCH/VOSTFR
- 🌸 En **VOSTFR** et **VF** selon les disponibilités

> Un titre ne remonte rien sur un provider ? Essaie les autres : Anime-Sama, French-Manga et Yablom n'ont pas le même catalogue, ils se complètent. Pour les **films non-anime**, c'est **Yablom** qui répond.

---

## 🛠️ Structure du dépôt (pour bidouiller)

```
manifest.json          ← liste les 4 providers (ce que Nuvio lit)
providers/*.js         ← les scrapers chargés par Nuvio
src/<nom>/             ← sources (si tu veux modifier puis rebuilder)
```

**Ajouter un provider :** créer `src/<nom>/index.js` (avec `export { getStreams }`), le builder en `providers/<nom>.js`, puis ajouter une entrée dans le tableau `scrapers` du `manifest.json`. Pense à **bump la version** du scraper à chaque changement.

---

<div align="center">

## ⚠️ Avertissement

Ces providers **n'hébergent aucun contenu**. Ils organisent des liens publics déjà présents sur des sites tiers.
Destinés à un usage **personnel et éducatif**. Soutiens les créateurs et les plateformes officielles quand tu le peux 💜

---

**Fait avec ❤️ pour la commu' — bon visionnage ! 🍿**

</div>
