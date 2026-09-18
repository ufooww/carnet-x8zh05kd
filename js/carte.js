/* Moteur de carte — carnet Japon. Réécrit le 02/09/2026, sans bibliothèque.
 *
 * La version précédente posait tuiles et épingles à leur position absolue dans
 * le monde, puis déplaçait un calque par `transform`. Élégant sur le papier,
 * fragile en pratique : au zoom 17 le monde fait 33 millions de pixels, la
 * limite de l'unité de mise en page du navigateur, et tout saturait ; le centre
 * et le zoom pouvaient se désynchroniser ; et le moindre correctif en amenait
 * un autre.
 *
 * **Principe de cette version : rien n'est jamais exprimé en pixels du monde.**
 *
 * Un point est d'abord projeté en Mercator dans le carré unité [0,1] — un
 * calcul en flottants, sans échelle, donc sans limite de précision. Sa position
 * à l'écran est ensuite l'écart au centre de la vue, multiplié par l'échelle
 * courante :
 *
 *     xEcran = (X(point) − X(centre)) × 256 × 2^zoom + largeur / 2
 *
 * Les nombres manipulés sont de l'ordre de la taille de l'écran, jamais plus.
 * Tuiles et épingles passent par la **même** fonction : elles ne peuvent pas
 * dériver l'une par rapport à l'autre, ce qui était le défaut visible — les
 * adresses qui bougent quand on déplace la carte.
 *
 * Il n'y a plus de calque transformé : chaque élément est positionné
 * directement. Avec une quarantaine de tuiles et quelques centaines
 * d'épingles, le coût est négligeable et le comportement devient prévisible.
 */

