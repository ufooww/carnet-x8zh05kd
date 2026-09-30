/* Service worker — rend le carnet consultable sans réseau.
 *
 * Ce qu'il met en cache : la coquille du site (page, style, scripts, données,
 * icônes). Environ 500 Ko, installés au premier chargement.
 *
 * Ce qu'il ne met **pas** en cache : les archives de tuiles (.pmtiles, 108 Mo)
 * et les vignettes des vidéos. Les archives vivent dans IndexedDB, où
 * l'application les dépose après un téléchargement explicite ; les doubler ici
 * remplirait le disque du téléphone pour rien. Les vignettes ne servent qu'à
 * l'onglet « À identifier », qui se consulte à la maison.
 *
 * Stratégie : cache d'abord pour la coquille — c'est ce qui rend l'ouverture
 * instantanée et le hors-connexion possible — et réseau d'abord pour tout le
 * reste, avec repli sur le cache.
 *
 * ⚠️ **CE QUI A CHANGÉ LE 17/09/2026, ET POURQUOI.**
 *
 * La version précédente rafraîchissait sa copie en arrière-plan dès qu'une
 * réponse arrivait avec un code 200. C'est exactement ce qu'il ne faut pas
 * faire dans un aéroport, un café ou un hôtel japonais : **les portails captifs
 * répondent 200 à tout**, avec leur propre page HTML, tant qu'on n'a pas coché
 * leurs conditions. Le carnet demandait `js/app.js`, recevait la page du
 * portail, et la rangeait à la place du fichier. Au vol suivant, sans réseau,
 * il ouvrait le portail — c'est-à-dire rien.
 *
 * Trois verrous, désormais :
 *   1. on ne met en cache qu'une réponse **de notre origine** (`basic`) ;
 *   2. dont le **type MIME correspond à l'extension demandée** — un `.js` qui
 *      revient en `text/html` est un portail, pas un script ;
 *   3. et jamais une réponse `206` (fragment) ni une réponse opaque.
 *
 * Le reste de la logique est inchangé.
 */

