<div align="center">

# 🎬 Nuvio Repo — Animes & Films

### Onze providers, un seul dépôt : animes **et** films dans Nuvio 🍿

**VOSTFR + VF · Multi-qualité · Séries & Films · Chaque flux vérifié jouable aux tests**

![Providers](https://img.shields.io/badge/providers-11-8A2BE2?style=for-the-badge)
![Langue](https://img.shields.io/badge/🇫🇷_VOSTFR_+_VF-1E90FF?style=for-the-badge)
![Nuvio](https://img.shields.io/badge/Nuvio-Compatible-00C853?style=for-the-badge)

</div>

---

## 📦 Ce qu'il y a dans le dépôt

### 🎥 Films live-action

| Provider | Source | Pipeline |
|---|---|---|
| 🎞️ **CineStream** 🆕 | cinestream.info | Lecteurs adressés **directement par ID TMDB** (`/player/<tmdbId>/<idx>`) — Uqload, Luluvdo, Vidmoly, Voe, Filelions… |
| 🎬 **Yablom** ⬆️v2 | yablom.com | Moteur refait : recherche API avec Referer (bug latent corrigé), dossier auto-retrouvé, Sharecloudy→m3u8 |
| 🎬 **Kordoz** 🆕 | kordoz.com | Même moteur v2, catalogue complémentaire |
| 🌟 **Ilmiv** 🆕 | ilmiv.com | Même moteur v2, catalogue complémentaire |
| 🍿 **Kidraz** 🆕 | kidraz.com | Même moteur v2, catalogue complémentaire |
| 🎥 **French Stream** ⬆️v1.3.1 | fs20.lol | Films **et séries** VF/TRUEFRENCH/VOSTFR — **cipher fsvid/vidzy décodé** (base64→reverse→XOR checksum du host) : fini le leurre « troll » de 18 s, Premium 1080p réel *(miroir : french-stream.one)* |
| 📡 **FStream·One** 🆕 | french-stream.one (API Movix) | Films & séries VF/VFQ/VFF/VOSTFR — lecteurs pré-triés par langue puis résolus en direct (cipher fsvid/vidzy, uqload, dood…). Complète French Stream quand le site bouge ; groupe `Default` upstream lu comme VF |

### 🌸 Anime (séries + films)

| Provider | Source | Pipeline |
|---|---|---|
| 🐍 **Anime-Sama** | anime-sama.to (domaine auto) | VOSTFR + VF multi-hébergeurs — **déjà solide** (7/7 aux tests) |
| 🍥 **French-Manga** ⬆️v1.1.1 | w16.french-manga.net | Vidzy (cipher décodé) & Luluvdo, sous-titres, saisons/films — leurre « troll » filtré, durée VOD vérifiée |
| 🐸 **VoirAnime** 🆕 | voir-anime.to | **Séries multi-saisons + films de saga** : mapping TMDB S/E → épisode absolu, saisons par noms d'arcs (`yuukaku-hen`…), identité vérifiée sur la page (année + titres). Voembed/Vidmoly HLS |
| 💜 **Vostfree** 🆕 | vostfree.ws | Séries **complètes** (tous les épisodes en Sibnet/Uqload), posts par épisode et films. Posts DLE inversés (`buttons_N` → `content_player`) |

---

## 📥 Installation dans Nuvio

1. Ouvre **Nuvio**
2. **Réglages ⚙️ → Plugins** (ou *Extensions / Sources*)
3. **Ajouter un dépôt** et colle :

```
https://raw.githubusercontent.com/Fluffy0000/animesama-nuvio/refs/heads/main/manifest.json
```

4. Valide ✅ → les 11 providers apparaissent.

> 💡 Après une mise à jour, **supprime puis re-ajoute** le dépôt pour forcer le rechargement.

---

## 🛡️ Confidentialité

- **Zéro proxy** : chaque requête part **directement de ton appareil** vers les sites sources. Aucun relais tiers, aucune fuite de ton IP ou de ta navigation vers un intermédiaire.
- Les providers n'hébergent rien : ils organisent des liens déjà publics (usage **personnel et éducatif** — soutiens les plateformes officielles quand tu le peux 💜).

---

## 🧪 Qualité (tests live automatisés)

Chaque provider est testé en conditions réelles : `getStreams(tmdbId, type, saison, épisode)`
puis **vérification profonde de chaque URL** : la playlist est téléchargée **entièrement**
(et sa première variante), la **durée VOD est sommée** — un « stream » de 18 s (leurre/intro)
est recalé, un vrai film/épisode affiche sa durée réelle (~90–200 min / ~22–45 min).

```
python3 build.py                 # reconstruit providers/*.js depuis src/
node test/run.js <provider.js> <tmdbId> <movie|tv|anime> [S E]
```

Dernier passage : suite dans `test/RESULTS.md`.

---

## 🛠️ Structure

```
manifest.json            ← ce que Nuvio lit
providers/*.js           ← scrapers (buildés, un seul fichier chacun)
src/core/*.js            ← moteur partagé : fetch safe, TMDB, désobfuscation, extracteurs d'embeds
src/<provider>/index.js  ← logique de chaque provider (édite ici, puis `python3 build.py`)
build.py                 ← mini-bundler sans dépendances
test/run.js              ← harnais de test live
```

**Ajouter un provider :** créer `src/<nom>/index.js`, ajouter l'entrée dans `build.py`, rebuild, ajouter au `manifest.json`, **bump la version**.

---

## ⚠️ Sites évalués mais non retenus (à ce jour)

| Site | Pourquoi |
|---|---|
| dessinanime.cc, openflix.lol, aether.ist/.cx, movix.chat | Apps JS (Next/movie-web) ou Cloudflare strict côté datacenter ; la résolution complète se fait **dans le navigateur** du site, pas côté serveur — à étudier sur appareil réel |
| stigstream.ru | **Inobservable d'ici** : origin `api.stigstream.ru` DOWN (522 Cloudflare derrière relais comme en direct) **et** IP datacenter bannie par ASN (403 court). À réévaluer si l'origin revient, sur appareil réel |
| franime.fr, french-anime.com, myfluneo.eu, flemmix.fast, nakastream.tv, dulourd.boo, 1jour1film*, streaming-integral* | Blocage Cloudflare par **IP datacenter** (403). Depuis une IP mobile/résidentielle ça peut passer — itération future avec validation sur appareil |
| frembed.lat | Injoignable (DNS/timeout) |
| purstream.wiki | Wiki uniquement (liens Telegram), pas de site de streaming exposé |
| cinelibre.fr, TF1/RTS/tou.tv/Télé-Québec/TV5Unis/TFO, Molotov | Services **officiels** avec comptes/DRM — hors périmètre des providers Nuvio |

<div align="center">

**Fait avec ❤️ pour la commu' — bon visionnage ! 🍿**

</div>