(function (global) {
  "use strict";

  var TAILLE = 256;                    // côté d'une tuile, en pixels
  var RAYON_GROUPE = 44;               // px : en deçà, deux épingles se cachent

  /* ---------- projection Mercator, dans le carré unité ------------------- */

  function projX(lon) {
    return (lon + 180) / 360;
  }
  function projY(lat) {
    var r = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
  }
  function lonDeX(x) {
    return x * 360 - 180;
  }
  function latDeY(y) {
    var n = Math.PI * (1 - 2 * y);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  /* ---------- la carte ---------------------------------------------------- */

  function Carte(hote, options) {
    options = options || {};
    this.hote = hote;
    this.z = options.zoom || 12;
    this.lat = options.lat === undefined ? 35.68 : options.lat;
    this.lon = options.lon === undefined ? 139.76 : options.lon;
    this.zoomMin = options.zoomMin || 3;
    this.zoomMax = options.zoomMax || 18;

    this.points = [];
    this.surClic = options.surClic || function () {};
    this.surPosition = options.surPosition || function () {};

    // Deux façons d'obtenir une tuile, et le moteur ignore d'où elles viennent.
    //
    // `gabarit` : une URL à trous, le cas ordinaire. {s} est tiré des
    // sous-domaines, ce qui permet au navigateur d'ouvrir plus de connexions
    // en parallèle et accélère nettement le premier affichage.
    //
    // `sourceTuile` : une fonction (z, x, y) -> Promise<{url, dz, dx, dy}>,
    // pour les tuiles qui viennent d'une archive locale. Elle a la priorité.
    // Serveur de la communauté OpenStreetMap japonaise. Choisi après avoir
    // essuyé deux refus : OpenStreetMap central répond « access denied » aux
    // applications tierces, et CARTO exige désormais une clé — ses tuiles
    // arrivent barrées d'un « API KEY REQUIRED ». Celui-ci répond à tous les
    // niveaux jusqu'à 19, sans clé, et son rendu est fait pour le Japon : les
    // gares, les quartiers et les numéros de sortie y figurent.
    this.gabarit = options.tuiles ||
      "https://tile.openstreetmap.jp/{z}/{x}/{y}.png";
    this.sousDomaines = options.sousDomaines || ["a", "b", "c"];
    this.sourceTuile = options.sourceTuile || null;

    this._tuiles = {};        // clé "z/x/y" -> élément
    this._groupes = [];       // résultat du regroupement, au zoom _zGroupes
    this._zGroupes = null;
    this._elGroupes = [];     // éléments d'épingle en place
    this._position = null;    // dernier relevé GPS
    this._veille = null;
    this._imageAttendue = 0;  // sert à ignorer les tuiles hors saison

    this._construire();
    this._brancher();
    this.rendre();
  }

  Carte.prototype._construire = function () {
    var h = this.hote;
    h.classList.add("jp-carte");
    h.innerHTML =
      '<div class="jp-tuiles"></div>' +
      '<div class="jp-epingles"></div>' +
      '<div class="jp-position"></div>' +
      '<div class="jp-zoom">' +
        '<button type="button" data-d="1" aria-label="Zoomer">+</button>' +
        '<button type="button" data-d="-1" aria-label="Dézoomer">−</button>' +
      '</div>' +
      '<button type="button" class="jp-moi" aria-label="Ma position">◉</button>' +
      '<div class="jp-credit">&copy; <a href="https://www.openstreetmap.org/copyright" ' +
        'target="_blank" rel="noopener">OpenStreetMap</a> &middot; tuiles ' +
        '<a href="https://openstreetmap.jp/" target="_blank" ' +
        'rel="noopener">OSM Japon</a></div>';
    this.cTuiles = h.querySelector(".jp-tuiles");
    this.cEpingles = h.querySelector(".jp-epingles");
    this.cPosition = h.querySelector(".jp-position");
  };

  /* ---------- géométrie de la vue ---------------------------------------- */

  /* Tout part d'ici. `echelle` est le nombre de pixels que couvre le carré
   * unité de la projection au zoom courant. */
  Carte.prototype._vue = function () {
    var r = this.hote.getBoundingClientRect();
    return {
      l: r.width, h: r.height,
      echelle: TAILLE * Math.pow(2, this.z),
      cx: projX(this.lon), cy: projY(this.lat)
    };
  };

  /** Position à l'écran d'un couple (lat, lon). */
  Carte.prototype.versEcran = function (lat, lon, v) {
    v = v || this._vue();
    return {
      x: (projX(lon) - v.cx) * v.echelle + v.l / 2,
      y: (projY(lat) - v.cy) * v.echelle + v.h / 2
    };
  };

  /** Opération inverse : ce que désigne un point de l'écran. */
  Carte.prototype.depuisEcran = function (px, py, v) {
    v = v || this._vue();
    return {
      lon: lonDeX(v.cx + (px - v.l / 2) / v.echelle),
      lat: latDeY(v.cy + (py - v.h / 2) / v.echelle)
    };
  };

  /* ---------- rendu -------------------------------------------------------- */

  Carte.prototype.rendre = function () {
    var self = this;
    var v = this._vue();
    if (!v.l || !v.h) {
      // Conteneur sans dimensions : onglet en arrière-plan, mise en page pas
      // encore faite. On reprend à la frame suivante — `requestAnimationFrame`
      // ne s'exécute pas tant que la page est cachée, donc rien ne tourne à
      // vide, et le rendu se fait exactement au retour à l'écran.
      if (!this._attente) {
        this._attente = true;
        requestAnimationFrame(function () { self._attente = false; self.rendre(); });
      }
      return;
    }

    this._rendreTuiles(v);
    this._rendreEpingles(v);
    this._rendrePosition(v);
  };

  Carte.prototype._rendreTuiles = function (v) {
    var self = this;
    var zt = Math.max(0, Math.round(this.z));
    var n = Math.pow(2, zt);
    var cote = v.echelle / n;                 // taille écran d'une tuile

    // Bornes des tuiles visibles, avec une tuile de marge : sans elle, un bord
    // reste gris pendant un glissement.
    var x0 = Math.floor((v.cx - (v.l / 2) / v.echelle) * n) - 1;
    var x1 = Math.floor((v.cx + (v.l / 2) / v.echelle) * n) + 1;
    var y0 = Math.max(0, Math.floor((v.cy - (v.h / 2) / v.echelle) * n) - 1);
    var y1 = Math.min(n - 1, Math.floor((v.cy + (v.h / 2) / v.echelle) * n) + 1);

    var vues = {};
    for (var x = x0; x <= x1; x++) {
      // Le monde boucle en longitude : la tuile −1 est la dernière du tour.
      var xt = ((x % n) + n) % n;
      for (var y = y0; y <= y1; y++) {
        var cle = zt + "/" + xt + "/" + y + "@" + x;
        vues[cle] = true;
        var el = this._tuiles[cle];
        if (!el) {
          el = document.createElement("div");
          el.className = "jp-tuile";
          this.cTuiles.appendChild(el);
          this._tuiles[cle] = el;
          this._demanderTuile(el, zt, xt, y);
        }
        // Position recalculée à chaque rendu, comme pour les épingles : c'est
        // ce qui garantit qu'elles ne peuvent pas se décaler entre elles.
        el.style.left = ((x / n - v.cx) * v.echelle + v.l / 2) + "px";
        el.style.top = ((y / n - v.cy) * v.echelle + v.h / 2) + "px";
        el.style.width = cote + "px";
        el.style.height = cote + "px";
      }
    }
    for (var k in this._tuiles) {
      if (!vues[k]) { this._tuiles[k].remove(); delete this._tuiles[k]; }
    }
  };

  Carte.prototype._demanderTuile = function (el, z, x, y) {
    var self = this;
    if (!this.sourceTuile) {
      el.style.backgroundImage = 'url("' + this.gabarit
        .replace("{s}", this.sousDomaines[(x + y) % this.sousDomaines.length])
        .replace("{z}", z).replace("{x}", x).replace("{y}", y) + '")';
      el.style.backgroundSize = "100% 100%";
      el.style.backgroundPosition = "0 0";
      return;
    }
    this.sourceTuile(z, x, y).then(function (r) {
      // L'élément a pu être purgé pendant que la tuile arrivait.
      if (!el.isConnected || !r) return;
      el.style.backgroundImage = 'url("' + r.url + '")';
      if (r.dz) {
        // Fragment d'une tuile de `dz` niveaux au-dessus : on affiche la
        // parente à 2^dz fois sa taille et on ne montre que le carré voulu.
        // C'est ce qui permet de zoomer au-delà de ce que l'archive contient.
        //
        // ⚠️ `background-position` en pourcentage n'est **pas** un décalage :
        // il aligne le point p% de l'image sur le point p% du cadre. Avec une
        // image agrandie f fois, elle dépasse de (f−1) cadres, et le
        // pourcentage p la déplace de p × (f−1) cadres. Pour montrer la case
        // `dx` il faut donc p = dx / (f − 1). Écrire −dx × 100 % plaçait le
        // fragment hors de l'image et laissait la tuile vide : c'est ce qui
        // noircissait la carte dès qu'on dépassait le niveau 15.
        var f = 1 << r.dz;
        el.style.backgroundSize = (f * 100) + "% " + (f * 100) + "%";
        el.style.backgroundPosition =
          (r.dx / (f - 1) * 100) + "% " + (r.dy / (f - 1) * 100) + "%";
        el.dataset.agrandie = r.dz;
      } else {
        el.style.backgroundSize = "100% 100%";
        el.style.backgroundPosition = "0 0";
      }
    }, function () {});
  };

  /* ---------- regroupement et épingles -------------------------------------- */

  /* Le regroupement dépend du zoom, pas du déplacement : on ne le recalcule
   * donc qu'au changement de zoom. Le refaire à chaque image ferait clignoter
   * les groupes sous le doigt pendant un glissement — c'est le défaut que
   * Paco a signalé. */
  Carte.prototype._regrouper = function () {
    var zt = Math.round(this.z * 2) / 2;
    if (this._zGroupes === zt && this._groupes.length) return;
    this._zGroupes = zt;

    var echelle = TAILLE * Math.pow(2, zt);
    var entrees = [];
    this.points.forEach(function (p, i) {
      if (p.lat == null || p.lon == null) return;
      entrees.push({ p: p, i: i, x: projX(p.lon) * echelle, y: projY(p.lat) * echelle });
    });

    this._groupes = (global.Groupes ? global.Groupes.grouper(entrees, RAYON_GROUPE)
                                    : entrees.map(function (e) {
                                        return { type: "point", e: e, x: e.x, y: e.y };
                                      }))
      .map(function (g) {
        // On repasse en latitude/longitude : le groupe redevient un lieu, et
        // son affichage suit alors exactement la même route que tout le reste.
        return {
          type: g.type,
          membres: g.membres ? g.membres.map(function (m) { return m.p; }) : null,
          e: g.e || null,
          lat: latDeY(g.y / echelle), lon: lonDeX(g.x / echelle)
        };
      });
    this._elGroupes = [];
    this.cEpingles.innerHTML = "";
  };

  Carte.prototype._rendreEpingles = function (v) {
    var self = this;
    this._regrouper();

    if (!this._elGroupes.length && this._groupes.length) {
      this._groupes.forEach(function (g) {
        var el;
        if (g.type === "groupe") {
          el = document.createElement("button");
          el.type = "button";
          el.className = "jp-groupe";
          if (g.membres.length > 24) el.classList.add("jp-gros");
          el.textContent = g.membres.length;
          el.title = g.membres.slice(0, 6).map(function (p) { return p.nom; }).join(", ") +
                     (g.membres.length > 6 ? "…" : "");
          el.addEventListener("click", function (ev) {
            ev.stopPropagation();
            self.allerA(g.lat, g.lon, Math.min(self.zoomMax, Math.round(self.z) + 2));
          });
        } else {
          var p = g.e.p;
          el = document.createElement("button");
          el.type = "button";
          el.className = "jp-epingle jp-cat-" + (p.cat || "").toLowerCase()
            .normalize("NFD").replace(/[^a-z]/g, "");
          if (p.prec === "quartier") el.classList.add("jp-approx");
          el.title = p.nom + (p.prec === "quartier" ? " — position approximative" : "");
          /* La forme dans la goutte. La couleur disait déjà la catégorie, mais
             il fallait connaître la légende ; une silhouette se reconnaît
             sans l'avoir apprise. Si la catégorie est inconnue, `pour` rend
             une chaîne vide et la pastille reste nue — jamais de point
             d'interrogation sur une carte. */
          el.innerHTML = '<span class="jp-pastille">' +
            (window.Icones ? window.Icones.pour(p.cat) : "") + "</span>";
          el.addEventListener("click", function (ev) {
            ev.stopPropagation();
            self.mettreEnAvant(g.e.i);
            self.surClic(p, g.e.i);
          });
        }
        self.cEpingles.appendChild(el);
        self._elGroupes.push({ g: g, el: el });
      });
    }

    // Positionnement : même calcul que les tuiles, donc aucune dérive possible.
    var marge = 80;
    this._elGroupes.forEach(function (m) {
      var e = self.versEcran(m.g.lat, m.g.lon, v);
      // La position est écrite **dans tous les cas**, y compris pour une
      // épingle hors champ : sinon elle réapparaît un instant à son ancienne
      // place avant d'être corrigée, ce qui se voit comme un saut au bord de
      // l'écran pendant un glissement.
      m.el.style.left = e.x + "px";
      m.el.style.top = e.y + "px";
      // Hors champ : on la retire de l'affichage, sans quoi des centaines
      // d'éléments pèsent sur la mise en page à chaque image.
      var dehors = e.x < -marge || e.x > v.l + marge ||
                   e.y < -marge || e.y > v.h + marge;
      if (dehors !== !!m.cache) {
        m.el.style.display = dehors ? "none" : "";
        m.cache = dehors;
      }
    });
  };

  Carte.prototype.definirPoints = function (points) {
    this.points = points || [];
    this._zGroupes = null;
    this._groupes = [];
    this._elGroupes = [];
    this.cEpingles.innerHTML = "";
    this.rendre();
  };

  Carte.prototype.mettreEnAvant = function (i) {
    this._elGroupes.forEach(function (m) {
      if (m.g.type !== "point") return;
      m.el.classList.toggle("jp-active", m.g.e.i === i);
    });
  };

  /* ---------- déplacement et zoom -------------------------------------------- */

  Carte.prototype.allerA = function (lat, lon, z) {
    this.lat = lat;
    this.lon = lon;
    if (z !== undefined) this.z = Math.max(this.zoomMin, Math.min(this.zoomMax, z));
    this.rendre();
  };

  Carte.prototype.reglerZoom = function (z) {
    this.z = Math.max(this.zoomMin, Math.min(this.zoomMax, z));
    this.rendre();
  };

  /** Zoom en gardant fixe le point de l'écran visé. */
  Carte.prototype.zoomerVers = function (px, py, zCible) {
    var v = this._vue();
    if (!v.l) return;
    var avant = this.depuisEcran(px, py, v);
    this.z = Math.max(this.zoomMin, Math.min(this.zoomMax, zCible));
    var v2 = this._vue();
    var apres = this.depuisEcran(px, py, v2);
    // On déplace le centre de l'écart introduit par le changement d'échelle :
    // le point visé retombe exactement sous le doigt.
    this.lon += avant.lon - apres.lon;
    this.lat = latDeY(projY(this.lat) + (projY(avant.lat) - projY(apres.lat)));
    this.rendre();
  };

  Carte.prototype.cadrer = function (points, marge) {
    var self = this;
    points = (points || this.points).filter(function (p) { return p.lat != null; });
    if (!points.length) return;
    var v = this._vue();
    if (!v.l || !v.h) {
      requestAnimationFrame(function () {
        if (self._touche) return;          // l'utilisateur a pris la main
        self.cadrer(points, marge);
      });
      return;
    }
    marge = marge === undefined ? 0.82 : marge;
    var x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    points.forEach(function (p) {
      var X = projX(p.lon), Y = projY(p.lat);
      x0 = Math.min(x0, X); x1 = Math.max(x1, X);
      y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
    });
    // Plancher sur l'étendue : sur une adresse isolée, x1 − x0 vaut zéro et le
    // zoom calculé partait à l'infini avant d'être écrêté au maximum — on se
    // retrouvait collé au sol sans savoir pourquoi. Le plancher correspond à
    // une centaine de mètres, ce qui est la bonne échelle pour une adresse.
    var PLANCHER = 1 / (256 * Math.pow(2, 17));
    var dx = Math.max(x1 - x0, PLANCHER), dy = Math.max(y1 - y0, PLANCHER);
    var z = Math.log2(Math.min(v.l * marge / (TAILLE * dx), v.h * marge / (TAILLE * dy)));
    this.z = Math.max(this.zoomMin, Math.min(this.zoomMax, z));
    this.lon = lonDeX((x0 + x1) / 2);
    this.lat = latDeY((y0 + y1) / 2);
    this.rendre();
  };

  /* ---------- interactions ---------------------------------------------------- */

  Carte.prototype._brancher = function () {
    var self = this, glisse = null, pincee = null;

    function pos(e) {
      var r = self.hote.getBoundingClientRect();
      var t = (e.touches && e.touches[0]) || e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    function ecart(e) {
      var a = e.touches[0], b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    function milieu(e) {
      var r = self.hote.getBoundingClientRect(), a = e.touches[0], b = e.touches[1];
      return { x: (a.clientX + b.clientX) / 2 - r.left,
               y: (a.clientY + b.clientY) / 2 - r.top };
    }

    function debut(e) {
      self._touche = true;
      if (e.touches && e.touches.length === 2) {
        var m = milieu(e);
        pincee = { d: ecart(e), z: self.z, mx: m.x, my: m.y };
        glisse = null;
        return;
      }
      var p = pos(e);
      // On mémorise le point géographique saisi : le glissement consiste
      // ensuite à le ramener sous le doigt. Aucun cumul de deltas, donc aucune
      // dérive sur un long geste.
      var g = self.depuisEcran(p.x, p.y);
      glisse = { lat: g.lat, lon: g.lon, x0: p.x, y0: p.y, bouge: false };
      self.hote.classList.add("jp-glisse");
    }

    function bouge(e) {
      if (pincee && e.touches && e.touches.length === 2) {
        e.preventDefault();
        var f = ecart(e) / pincee.d;
        self.zoomerVers(pincee.mx, pincee.my, pincee.z + Math.log2(f));
        return;
      }
      if (!glisse) return;
      if (e.preventDefault) e.preventDefault();
      var p = pos(e);
      if (Math.abs(p.x - glisse.x0) + Math.abs(p.y - glisse.y0) > 4) glisse.bouge = true;
      var v = self._vue();
      if (!v.l) return;
      // Le centre est celui pour lequel le point saisi retombe sous le doigt.
      self.lon = lonDeX(projX(glisse.lon) - (p.x - v.l / 2) / v.echelle);
      self.lat = latDeY(projY(glisse.lat) - (p.y - v.h / 2) / v.echelle);
      self.rendre();
    }

    function fin() {
      glisse = null; pincee = null;
      self.hote.classList.remove("jp-glisse");
    }

    this.hote.addEventListener("mousedown", debut);
    window.addEventListener("mousemove", bouge);
    window.addEventListener("mouseup", fin);
    this.hote.addEventListener("touchstart", debut, { passive: true });
    this.hote.addEventListener("touchmove", bouge, { passive: false });
    this.hote.addEventListener("touchend", fin);
    this.hote.addEventListener("touchcancel", fin);

    this.hote.addEventListener("wheel", function (e) {
      e.preventDefault();
      self._touche = true;
      var p = pos(e);
      self.zoomerVers(p.x, p.y, self.z - Math.sign(e.deltaY) * 0.5);
    }, { passive: false });

    this.hote.addEventListener("dblclick", function (e) {
      e.preventDefault();
      var p = pos(e);
      self.zoomerVers(p.x, p.y, Math.round(self.z) + 1);
    });

    this.hote.querySelector(".jp-zoom").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      self._touche = true;
      var v = self._vue();
      self.zoomerVers(v.l / 2, v.h / 2, Math.round(self.z) + Number(b.dataset.d));
    });

    this.hote.querySelector(".jp-moi").addEventListener("click", function () {
      self.suivrePosition();
    });

    if (global.ResizeObserver) {
      var derniere = 0;
      new ResizeObserver(function (entrees) {
        var l = entrees[0].contentRect.width;
        if (l > 0 && l !== derniere) { derniere = l; self.rendre(); }
      }).observe(this.hote);
    }
  };

  /* ---------- où je suis, et ce qu'il y a autour ------------------------------
   *
   * Deux besoins distincts. « Où suis-je » se règle avec un point. « Qu'y a-t-il
   * autour » demande la liste des adresses proches, triées, avec le cap — c'est
   * celle-là qui sert dans la rue.
   *
   * Le suivi est continu : à pied, une position relevée une fois est fausse
   * trente secondes plus tard. Un second appui l'arrête, parce qu'un GPS actif
   * vide une batterie.
   */

  var TERRE = 6371000;

  function distance(a, b) {
    var f1 = a.lat * Math.PI / 180, f2 = b.lat * Math.PI / 180;
    var df = (b.lat - a.lat) * Math.PI / 180, dl = (b.lon - a.lon) * Math.PI / 180;
    var h = Math.sin(df / 2) * Math.sin(df / 2) +
            Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * TERRE * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function cap(a, b) {
    var f1 = a.lat * Math.PI / 180, f2 = b.lat * Math.PI / 180;
    var dl = (b.lon - a.lon) * Math.PI / 180;
    var y = Math.sin(dl) * Math.cos(f2);
    var x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  var CARDINAUX = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  function cardinal(deg) { return CARDINAUX[Math.round(deg / 45) % 8]; }

  Carte.prototype.autourDe = function (lat, lon, combien, rayonMax) {
    var ici = { lat: lat, lon: lon }, out = [];
    this.points.forEach(function (p) {
      if (p.lat == null) return;
      var d = distance(ici, { lat: p.lat, lon: p.lon });
      if (rayonMax && d > rayonMax) return;
      out.push({ p: p, m: d, cap: cardinal(cap(ici, { lat: p.lat, lon: p.lon })) });
    });
    out.sort(function (a, b) { return a.m - b.m; });
    return out.slice(0, combien || 12);
  };

  Carte.prototype.suivrePosition = function () {
    var self = this;
    var b = this.hote.querySelector(".jp-moi");

    if (this._veille != null) {
      navigator.geolocation.clearWatch(this._veille);
      clearTimeout(this._minuteurGPS);
      this._veille = null;
      this._position = null;
      b.classList.remove("jp-actif", "jp-attente");
      this.cPosition.innerHTML = "";
      this.surPosition(null, []);
      return;
    }
    if (!navigator.geolocation) {
      b.classList.add("jp-refuse");
      b.title = "Ce navigateur ne sait pas se localiser";
      this.surPosition(null, [], { code: 0, message: "geolocation absent" });
      return;
    }
    /* Page servie en clair depuis une adresse autre que localhost : le
       navigateur coupe la localisation sans rien demander à personne, et rend
       un code 1 qu'on lit à tort comme « permission refusée ». Le dire avant
       d'essayer évite de chercher le réglage qui n'existe pas — constaté le
       14/09/2026 sur http://192.168.1.x depuis le téléphone. */
    if (window.isSecureContext === false) {
      b.classList.add("jp-refuse");
      b.title = "Adresse en http : le navigateur interdit la localisation. " +
                "Ouvrir le carnet en https.";
      this.surPosition(null, [], { code: -1, message: "contexte non sécurisé" });
      return;
    }
    b.classList.add("jp-attente");
    var premier = true;

    this._veille = navigator.geolocation.watchPosition(function (pos) {
      b.classList.remove("jp-attente");
      b.classList.add("jp-actif");
      self._position = pos.coords;
      if (premier) {
        premier = false;
        self.allerA(pos.coords.latitude, pos.coords.longitude, Math.max(self.z, 16));
      } else {
        self.rendre();
      }
      self.surPosition(pos.coords,
        self.autourDe(pos.coords.latitude, pos.coords.longitude, 12, 3000));
    }, function (err) {
      b.classList.remove("jp-attente", "jp-actif");
      b.classList.add("jp-refuse");
      b.title = err.code === 1
        ? (window.isSecureContext === false
            ? "Adresse en http : le navigateur interdit la localisation. " +
              "Ouvrir le carnet en https."
            : "Localisation refusée — à réautoriser dans les réglages du navigateur")
        : "Position introuvable pour l’instant";
      self._veille = null;
      self.surPosition(null, [], err);
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 });

    /* ⚠️ **La veille GPS s'arrête toute seule, et c'est une mesure de sûreté.**
     *
     * `enableHighAccuracy` allume le GPS en continu. Sur un téléphone laissé
     * ouvert sur le carnet, cela vide une batterie en quelques heures — et en
     * voyage, la batterie du téléphone, c'est la carte, les billets, les
     * numéros d'urgence et le moyen de retrouver les autres. Une fonction de
     * confort ne doit pas pouvoir coûter ça.
     *
     * Deux garde-fous :
     *   · la veille s'arrête quand la page passe en arrière-plan — on a rangé
     *     le téléphone dans sa poche, on ne regarde plus la carte ;
     *   · elle s'arrête après dix minutes dans tous les cas. Un simple appui
     *     sur « ma position » la relance.
     */
    if (!this._veilleAuto) {
      this._veilleAuto = true;
      var arreter = function () {
        if (self._veille != null) { self.suivrePosition(); }
      };
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) arreter();
      });
    }
    clearTimeout(this._minuteurGPS);
    this._minuteurGPS = setTimeout(function () {
      if (self._veille != null) self.suivrePosition();
    }, 600000);
  };

  Carte.prototype._rendrePosition = function (v) {
    var c = this._position;
    if (!c) { if (this.cPosition.firstChild) this.cPosition.innerHTML = ""; return; }
    var d = this.cPosition.querySelector(".jp-ici");
    var cer = this.cPosition.querySelector(".jp-precision");
    if (!d) {
      cer = document.createElement("div"); cer.className = "jp-precision";
      this.cPosition.appendChild(cer);
      d = document.createElement("div"); d.className = "jp-ici";
      this.cPosition.appendChild(d);
    }
    var e = this.versEcran(c.latitude, c.longitude, v);
    d.style.left = e.x + "px"; d.style.top = e.y + "px";
    // Le cercle vaut la précision annoncée par l'appareil : le montrer évite de
    // croire qu'on est à la porte quand le GPS donne cinquante mètres près.
    var mParPx = 156543.03392 * Math.cos(c.latitude * Math.PI / 180) / Math.pow(2, this.z);
    var r = Math.max(6, (c.accuracy || 30) / mParPx);
    cer.style.left = e.x + "px"; cer.style.top = e.y + "px";
    cer.style.width = cer.style.height = (r * 2) + "px";
    cer.style.marginLeft = cer.style.marginTop = (-r) + "px";
  };

  Carte.prototype.maPosition = function () { this.suivrePosition(); };

  global.CarteJapon = Carte;
  global.CarteJapon.projeter = { projX: projX, projY: projY,
                                 lonDeX: lonDeX, latDeY: latDeY };
  global.CarteJapon.geo = { distance: distance, cap: cap, cardinal: cardinal };
})(window);