/* Changer ce numéro à chaque modification de la coquille (page, style,
   scripts). Sans cela, la stratégie « cache d'abord » sert l'ancienne version
   au rechargement suivant et la nouvelle seulement au second : on croit que
   rien n'a changé. L'activation purge les caches des versions précédentes ;
   les 108 Mo de tuiles vivent dans IndexedDB et ne sont pas touchés.
   v9  — 14/09/2026, constellation par ville, points cliquables.
   v12 — 16/09/2026, la nuit, l'aurore et le soleil levant.
   v13 — 17/09/2026, sûreté (filtres, politique de sécurité), onglet « Utile »,
         plan par jour, partage entre téléphones, cache à l'épreuve des
         portails captifs.
   v25 — 30/09/2026, correction de la v24 : sur iPhone, la carte
         disparaissait au zoom. La v24 agrandissait le fond d'un bloc
         (`scale`) pendant un pincement, et un calque agrandi au-delà de ce
         qu'accepte la puce graphique n'est plus affiché. Le zoom reprend la
         méthode de la v23 ; seule la translation, pendant un glissement, est
         gardée. Plus d'ancien niveau affiché dessous non plus.
   v24 — 30/09/2026, la carte fluide sur iPhone. Un seul rendu par image ;
         le fond se déplace d'un bloc par transformation au lieu d'être
         redessiné à chaque mouvement ; les épingles glissent par
         `translate3d` et ne sont plus reconstruites pendant un pincement ;
         l'ancien niveau de tuiles reste affiché jusqu'à l'arrivée du
         nouveau. Le ciel animé ne tourne plus derrière la carte.
   v23 — 29/09/2026, audit avant le départ. Les disques qu'aucun zoom ne
         sépare (même immeuble, centre de quartier) s'ouvrent en liste : 65
         adresses étaient inaccessibles depuis la carte. Les adresses connues
         seulement à la ville ne sont plus posées sur la gare centrale. Le GPS
         ne reste plus allumé en secret après un délai dépassé, et « Près de
         moi » ne l'éteint plus. Itinéraire par le nom quand la position n'est
         que celle du quartier.
   v22 — 20/09/2026, audit d'exposition : l'accueil ne donne plus que le mois
         du voyage, et le jeu de données publié est reconstruit sans les fiches
         privées — les adresses de logement restent dans le carnet local.
         ⚠️ Ce journal est publié : n'y recopiez jamais la valeur qu'un
         correctif vient de retirer. La première rédaction de cette entrée
         citait la période exacte, et annulait donc le correctif qu'elle
         décrivait.
   v21 — 18/09/2026, correction de la v20 : la bascule hors connexion ne
         déplace plus la vue. Elle calait les bornes de zoom sur l'archive et
         ramenait le zoom dedans — la carte sautait du niveau 7 au niveau 11
         toute seule à la moindre seconde de réseau perdue. Une coupure n'est
         plus crue sur parole non plus : on demande une vraie tuile avant de
         changer quoi que ce soit.
   v20 — 18/09/2026, la carte s'emporte : un bouton la propose sur la carte
         elle-même, et — surtout — les 108 Mo installés resservent enfin. Ils
         ne valaient que pour la session où on les avait pris : rien ne les
         rouvrait à l'ouverture suivante. La copie locale prend désormais le
         relais toute seule dès que le réseau manque.
   v19 — 18/09/2026, le bandeau d'erreurs ne signale plus que les pannes du
         carnet. Le navigateur intégré de Messenger injecte un script Facebook
         dans la page, la politique de sécurité le refuse, et le carnet
         s'ouvrait sur « Script non chargé : connect.facebook.net » — un
         bandeau rouge sur un site qui marchait.
   v18 — 18/09/2026, audit de publication : les exemples des champs du
         logement ne désignent plus un lieu réel.
   v17 — 18/09/2026, préparation de la publication : `noindex` + robots.txt,
         aperçu de lien débarrassé de la date du voyage, compteurs à jour.
   v16 — 18/09/2026, la boîte à liens : le groupe colle une adresse vue sur
         les réseaux, elle repart en texte vers Paco. Rien n'est envoyé d'ici.
   v15 — 18/09/2026, les 35 vidéos « À identifier » reprises : 28 adresses
         entrées, le carnet passe à 568, et chaque vidéo qui reste dit
         pourquoi elle résiste. **Toute modification du site oblige à monter
         ce numéro** — sinon le téléphone sert sa copie en cache et personne
         ne voit rien.
   v14 — 18/09/2026, la mise à jour s'annonce à l'écran et la version est
         lisible au pied de l'accueil. Écrit après avoir constaté qu'un
         téléphone affichait encore la version d'avant le 14/09 : le carnet se
         mettait à jour en silence, et n'utilisait la nouvelle copie qu'au
         rechargement suivant — qui ne venait jamais. */
var VERSION = "carnet-japon-v25";

var COQUILLE = [
  "./",
  "index.html",
  "css/style.css",
  "js/erreurs.js",
  "js/sur.js",
  "js/donnees.js",
  "js/utile-donnees.js",
  "js/pmtiles.js",
  "js/groupes.js",
  "js/aurore.js",
  "js/constellation.js",
  "js/icones.js",
  "js/carte.js",
  "js/utile.js",
  "js/jours.js",
  "js/partage.js",
  "js/liens.js",
  "js/app.js",
  "manifest.json",
  "img/icone-192.png",
  "img/icone-512.png",
  "img/apercu.png"
];

/* Ce qu'une extension doit rapporter. Le contrôle est volontairement large —
   on compare le début du type, pas la chaîne entière : `text/javascript`,
   `application/javascript` et `text/javascript; charset=utf-8` sont tous des
   scripts. Ce qui est refusé, c'est `text/html` pour un `.js` : le portail. */
var TYPES_ATTENDUS = {
  js: ["javascript", "ecmascript", "text/plain"],
  css: ["text/css"],
  html: ["text/html"],
  json: ["json", "text/plain"],
  png: ["image/"],
  jpg: ["image/"],
  jpeg: ["image/"],
  webp: ["image/"],
  svg: ["image/"]
};

function extension(chemin) {
  var m = /\.([a-z0-9]+)$/i.exec(chemin);
  return m ? m[1].toLowerCase() : "";
}

/* Vrai si la réponse peut être rangée. C'est le cœur du correctif : une
   réponse qui ne ressemble pas à ce qu'on a demandé n'entre pas dans le
   cache, même avec un code 200. */
