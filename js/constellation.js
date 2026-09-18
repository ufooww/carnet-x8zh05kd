/* La constellation — les 409 adresses situées du carnet, en trois dimensions.
 *
 * Ce qu'on montre n'est pas une idée du Japon : ce sont les coordonnées
 * relevées une par une, posées sur la courbure de la Terre, à leur place
 * exacte. Les adresses gardées s'allument en vermillon, de sorte que la
 * constellation devient la carte de ses propres envies.
 *
 * **Aucune dépendance.** Pas de Three.js, pas de WebGL : 409 points projetés
 * en perspective, c'est une trentaine de lignes de trigonométrie sur un canvas
 * 2D. Le carnet doit s'ouvrir sans réseau au Japon — chaque bibliothèque
 * embarquée serait un délai avant la première adresse, pour un rendu que
 * personne ne distinguerait.
 *
 * **La rotation est bornée.** Un globe qui tourne sur lui-même est beau trois
 * secondes, puis le Japon passe derrière et l'écran est vide. Ici l'archipel ne
 * se perd jamais : on l'incline, on ne le fait pas disparaître.
 */
(function () {
  "use strict";

  /* Une ville à la fois, et c'est la leçon de la première version.
   *
   * Vue d'ensemble, l'archipel donnait trois taches de trente pixels séparées
   * par du vide : 263 adresses tiennent dans 35 km à Tokyo, et l'écart
   * Tokyo–Kansai fait 400 km. Géographiquement exact, visuellement pauvre — et
   * surtout inutile, puisqu'on n'y distinguait rien.
   *
   * À l'échelle d'une ville, les mêmes points dessinent l'agglomération :
   * Shibuya, Shinjuku, Ginza se reconnaissent, la baie se devine par le vide.
   * C'est là que la donnée devient une image, et c'est là qu'on voit où sont
   * ses propres envies.
   */
  var CADRES = [
    { cle: "Tokyo", nom: "東京", lat: 35.68, lon: 139.74 },
    { cle: "Osaka", nom: "大阪", lat: 34.68, lon: 135.50 },
    { cle: "Kyoto", nom: "京都", lat: 35.01, lon: 135.77 }
  ];
  var LAT0 = 35.68, LON0 = 139.74;
  var RAYON = 148;          // rayon de la sphère, en unités de dessin
  var DIST = 560;           // éloignement de l'œil : plus il est grand, plus la
                            // perspective est douce. 560 donne du relief sans
                            // déformer les bords.
  /* Le grossissement n'est plus une constante : il se mesure sur les points
     de la ville affichée, au redimensionnement. Voir `redimensionner`. */
  /* Rotation maximale. À 49° l'agglomération se resserrait d'un tiers et les
     amas se confondaient : on n'y lisait plus rien. 34° donne la vue oblique
     d'une carte posée sur la table sans perdre la silhouette de la ville. */
  var LIMITE = 0.60;        // ~34° horizontalement
  var LIMITE_X = 0.42;      // ~24° verticalement

  function enRadians(d) { return d * Math.PI / 180; }

  /* Latitude et longitude vers un repère cartésien centré sur l'archipel.
     On applique deux rotations — une pour amener LON0 face à nous, une pour
     redresser LAT0 — ce qui place le centre du Japon droit devant l'œil. */
  function versEspace(lat, lon, lat0, lon0) {
    var phi = enRadians(lat), lam = enRadians(lon - lon0);
    var x = RAYON * Math.cos(phi) * Math.sin(lam);
    var y = RAYON * Math.sin(phi);
    var z = RAYON * Math.cos(phi) * Math.cos(lam);
    // Redressement de la latitude centrale.
    var a = enRadians(lat0);
    var y2 = y * Math.cos(a) - z * Math.sin(a);
    var z2 = y * Math.sin(a) + z * Math.cos(a);
    /* On retranche le rayon, et c'est le point qui décide de tout.
     *
     * Sans cela, le centre de la ville reste à z = 148 et la rotation se fait
     * **autour du centre de la Terre**. À l'échelle d'un archipel cela ne se
     * voyait pas ; à celle d'une ville, où le grossissement atteint 248, un
     * quart de radian projetait l'agglomération à huit mille pixels du cadre —
     * l'écran devenait blanc au premier geste.
     *
     * Ramenés à l'origine, les points tournent autour du centre de la ville.
     * La courbure locale subsiste — quelques dixièmes d'unité entre le centre
     * et les bords —, et c'est elle qui donne le relief quand on incline. */
    return { x: x, y: y2, z: z2 - RAYON };
  }

  function Constellation(toile, lieux, options) {
    this.toile = toile;
    this.ctx = toile.getContext("2d");
    this.opts = options || {};
    this.rx = 0; this.ry = 0;          // inclinaison courante
    this.vx = 0; this.vy = 0;          // vitesse résiduelle après un lâcher
    this.entree = 0;                   // 0 → 1 : les points se posent
    this.tourne = false;
    this.anime = null;
    this.points = [];

    var self = this;
    this.lieux = lieux;
    this.cadre = CADRES[0];
    this.cadrerSur(CADRES[0]);

    this.sobre = window.matchMedia &&
                 window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.brancherGestes();
    this.redimensionner();
    window.addEventListener("resize", function () { self.redimensionner(); });
  }

  /* Recentre la constellation sur une ville : on ne garde que ses adresses, et
     on refait la projection autour de son centre. Le zoom se recalcule après,
     dans `redimensionner`. */
  Constellation.prototype.cadrerSur = function (cadre) {
    this.cadre = cadre;
    this.points = [];
    var self = this;
    var lons = [];
    this.lieux.forEach(function (p) {
      if (p.lat == null || p.ville !== cadre.cle) return;
      var e = versEspace(p.lat, p.lon, cadre.lat, cadre.lon);
      /* L'élévation : le nombre de vidéos qui citent l'adresse.
       *
       * C'est la troisième dimension qui manquait — et elle est vraie. Une
       * hauteur inventée aurait été le torii en plastique qu'on a refusé ;
       * celle-ci dit quelque chose : **plus une adresse revient dans le
       * corpus, plus elle monte.** À Tokyo, 228 adresses restent au sol et 35
       * s'élèvent : une plaine et quelques pics, ce qui se lit bien en relief.
       *
       * Rapportée au rayon pour rester dans l'échelle du modèle : la valeur
       * absolue n'a pas de sens, seul compte l'écart entre le sol et les pics.
       */
      var cites = (p.srcs || []).length;
      self.points.push({
        lieu: p, x: e.x, y: e.y, z: e.z,
        // Le nombre d'étages ; leur hauteur en pixels est fixée plus tard,
        // dans `redimensionner`, car elle dépend du grossissement.
        etages: Math.min(Math.max(cites - 1, 0), 4),
        cites: cites, retard: 0
      });
      lons.push(p.lon);
    });
    /* Les quartiers, nommés au centre de leurs adresses.
     *
     * C'est ce qui fait passer la nuée au rang de carte : sans eux on admire,
     * avec eux on se repère. Seuls les plus fournis sont retenus — quatre
     * étiquettes, pas quarante — et **le nom de la ville est écarté** : à
     * Tokyo, soixante adresses portent « Tokyo » pour quartier, ce qui est un
     * fourre-tout et non un lieu.
     *
     * Réservés au plein écran : dans la vignette, il n'y a pas la place, et
     * quatre étiquettes de plus y feraient le bruit qu'on cherche à éviter.
     */
    this.quartiers = [];
    if (this.opts.avecQuartiers) {
      var par = {};
      this.points.forEach(function (p) {
        var q = p.lieu.quartier;
        if (!q || q === cadre.cle) return;
        // « Namba · Chuo-ku » et « Namba » désignent le même endroit.
        q = q.split("·")[0].trim();
        if (!q || q === cadre.cle) return;
        (par[q] = par[q] || []).push(p);
      });
      this.quartiers = Object.keys(par)
        .map(function (q) {
          var g = par[q], sx = 0, sy = 0, sz = 0;
          g.forEach(function (p) { sx += p.x; sy += p.y; sz += p.z; });
          return { nom: q, n: g.length,
                   x: sx / g.length, y: sy / g.length, z: sz / g.length, etages: 0 };
        })
        .filter(function (q) { return q.n >= 3; })
        .sort(function (a, b) { return b.n - a.n; })
        .slice(0, 5);
    }

    /* Les points se posent d'ouest en est, comme on lit une carte. Le retard
       est normalisé sur l'étendue réelle de la ville — écrit en dur, il ne
       vaudrait plus rien à l'échelle d'un arrondissement. */
    if (lons.length) {
      var lo = Math.min.apply(null, lons), hi = Math.max.apply(null, lons);
      var ec = (hi - lo) || 1;
      this.points.forEach(function (p) {
        p.retard = Math.min(Math.max((p.lieu.lon - lo) / ec, 0), 1);
      });
    }
    /* Une inclinaison d'entrée, et elle a une raison : à plat, la vue est
       d'aplomb et l'élévation pointe droit vers l'œil — le relief existe mais
       ne se voit pas. Vingt degrés suffisent à le révéler et à dire, sans un
       mot, que cette image se manipule. */
    this.rx = 0.34; this.ry = 0; this.vx = 0; this.vy = 0;
    if (this.l) { this.redimensionner(); }
  };

  Constellation.prototype.redimensionner = function () {
    var r = this.toile.getBoundingClientRect();
    var d = window.devicePixelRatio || 1;
    // Plafonné à 2 : au-delà, on quadruple le nombre de pixels à peindre pour
    // une différence que l'œil ne voit pas sur des disques de 3 px.
    d = Math.min(d, 2);
    this.toile.width = Math.round(r.width * d);
    this.toile.height = Math.round(r.height * d);
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
    this.l = r.width; this.h = r.height;
    /* Le grossissement se mesure sur les points eux-mêmes plutôt que sur une
       étendue écrite à la main. Deux raisons : les constantes étaient fausses
       (95 % des adresses tiennent dans 1,3° de latitude, pas 9,5 — Sapporo et
       Fukuoka sont des points isolés qui étiraient le calcul), et un carnet
       qui gagne des adresses ailleurs se recadrerait tout seul. */
    var self = this;
    var sauveY = this.ry, sauveX = this.rx;
    this.ry = 0; this.rx = 0; this.zoom = 1;
    var xs = [], ys = [];
    this.points.forEach(function (p) {
      var e = self.projeter(p);
      xs.push(e.x - self.l / 2); ys.push(e.y - self.h / 2);
    });
    this.ry = sauveY; this.rx = sauveX;

    /* On cadre sur les percentiles, pas sur les extrêmes. **Un seul point
       étranglait tout le reste** : Sapporo, à 7,6° au nord du centre, imposait
       un grossissement de 3 là où les trois villes du voyage en supportent 10
       — l'archipel restait une tache de cent pixels au milieu du cadre.
       Les quelques adresses lointaines (Sapporo, Fukuoka, Hiroshima : huit sur
       409) sortent donc du cadre de cette vue. Elles ne sont pas perdues —
       elles restent dans la liste et sur la carte —, et la constellation
       montre ce qu'elle doit montrer : le voyage. */
    function borne(v, p) {
      var t = v.slice().sort(function (a, b) { return a - b; });
      return t[Math.min(t.length - 1, Math.max(0, Math.round((t.length - 1) * p)))];
    }
    /* Le percentile de rejet. Dans la vignette on garde presque tout ; en
       plein écran on resserre sur la masse : à Tokyo, une poignée d'adresses
       excentrées — Odaiba, Kichijoji, la banlieue ouest — étirent le cadre au
       point que les 200 adresses du centre tiennent dans un quart de l'écran.
       Elles sortent donc du champ ici, et restent dans la liste et sur la
       carte, comme Sapporo à l'échelle de l'archipel. */
    var rejet = this.opts.rejet || 0.015;
    var demiL = Math.max(Math.abs(borne(xs, rejet)), Math.abs(borne(xs, 1 - rejet)));
    var demiH = Math.max(Math.abs(borne(ys, rejet)), Math.abs(borne(ys, 1 - rejet)));
    /* Le taux de remplissage dépend de l'usage. Dans la vignette on garde de
       la marge pour incliner sans sortir du cadre ; en plein écran, où la
       toile est deux fois plus haute que large alors que l'agglomération est
       large et basse, le même réglage laissait les trois quarts de l'écran
       vides. On y remplit donc la largeur franchement. */
    var remplL = this.opts.remplissage || 0.74;
    var remplH = this.opts.remplissageH || 0.58;
    this.zoom = Math.min((this.l * remplL) / (demiL * 2 || 1),
                         (this.h * remplH) / (demiH * 2 || 1));

    /* La hauteur d'un étage, en unités du modèle, pour qu'il paraisse à
       l'écran comme une fraction fixe du cadre.
       Écrite en dur, elle valait 0,34 unité — multipliée par un grossissement
       qui atteint 337, cela donnait des tiges de 150 px qui écrasaient la
       ville. Elle se déduit donc du grossissement et de l'inclinaison : un
       étage vaut 4,5 % de la hauteur du cadre une fois projeté. */
    var pente = Math.sin(0.34) || 0.334;   // l'inclinaison d'entrée
    this.uniteHaut = (this.h * 0.045) / (pente * (this.zoom || 1));

    this.dessiner();
  };

  /* Projection : rotation selon les deux axes, puis perspective.
     `sansHaut` projette le point ramené au sol — c'est ce qui permet de tracer
     la tige qui rend l'élévation lisible. */
  Constellation.prototype.projeter = function (p, sansHaut) {
    /* L'altitude s'ajoute sur z, la normale locale à la sphère : la vue est
       celle d'une carte regardée d'aplomb, où la hauteur pointe vers l'œil.
       De face elle ne se voit donc pas — elle se révèle quand on incline, et
       c'est précisément ce qui donne au geste une raison d'être. */
    var pz = p.z + (sansHaut ? 0 : (p.etages || 0) * (this.uniteHaut || 0));
    var cy = Math.cos(this.ry), sy = Math.sin(this.ry);
    var x1 = p.x * cy + pz * sy;
    var z1 = -p.x * sy + pz * cy;
    var cx = Math.cos(this.rx), sx = Math.sin(this.rx);
    var y2 = p.y * cx - z1 * sx;
    var z2 = p.y * sx + z1 * cx;
    var k = DIST / (DIST - z2);
    var g = this.zoom || 1;
    /* Le centre de l'archipel est à z = RAYON une fois amené face à l'œil : on
       le ramène à l'origine avant de grossir, sinon le grossissement pousserait
       tout le dessin hors du cadre. */
    return { x: this.l / 2 + x1 * k * g, y: this.h / 2 - y2 * k * g, k: k, z: z2 };
  };

  Constellation.prototype.dessiner = function () {
    var ctx = this.ctx;
    if (!this.l || !this.h) return;
    ctx.clearRect(0, 0, this.l, this.h);

    /* Les couleurs se lisent sur la toile, pas sur la racine. La différence
       n'est pas cosmétique : le ciel redéfinit `--texte`, `--texte-faible` et
       `--fond-carte` pour lui seul, en CSS, et le dessin suit sans qu'une
       valeur soit écrite en dur ici. Sur la racine, les points reprenaient
       l'encre du papier — gris sur ivoire, une poussière. */
    var style = getComputedStyle(this.toile);
    var encre = style.getPropertyValue("--texte").trim() || "#1f1d19";
    var accent = style.getPropertyValue("--accent").trim() || "#c4351d";
    var faible = style.getPropertyValue("--texte-faible").trim() || "#766d61";
    var fondCarte = style.getPropertyValue("--fond-carte").trim() || "#fffdf8";
    /* Sur un ciel sombre, deux adresses voisines ne doivent pas se recouvrir :
       elles doivent s'additionner. C'est ce qui transforme la densité de
       Shibuya en lueur au lieu d'une tache — et c'est le comportement d'un
       vrai ciel. Sur fond clair, la fusion additive éclaircirait les points
       jusqu'à les effacer : le mode reste commandé par le CSS. */
    var additif = style.getPropertyValue("--additif").trim() === "1";

    var self = this;
    var vus = this.points.map(function (p) {
      var e = self.projeter(p);
      return { p: p, e: e };
    });
    // Les points du fond se peignent d'abord : les proches les recouvrent.
    vus.sort(function (a, b) { return a.e.z - b.e.z; });

    /* La profondeur se mesure sur l'écart réellement observé, pas sur des
       bornes écrites à la main. L'archipel est petit devant la sphère : `k` n'y
       varie que de quelques centièmes, et des bornes fixes faisaient saturer
       tous les points à la même taille — le relief disparaissait. Recalculées à
       chaque image, elles suivent aussi l'inclinaison, qui creuse l'écart. */
    var zMin = Infinity, zMax = -Infinity;
    vus.forEach(function (v) {
      if (v.e.z < zMin) zMin = v.e.z;
      if (v.e.z > zMax) zMax = v.e.z;
    });
    var etendueZ = zMax - zMin;
    if (etendueZ < 1e-6) etendueZ = 1;

    var t = this.entree;
    vus.forEach(function (v) {
      // Chaque point attend son tour, puis se pose en 0,45 de la durée totale.
      var a = (t - v.p.retard * 0.55) / 0.45;
      if (a <= 0) return;
      if (a > 1) a = 1;

      var garde = self.opts.estGarde && self.opts.estGarde(v.p.lieu);
      // La profondeur se lit au rayon et à l'opacité — jamais à la teinte :
      // la couleur, ici, ne dit qu'une chose, « je l'ai gardée ».
      /* Points fins et translucides, et c'est tout le sujet.
         Tokyo porte 263 adresses dans quelques kilomètres : peints en disques
         opaques, ils formaient une tache d'encre d'où rien ne ressortait. À
         1,3 px et 20 % d'opacité, les points s'additionnent — la densité se
         lit comme une nuée qui s'éclaircit vers ses bords, et l'on retrouve
         Shibuya, Shinjuku et Ginza au lieu d'un pâté.
         Les adresses gardées échappent à la règle : elles doivent se voir. */
      var prof = (v.e.z - zMin) / etendueZ;
      /* Une adresse qui revient dans plusieurs vidéos est plus haute **et**
         un peu plus marquée : la hauteur seule se perd de face, où l'on
         regarde la carte d'aplomb. */
      var revient = Math.min(Math.max(v.p.cites - 1, 0), 4) * 0.22;
      /* Les points ont doublé le 16/09. Le réglage d'origine — 0,9 px et 20 %
         d'opacité — répondait à un vrai problème : 263 adresses serrées dans
         un cadre de 300 px formaient une tache d'encre. **Le cadre a changé.**
         À 118 % de la largeur et cadré sur la masse, le grossissement a
         doublé : les mêmes points sont deux fois plus espacés, et ce qui
         faisait un pâté fait maintenant une constellation trop fine.
         Une valeur juste dépend de la place disponible, pas du goût. */
      var r = garde ? 3.4 + prof * 1.7 : 1.7 + prof * 1.5 + revient * 1.3;
      /* Le plancher d'opacité dépend du fond, et c'est tout le sujet. Sur
         l'ivoire, une encre à 11 % se voit encore. Sur l'indigo, un point
         ivoire à 11 % n'existe pas : il faut partir de 22 %, la fusion
         additive se chargeant du reste dans les amas. */
      var plancher = additif ? 0.22 : 0.11;
      var pente = additif ? 0.22 : 0.16;
      var opacite = (garde ? 0.8 + prof * 0.2
                           : plancher + prof * pente + revient * 0.22) * a;

      // Les points arrivent de plus loin que leur place : ils se posent.
      var glisse = self.sobre ? 0 : (1 - a) * 26;

      /* La tige. Sans elle une élévation ne se lit pas : le point paraît
         simplement déplacé, et l'on ne sait pas d'où il vient. Le fil qui le
         relie au sol dit « celui-ci est plus haut », et c'est ce qui rend le
         relief intelligible dès qu'on incline. Seules les adresses citées
         plusieurs fois en portent une — au sol, il n'y a rien à montrer. */
      if (v.p.etages > 0) {
        var sol = self.projeter(v.p, true);
        ctx.globalAlpha = (garde ? 0.5 : 0.2) * a;
        ctx.strokeStyle = garde ? accent : encre;
        ctx.lineWidth = garde ? 1.1 : 0.7;
        ctx.beginPath();
        ctx.moveTo(sol.x, sol.y + glisse);
        ctx.lineTo(v.e.x, v.e.y + glisse);
        ctx.stroke();
      }

      ctx.globalAlpha = garde ? Math.min(1, opacite + 0.3) : opacite;
      ctx.fillStyle = garde ? accent : encre;
      if (additif) { ctx.globalCompositeOperation = "lighter"; }
      ctx.beginPath();
      ctx.arc(v.e.x, v.e.y + glisse, r, 0, 6.2832);
      ctx.fill();
      if (additif) { ctx.globalCompositeOperation = "source-over"; }

      if (garde) {
        // Un halo léger, pour que ses adresses se repèrent dans l'amas de Tokyo.
        ctx.globalAlpha = 0.16 * a;
        ctx.beginPath();
        ctx.arc(v.e.x, v.e.y + glisse, r + 5, 0, 6.2832);
        ctx.fill();
      }
    });

    /* Plus de noms de villes peints sur la toile : on est à l'échelle d'une
       seule agglomération, et son nom est porté par le sélecteur juste en
       dessous. Les écrire ici les ferait doubler. */

    /* Les quartiers, posés au centre de leurs adresses. Discrets : ils situent
       sans disputer la vedette aux points. */
    if (this.quartiers && this.quartiers.length && t > 0.7) {
      var aQ = Math.min((t - 0.7) / 0.3, 1);
      ctx.font = '11.5px ' + (this.opts.police || "-apple-system, sans-serif");
      ctx.textAlign = "center";
      ctx.fillStyle = faible;
      /* Shibuya et Harajuku sont à un kilomètre l'un de l'autre : leurs
         étiquettes se chevauchaient. On les décale verticalement de proche en
         proche — le plus fourni garde sa place, les suivants s'écartent. */
      var poses = [];
      this.quartiers.forEach(function (q) {
        var e = self.projeter(q);
        var y = e.y - 12;
        for (var i = 0; i < poses.length; i++) {
          if (Math.abs(poses[i].x - e.x) < 62 && Math.abs(poses[i].y - y) < 15) {
            y = poses[i].y + 15;
            i = -1;   // la nouvelle place peut heurter une autre étiquette
          }
        }
        poses.push({ x: e.x, y: y });
        ctx.globalAlpha = 0.66 * aQ;
        ctx.fillText(q.nom, e.x, y);
      });
    }

    /* Le nom de l'adresse survolée ou touchée.
       On savait qu'on pouvait toucher un point ; on ne savait pas lequel, ni
       ce qu'on allait ouvrir. Le nom paraît avant le geste, jamais après. */
    if (this.vise) {
      var ev = this.projeter(this.vise);
      var p = this.vise.lieu;
      var titre = p.nom + (p.jp ? "  " + p.jp : "");
      ctx.font = '600 12.5px ' + (this.opts.police || "-apple-system, sans-serif");
      ctx.textAlign = "center";
      var larg = ctx.measureText(titre).width;
      // L'étiquette reste dans le cadre même si le point est au bord.
      var cx = Math.min(Math.max(ev.x, larg / 2 + 8), this.l - larg / 2 - 8);
      var cy = ev.y - 16;
      if (cy < 16) cy = ev.y + 26;

      ctx.globalAlpha = 0.94;
      ctx.fillStyle = fondCarte;
      var bx = cx - larg / 2 - 7, by = cy - 13, bl = larg + 14, bh = 19;
      if (ctx.roundRect) {
        ctx.beginPath(); ctx.roundRect(bx, by, bl, bh, 4); ctx.fill();
      } else {
        ctx.fillRect(bx, by, bl, bh);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = encre;
      ctx.fillText(titre, cx, cy);

      // Le point visé s'entoure, pour qu'on sache lequel répondra.
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = accent; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(ev.x, ev.y, 8, 0, 6.2832); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  /* La boucle ne tourne que lorsqu'il se passe quelque chose : l'entrée, un
     doigt posé, ou l'inertie qui s'éteint. Une constellation qui tournerait en
     permanence viderait la batterie d'un téléphone de voyage. */
  Constellation.prototype.boucler = function () {
    if (this.anime) return;
    var self = this;
    var precedent = performance.now();
    (function pas(t) {
      var dt = Math.min((t - precedent) / 1000, 0.05);
      precedent = t;
      var occupe = false;

      if (self.entree < 1) {
        self.entree += dt / (self.sobre ? 0.25 : 1.5);
        if (self.entree > 1) self.entree = 1;
        occupe = true;
      }
      if (!self.tourne && (Math.abs(self.vx) > 0.0004 || Math.abs(self.vy) > 0.0004)) {
        self.ry += self.vy * dt * 60;
        self.rx += self.vx * dt * 60;
        self.vy *= 0.94; self.vx *= 0.94;   // l'inertie s'éteint
        self.borner();
        occupe = true;
      }
      self.dessiner();

      /* Page masquée : on arrête la boucle — une animation invisible ne fait
         que consommer de la batterie. Mais on **termine l'entrée d'un coup**
         avant de sortir, sinon la constellation reste à l'état où elle était,
         c'est-à-dire vide si rien n'avait encore commencé.
         Bug constaté le 14/09 : le carnet chargé en arrière-plan gardait un
         ciel désespérément vide, parce que la boucle s'arrêtait au premier
         tour et que rien ne la relançait. */
      if (document.hidden && self.entree < 1) {
        self.entree = 1;
        self.dessiner();
      }
      if (occupe && !document.hidden) { self.anime = requestAnimationFrame(pas); }
      else { self.anime = null; }
    })(precedent);
  };

  /* L'archipel ne se perd jamais : passé la limite, il revient élastiquement. */
  Constellation.prototype.borner = function () {
    if (this.ry > LIMITE) { this.ry = LIMITE; this.vy = 0; }
    if (this.ry < -LIMITE) { this.ry = -LIMITE; this.vy = 0; }
    if (this.rx > LIMITE_X) { this.rx = LIMITE_X; this.vx = 0; }
    if (this.rx < -LIMITE_X) { this.rx = -LIMITE_X; this.vx = 0; }
  };

  /* L'adresse la plus proche d'un point de l'écran, si elle est assez près
     pour que le geste soit sans ambiguïté. C'est ce qui fait la différence
     entre une image et un outil : on touche une adresse, elle s'ouvre. */
  Constellation.prototype.pointEn = function (cx, cy) {
    var r = this.toile.getBoundingClientRect();
    var x = cx - r.left, y = cy - r.top;
    var self = this, meilleur = null, dMin = 22 * 22;   // 22 px de tolérance
    this.points.forEach(function (p) {
      var e = self.projeter(p);
      var dx = e.x - x, dy = e.y - y;
      var d = dx * dx + dy * dy;
      if (d < dMin) { dMin = d; meilleur = p; }
    });
    return meilleur;
  };

  /* Retient le point sous le curseur, pour que son nom se peigne. Ne redessine
     que si la cible a changé — sans quoi chaque pixel parcouru repeindrait
     263 points pour rien. */
  Constellation.prototype.viser = function (cx, cy) {
    var p = (cx == null) ? null : this.pointEn(cx, cy);
    if (p === this.vise) return;
    this.vise = p;
    this.dessiner();
  };

  Constellation.prototype.brancherGestes = function () {
    var self = this, actif = false, px = 0, py = 0, bouge = 0;

    function debut(e) {
      actif = true; self.tourne = true; bouge = 0;
      var t = e.touches ? e.touches[0] : e;
      px = t.clientX; py = t.clientY;
      self.vx = self.vy = 0;
    }
    function deplacer(e) {
      if (!actif) return;
      var t = e.touches ? e.touches[0] : e;
      var dx = t.clientX - px, dy = t.clientY - py;
      px = t.clientX; py = t.clientY;
      bouge += Math.abs(dx) + Math.abs(dy);
      self.ry += dx * 0.006;
      self.rx -= dy * 0.004;
      self.borner();
      self.vy = dx * 0.006; self.vx = -dy * 0.004;
      // On ne confisque le défilement de la page que si le geste est
      // franchement horizontal : sinon on empêcherait de faire défiler
      // l'accueil en posant le doigt sur la constellation.
      if (e.cancelable && Math.abs(dx) > Math.abs(dy)) e.preventDefault();
      self.dessiner();
    }
    function fin(e) {
      if (!actif) return;
      actif = false; self.tourne = false;
      /* Un doigt qui n'a pas bougé de plus de six pixels n'a pas voulu tourner
         la constellation : il a désigné une adresse. Le seuil sépare le geste
         du tremblement — sans lui, toute rotation finirait par ouvrir une
         fiche au hasard. */
      if (bouge < 6 && self.opts.surChoix) {
        var t = (e && e.changedTouches) ? e.changedTouches[0] : e;
        var cible = t ? self.pointEn(t.clientX, t.clientY) : null;
        if (cible) { self.vise = null; self.opts.surChoix(cible.lieu); return; }
      }
      self.boucler();
    }

    this.toile.addEventListener("pointerdown", debut);
    window.addEventListener("pointermove", deplacer, { passive: false });
    window.addEventListener("pointerup", fin);
    window.addEventListener("pointercancel", fin);

    /* Le nom paraît sous le curseur avant qu'on clique — à la souris, où le
       survol existe. Au doigt, il paraît dès qu'on pose : `pointerdown` vise
       avant que le geste ne soit qualifié, et l'on sait ce qu'on s'apprête à
       ouvrir sans avoir à l'ouvrir. */
    this.toile.addEventListener("pointermove", function (e) {
      if (actif) return;                       // on est en train de tourner
      if (e.pointerType === "touch") return;   // au doigt, c'est `pointerdown`
      self.viser(e.clientX, e.clientY);
    });
    this.toile.addEventListener("pointerleave", function () { self.viser(null); });
    this.toile.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch") self.viser(e.clientX, e.clientY);
    });

    /* Au clavier : les flèches inclinent la constellation. Sans cela, elle
       serait le seul élément du carnet qu'on ne peut pas manœuvrer sans
       écran tactile. */
    this.toile.addEventListener("keydown", function (e) {
      var pas = 0.12, fait = true;
      if (e.key === "ArrowLeft") { self.ry -= pas; }
      else if (e.key === "ArrowRight") { self.ry += pas; }
      else if (e.key === "ArrowUp") { self.rx -= pas; }
      else if (e.key === "ArrowDown") { self.rx += pas; }
      else { fait = false; }
      if (!fait) return;
      e.preventDefault();
      self.borner();
      self.dessiner();
    });
  };

  Constellation.prototype.demarrer = function () {
    this.entree = 0;
    var self = this;

    /* Deux filets de sécurité, parce qu'un ciel vide est le pire des rendus.
     *
     * 1. Au retour de la page, on redessine — et l'on rejoue l'entrée si elle
     *    n'avait jamais eu lieu. Sans cela, un carnet chargé pendant que le
     *    téléphone était verrouillé n'aurait jamais de constellation.
     * 2. Une seconde après le démarrage, si rien n'a bougé, on pose les points
     *    sans animation. C'est le cas d'un navigateur qui ne fait pas tourner
     *    `requestAnimationFrame` — on préfère une constellation immobile à
     *    aucune constellation.
     */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      if (self.entree < 1) { self.entree = 0; self.boucler(); }
      else { self.dessiner(); }
    });

    setTimeout(function () {
      if (self.entree === 0) { self.entree = 1; self.dessiner(); }
    }, 1000);

    this.boucler();
  };

  /* Redessine sans rejouer l'entrée — appelé quand une envie change. */
  Constellation.prototype.rafraichir = function () {
    if (this.entree < 1) return;     // l'entrée s'en chargera
    this.dessiner();
  };

  Constellation.CADRES = CADRES;
  window.Constellation = Constellation;
})();
