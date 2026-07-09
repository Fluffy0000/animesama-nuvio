<div align="center">

# 🎬 Nuvio Repo — Animes & Films

### Deux providers, un seul dépôt, tout ton streaming d'anime dans Nuvio 🍿

**VOSTFR + VF · Multi-qualité · Séries & Films · Sans lien mort**

![Providers](https://img.shields.io/badge/providers-2-8A2BE2?style=for-the-badge)
![Langue](https://img.shields.io/badge/🇫🇷_VOSTFR_+_VF-1E90FF?style=for-the-badge)
![Nuvio](https://img.shields.io/badge/Nuvio-Compatible-00C853?style=for-the-badge)

</div>

---

## 📦 Ce qu'il y a dans le dépôt

| Provider | Source | Ce qu'il apporte |
|---|---|---|
| 🐍 **Anime-Sama** | anime-sama.fr | Le catalogue Anime-Sama : séries & films, VOSTFR + VF, multi-hébergeurs (Vidmoly, Sibnet, Smoothpre…), domaine qui se met à jour tout seul |
| 🍥 **French-Manga** | french-manga.net | Animes & films d'animation en VOSTFR + VF via Vidzy & Luluvdo, avec sous-titres et gestion des saisons/films |

> Les deux s'installent **d'un coup** avec un seul lien. Tu choisis la source qui répond le mieux selon l'anime.

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

5. Valide ✅ → **🐍 Anime-Sama** et **🍥 French-Manga** apparaissent dans ta liste
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
- 🎬 **Films** — Studio Ghibli, Your Name, Suzume, les films Demon Slayer / Dragon Ball / One Piece…
- 🌸 En **VOSTFR** et **VF** selon les disponibilités

> Un anime ne remonte rien sur un provider ? Essaie l'autre : Anime-Sama et French-Manga n'ont pas exactement le même catalogue, ils se complètent.

---

## 🛠️ Structure du dépôt (pour bidouiller)

```
manifest.json          ← liste les 2 providers (ce que Nuvio lit)
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