function rangeable(requete, reponse) {
  if (!reponse || !reponse.ok) return false;
  if (reponse.status !== 200) return false;          // 206 : fragment, jamais entier
  if (reponse.type !== "basic") return false;        // opaque ou distante
  var url = new URL(requete.url);
  var ext = extension(url.pathname);
  // Une navigation (« / », « /index.html ») doit rapporter du HTML.
  if (requete.mode === "navigate" || ext === "" || ext === "html") {
    ext = "html";
  }
  var attendus = TYPES_ATTENDUS[ext];
  if (!attendus) return true;                        // extension inconnue : on laisse
  var type = (reponse.headers.get("content-type") || "").toLowerCase();
  if (!type) return false;
  for (var i = 0; i < attendus.length; i++) {
    if (type.indexOf(attendus[i]) >= 0) return true;
  }
  return false;
}

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      // addAll échoue en bloc si une seule ressource manque ; on préfère
      // installer ce qui existe plutôt que de ne rien installer du tout.
      return Promise.all(COQUILLE.map(function (u) {
        return fetch(u, { cache: "reload" }).then(function (r) {
          // Même contrôle qu'en service : s'installer derrière un portail
          // captif produirait un carnet en cache qui n'est pas le carnet.
          if (rangeable(new Request(u), r)) return c.put(u, r);
        }).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (noms) {
      return Promise.all(noms.map(function (n) {
        return n === VERSION ? null : caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* La page de secours, quand le carnet est demandé sans réseau et sans cache.
   Écrite ici, en dur : elle doit s'afficher précisément quand plus rien
   d'autre n'est disponible. */
function pageDeSecours() {
  return new Response(
    "<!doctype html><html lang=fr><meta charset=utf-8>" +
    "<meta name=viewport content='width=device-width,initial-scale=1'>" +
    "<title>Carnet Japon — hors connexion</title>" +
    "<body style='margin:0;background:#16150f;color:#f0ebe2;font:16px/1.5 " +
    "-apple-system,BlinkMacSystemFont,sans-serif;padding:32px 20px'>" +
    "<h1 style='font-size:20px'>Le carnet n'est pas encore hors connexion</h1>" +
    "<p>Cette page n'a pas pu être mise en cache — souvent parce que le carnet " +
    "a été ouvert pour la première fois sans réseau, ou derrière un portail " +
    "Wi-Fi qui n'avait pas encore été accepté.</p>" +
    "<p>Reconnectez-vous une fois, rouvrez le carnet, et il tiendra ensuite " +
    "sans réseau.</p></body></html>",
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 }
  );
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  // Les archives passent en direct : elles sont lues une seule fois, puis
  // conservées dans IndexedDB. Les intercepter ne ferait que doubler 108 Mo.
  if (url.pathname.indexOf(".pmtiles") >= 0) return;
  // Les tuiles du réseau ne sont pas non plus mises en cache ici : c'est le
  // rôle des archives, et un cache de tuiles sans bornes finit par tout remplir.
  if (url.hostname.indexOf("openstreetmap.jp") >= 0) return;

  if (url.origin !== self.location.origin) return;

  e.respondWith(
    /* `ignoreSearch` : un lien partagé au groupe arrive souvent avec une
       traîne — `?utm_source=…`, `#adresse`. Sans cette option, la page
       demandée ne correspond à aucune clé du cache et le carnet s'ouvre
       blanc hors connexion, alors qu'il est entièrement là. */
    caches.match(req, { ignoreSearch: true }).then(function (cachee) {
      if (cachee) {
        /* On rafraîchit en arrière-plan : la page reste instantanée, la
           version suivante sera à jour. Le contrôle `rangeable` est ce qui
           empêche un portail captif de remplacer le carnet par sa page
           d'accueil. */
        fetch(req).then(function (r) {
          if (rangeable(req, r)) {
            var copie = r.clone();
            caches.open(VERSION).then(function (c) { c.put(req, copie); });
          }
        }).catch(function () {});
        return cachee;
      }
      return fetch(req).then(function (r) {
        if (rangeable(req, r)) {
          var copie = r.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copie); });
        }
        return r;
      }).catch(function () {
        // Hors connexion et rien en cache. Pour une navigation, on tente la
        // page d'accueil déjà installée avant d'avouer l'échec.
        if (req.mode === "navigate") {
          return caches.match("index.html", { ignoreSearch: true })
            .then(function (p) { return p || pageDeSecours(); });
        }
        return pageDeSecours();
      });
    })
  );
});
