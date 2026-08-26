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
4. Règle **Referer vidzy/fsvid tranchée** : la page embed exige son **origine finale** comme
   Referer (`v6.vidzy.cc` → **403 sans**, 200 avec ; `u14`/fsvid l'acceptent aussi) — les
   streams sont émis AVEC `Referer: <origine de l'embed>/` (core partagé corrigé et propagé
   aux providers buildés au rebuild ; **fs20 1.3.1 / french-manga 1.1.1** édités à la main).

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

## 📡 FStream·One (nouveau provider, v1.0.0) — audit d'entrée 2026-08-26

Source : **API Movix publique** (`api.movix.fun/api/fstream`, GET anonyme) qui liste les
lecteurs de french-stream.one déjà groupés par langue ; chaque embed est ensuite résolu
DIRECTEMENT depuis l'appareil (moteur commun : cipher fsvid/vidzy, packers uqload/filemoon,
dood, voe…). Wiflix sondé en amont = doublon exact de cinestream → écarté.

### 🚨 Bug trouvé & corrigé à l'entrée : le groupe « Default » ignoré

L'API organise les lecteurs films en `{VFQ, VFF, VOSTFR, Default}` et séries en
`{VF, VOSTFR, VOENG, Default}`. `Default` = onglet par défaut de la page
(slug `streaming-complet-vf`) — donc **VF** sur ce site FR. Le parseur initial ne lisait que
`vfq/vff/vostfr` codés en dur : tout film dont les lecteurs vivent sous `Default`
(ex. *Le Fabuleux Destin d'Amélie Poulain*) renvoyait **EMPTY** malgré 6 lecteurs disponibles.

**Correctif (src/fstream/index.js, rebuild 1.32.0)** : règle généralisée — groupe contenant
« vost » → `VOSTFR`, **tout le reste → VF** ; tri VF d'abord / VOSTFR en dernier. Même logique
côté séries. Au passage la règle `fsvid` a rejoint `HOST_RULES` (sinon Premium fsvid tombait
en generic → leurre troll).

### ✅ Matrice FStream·One — contenu prouvé par durée

| Test | Streams | Détail | Durée mesurée | Verdict |
|---|---|---|---|---|
| Amélie Poulain (194) — **titre accenté, players sous `Default`** | 1/1 | Vidzy VF HLS (le cas vide avant fix) | **122min02** (= durée exacte du film) | ✓ |
| Breaking Bad S1E1 (1396) tv | 4/4 | Vidzy+Uqload VF puis Uqload+Vidzy VOSTFR | **58min06** ×4 | ✓ |
| Oppenheimer (872585) movie | 3/3 | Vidzy ×2 + Uqload, tous VF (**v6.vidzy.cc : Referer exigé, OK**) | **180min22** ×3 | ✓ |

## 🛑 stigstream.ru — conclusion d'enquête (inobservable depuis cet environnement)

Deux constats indépendants, recoupés via relais de recon (analyse uniquement, rien dans les providers) :

1. **Origin DOWN, pas un blocage local** : `api.stigstream.ru` répond **522** (Cloudflare
   « origin unreachable ») derrière les relais comme en direct — le backend est mort/injoignable,
   quel que soit notre IP.
2. **IP datacenter bannie côté edge** : requête directe → **403 court** (ban ASN), sans page ni
   challenge exploitable.

→ Combinaison fatale : l'edge nous refuse par ASN **et** l'origin ne répond plus aux rares
passages. Rien n'est observable d'ici, donc rien à coder — à réévaluer seulement si l'origin
revient ET sur IP résidentielle (appareil réel). Classé **non retenu** avec ce motif.

## 📦 Historique (session précédente)

Suite initiale : yablom 1/1, cinestream 2/4, voiranime 1/1 (S1/S2/S4 bons arcs), vostfree 1/1,
animesama 7/7, french-manga 1/1, fs20 1/1. Bugs corrigés : Referer api_search (famille yablom),
mapping saisons anime (slugs parents + arcs), faux positifs d'identité (phrase complète +
début de mot), désobfuscation Dean Edwards pure JS, Referer = origine finale après redirections.
