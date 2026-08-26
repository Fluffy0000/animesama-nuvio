# 🧪 Résultats de test live — 2026-08-26 (audit durée-prouvée)

Harnais : `node test/run.js <provider> <tmdbId> <type> [S E]`

Depuis cette version, **chaque HLS est téléchargé en entier** (master → 1ʳᵉ variante) et la
**durée VOD est sommée** (`EXTINF` × segments). Un stream « jouable » n'est validé que si le
contenu dépasse 4 minutes — un clip logo de 18 s se fait recaler comme ⚠️ leurre.

> ⚠️ Ce sandbox a une IP **datacenter** : certains CDN (tnmr.org/Luluvdo, voe) répondent 403
> ici mais passent sur IP résidentielle (téléphone Nuvio).

## 🚨 Bug majeur trouvé & corrigé dans cet audit : le leurre « troll » fsvid/vidzy

Les embeds **fsvid.lol** (`Premium` de fs20) et **vidzy.cc** (`Vidzy` de fs20 **et**
french-manga) servent une page piégée :

```js
var _fsvHls = "https://s1.fsvid.lol/troll/master.m3u8";     // LEURRE (clip logo FSTREAM de 18 s)
player.src = (function(s){ /* atob → reverse → XOR(0x3d + i*89 + checksum(location.hostname)) */ })("…base64…")
```

Un regex « premier `.m3u8` venu » récupérait le leurre → **l'utilisateur voyait 18 s de logo
FSTREAM.TOP et plus rien** (prouvé par extraction de frames + somme des durées : 9 segments, 18 s).

**Correctif livré (fs20 1.3.0 / french-manga 1.1.0)** :

1. `decodeHostCipher()` : décodage pur JS (pas d'`atob`, safe QuickJS/Hermes) de la base64 avec
   le XOR checksummé par le hostname de l'embed → **vraie URL** (ex. Premium Avatar 3 → 1080p, **197 min**).
2. Leurre `/troll/` filtré explicitement.
3. `playlistLooksReal()` : si la playlist est un VOD court (< 4 min) → rejeté → fallback sur
   l'hébergeur suivant (vidzy/uqload).
4. Le CDN fsvid/vidzy 403 sur certains Referer → streams émis **sans Referer** (200 vérifié).

## ✅ Matrice complète — contenu prouvé par durée

| Provider | Test | Stream vérifié | Durée mesurée | Verdict |
|---|---|---|---|---|
| fs20 ⬆️ | Oppenheimer (872585) | Vidzy 360p VF (Premium absent→rejeté, fallback OK) | **180 min** | ✓ |
| fs20 ⬆️ | Avatar 3 (83533) | **Premium 1080p VF** (cipher décodé) | **197 min** | ✓ |
| fs20 ⬆️ | Breaking Bad S1E1 (1396) | Vidzy 480p VF | **58 min** | ✓ |
| french-manga ⬆️ | Kimetsu S1E1 (85937) | Vidzy 480p VOSTFR | **22min40** | ✓ |
| animesama | Kimetsu S1E1 | 7/7 (Ansembed, Smoothpre, Sibnet…) | 23min40 chacun | ✓ |
| yablom / kordoz / ilmiv / kidraz | Avatar (19995) | Sharecloudy HLS VF ×4 | **178 min** ×4 | ✓ |
| cinestream | Oppenheimer (872585) | Uqload VF + Filelions VF | **180 min** ×2 | ✓ (2/4 : Luluvdo 403-IP DC) |
| voiranime | Kimetsu S1E1 | Vidmoly VOSTFR | 23min40 | ✓ |
| voiranime | Your Name (372058) | 2/2 (**VOSTFR + VF**) | 106min26 ×2 | ✓ |
| vostfree | Shippuden S1E5 (31910) | Sibnet MP4 VF | 206 range ✓ | ✓ |
| diag v19 | Oppenheimer | newsId + 7 hosts listés | — |
| | | | | ✓ |

Aucun faux positif connu : vostfree renvoie EMPTY sur les non-anime / absents du catalogue.

## 📦 Historique (session précédente)

Suite initiale : yablom 1/1, cinestream 2/4, voiranime 1/1 (S1/S2/S4 bons arcs), vostfree 1/1,
animesama 7/7, french-manga 1/1, fs20 1/1. Bugs corrigés : Referer api_search (famille yablom),
mapping saisons anime (slugs parents + arcs), faux positifs d'identité (phrase complète +
début de mot), désobfuscation Dean Edwards pure JS, Referer = origine finale après redirections.
