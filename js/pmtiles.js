/* Lecteur d'archives PMTiles v3 — écrit de ma main, sans bibliothèque.
 *
 * Une archive contient toute une pyramide de tuiles dans un seul fichier. Elle
 * remplace les 3 497 PNG du hors-connexion : télécharger la carte d'une ville,
 * c'est désormais une requête au lieu de plusieurs milliers.
 *
 * Deux modes, et le choix n'est pas une préférence mais une contrainte :
 *
 *   depuisBlob(Blob)           — l'archive vit sur le disque, rangée dans
 *                                IndexedDB ; seuls les octets utiles sont lus.
 *                                **C'est le mode du voyage.**
 *   depuisURL(url)             — l'archive reste sur le serveur, on ne lit que
 *                                les octets utiles par requêtes de plage HTTP.
 *
 * ⚠️ GitHub Pages ne sert pas fiablement les requêtes de plage (voir les fils
 * Protomaps #582 et #584 : « no content-length header or content-length
 * exceeding request »). Le mode URL n'est donc PAS utilisé pour notre
 * hébergement : on télécharge l'archive entière par un GET ordinaire, une fois,
 * et on la relit ensuite depuis le tampon. Le mode URL reste écrit parce qu'il
 * est juste et qu'il servira si l'hébergement change.
 *
 * La décompression gzip passe par DecompressionStream, natif depuis 2023 —
 * aucune bibliothèque à charger.
 */

(function (global) {
  "use strict";

  var TAILLE_ENTETE = 127;

  /* ---------- varints ---------------------------------------------------- */

  function lireVarint(vue, etat) {
    var resultat = 0, decalage = 0, o;
    do {
      o = vue.getUint8(etat.i++);
      resultat += (o & 0x7f) * Math.pow(2, decalage);
      decalage += 7;
    } while (o & 0x80);
    return resultat;
  }

  /* ---------- courbe de Hilbert ------------------------------------------ */

  /* Identifiant d'une tuile : les niveaux se suivent — le niveau z commence
   * après (4^z − 1)/3 tuiles — et la position dans le niveau est la distance
   * parcourue le long de la courbe de Hilbert. Des tuiles voisines sur la
   * carte se retrouvent voisines dans le fichier, ce qui rend les lectures
   * par plage efficaces. */
  function identifiant(z, x, y) {
    var base = (Math.pow(4, z) - 1) / 3;
    var d = 0, s = z ? 1 << (z - 1) : 0, rx, ry, t;
    while (s > 0) {
      rx = (x & s) > 0 ? 1 : 0;
      ry = (y & s) > 0 ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      if (ry === 0) {
        if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
        t = x; x = y; y = t;
      }
      s = Math.floor(s / 2);
    }
    return base + d;
  }

  /* ---------- décompression ---------------------------------------------- */

  function degzip(tampon) {
    if (typeof DecompressionStream === "undefined") {
      return Promise.reject(new Error("DecompressionStream absent de ce navigateur"));
    }
    var flux = new Blob([tampon]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(flux).arrayBuffer();
  }

  /* ---------- répertoires ------------------------------------------------ */

  /* Quatre colonnes de varints : identifiants en écarts successifs, longueurs
   * de série, tailles, puis positions — une position qui suit immédiatement la
   * précédente s'écrit 0. */
  function decoderRepertoire(tampon) {
    var vue = new DataView(tampon), etat = { i: 0 };
    var n = lireVarint(vue, etat);
    var tid = new Float64Array(n), serie = new Float64Array(n),
        taille = new Float64Array(n), position = new Float64Array(n);
    var precedent = 0, i;
    for (i = 0; i < n; i++) { precedent += lireVarint(vue, etat); tid[i] = precedent; }
    for (i = 0; i < n; i++) { serie[i] = lireVarint(vue, etat); }
    for (i = 0; i < n; i++) { taille[i] = lireVarint(vue, etat); }
    for (i = 0; i < n; i++) {
      var v = lireVarint(vue, etat);
      position[i] = (v === 0 && i > 0) ? position[i - 1] + taille[i - 1] : v - 1;
    }
    return { n: n, tid: tid, serie: serie, taille: taille, position: position };
  }

  /* Dernière entrée dont l'identifiant ne dépasse pas la cible. */
  function chercher(rep, cible) {
    var bas = 0, haut = rep.n - 1, trouve = -1;
    while (bas <= haut) {
      var milieu = (bas + haut) >> 1;
      if (rep.tid[milieu] <= cible) { trouve = milieu; bas = milieu + 1; }
      else { haut = milieu - 1; }
    }
    if (trouve < 0) return null;
    if (rep.serie[trouve] === 0) return trouve;          // renvoi vers une feuille
    return cible < rep.tid[trouve] + rep.serie[trouve] ? trouve : null;
  }

  /* ---------- l'archive --------------------------------------------------- */

  function Archive(source) {
    this.source = source;      // fonction (position, taille) -> Promise<ArrayBuffer>
    this.entete = null;
    this.racine = null;
    this.feuilles = {};        // cache des répertoires feuilles déjà lus
    this.tuiles = {};          // cache des URL d'objets déjà fabriquées
  }

  var TYPES = { 1: "application/vnd.mapbox-vector-tile", 2: "image/png",
                3: "image/jpeg", 4: "image/webp", 5: "image/avif" };

  Archive.prototype.ouvrir = function () {
    var self = this;
    if (this._ouverture) return this._ouverture;
    this._ouverture = this.source(0, TAILLE_ENTETE).then(function (tampon) {
      var vue = new DataView(tampon);
      var magie = "";
      for (var i = 0; i < 7; i++) magie += String.fromCharCode(vue.getUint8(i));
      if (magie !== "PMTiles") throw new Error("ce fichier n'est pas une archive PMTiles");
      if (vue.getUint8(7) !== 3) throw new Error("version PMTiles non gérée");

      function u64(o) {   // les tailles réelles tiennent largement dans un double
        return vue.getUint32(o, true) + vue.getUint32(o + 4, true) * 4294967296;
      }
      self.entete = {
        posRacine: u64(8), lenRacine: u64(16),
        posMeta: u64(24), lenMeta: u64(32),
        posFeuilles: u64(40), lenFeuilles: u64(48),
        posDonnees: u64(56), lenDonnees: u64(64),
        nAdressees: u64(72),
        compressionInterne: vue.getUint8(97),
        compressionTuile: vue.getUint8(98),
        typeTuile: vue.getUint8(99),
        zoomMin: vue.getUint8(100), zoomMax: vue.getUint8(101),
        cadre: [vue.getInt32(102, true) / 1e7, vue.getInt32(106, true) / 1e7,
                vue.getInt32(110, true) / 1e7, vue.getInt32(114, true) / 1e7]
      };
      self.mime = TYPES[self.entete.typeTuile] || "application/octet-stream";
      return self.source(self.entete.posRacine, self.entete.lenRacine);
    }).then(function (brut) {
      return self.entete.compressionInterne === 2 ? degzip(brut) : brut;
    }).then(function (clair) {
      self.racine = decoderRepertoire(clair);
      return self;
    });
    return this._ouverture;
  };

  Archive.prototype._feuille = function (position, taille) {
    var self = this, cle = position + ":" + taille;
    if (this.feuilles[cle]) return Promise.resolve(this.feuilles[cle]);
    return this.source(this.entete.posFeuilles + position, taille)
      .then(function (brut) {
        return self.entete.compressionInterne === 2 ? degzip(brut) : brut;
      })
      .then(function (clair) {
        self.feuilles[cle] = decoderRepertoire(clair);
        return self.feuilles[cle];
      });
  };

  /* Renvoie une URL d'objet utilisable dans <img src>, ou null si l'archive
   * ne contient pas cette tuile — ce qui est normal en bordure de zone. */
  Archive.prototype.urlTuile = function (z, x, y) {
    var self = this, cle = z + "/" + x + "/" + y;
    if (this.tuiles[cle] !== undefined) return Promise.resolve(this.tuiles[cle]);
    if (z < this.entete.zoomMin || z > this.entete.zoomMax) return Promise.resolve(null);

    var cible = identifiant(z, x, y);
    var k = chercher(this.racine, cible);
    if (k === null) { this.tuiles[cle] = null; return Promise.resolve(null); }

    var suite;
    if (this.racine.serie[k] === 0) {
      suite = this._feuille(this.racine.position[k], this.racine.taille[k])
        .then(function (feuille) {
          var j = chercher(feuille, cible);
          if (j === null || feuille.serie[j] === 0) return null;
          return { position: feuille.position[j], taille: feuille.taille[j] };
        });
    } else {
      suite = Promise.resolve({ position: this.racine.position[k],
                                taille: this.racine.taille[k] });
    }

    return suite.then(function (ou) {
      if (!ou) { self.tuiles[cle] = null; return null; }
      return self.source(self.entete.posDonnees + ou.position, ou.taille)
        .then(function (octets) {
          return self.entete.compressionTuile === 2 ? degzip(octets) : octets;
        })
        .then(function (octets) {
          var url = URL.createObjectURL(new Blob([octets], { type: self.mime }));
          self.tuiles[cle] = url;
          return url;
        });
    });
  };

  /* Agrandissement — ce qui permet de zoomer au-delà de l'archive.
   *
   * Nos archives s'arrêtent au niveau 15. Au-delà, plutôt que d'aller chercher
   * la tuile manquante sur le réseau — ce qui rend la carte inutilisable sans
   * connexion, et nous expose à un blocage du fournisseur — on prend la tuile
   * du niveau au-dessus et on en affiche le quart, la seizième, le soixante-
   * quatrième partie qui nous intéresse. L'image est plus floue, les rues
   * restent parfaitement lisibles, et rien ne dépend plus du réseau.
   *
   * Renvoie {url, dz, dx, dy} : `dz` niveaux remontés, et la position de notre
   * tuile dans la parente. dz = 0 signifie une tuile exacte.
   */
  Archive.prototype.tuileOuParente = function (z, x, y, remonteeMax) {
    var self = this;
    remonteeMax = remonteeMax === undefined ? 5 : remonteeMax;

    function essayer(dz) {
      if (dz > remonteeMax || z - dz < self.entete.zoomMin) {
        return Promise.resolve(null);
      }
      var f = 1 << dz;
      var px = Math.floor(x / f), py = Math.floor(y / f);
      return self.urlTuile(z - dz, px, py).then(function (url) {
        if (url) {
          return { url: url, dz: dz, dx: x - px * f, dy: y - py * f };
        }
        return essayer(dz + 1);
      });
    }
    // Au-dessus du niveau le plus fin de l'archive, inutile de tenter le niveau
    // exact : on part directement du plus fin disponible.
    return essayer(z > this.entete.zoomMax ? z - this.entete.zoomMax : 0);
  };

  Archive.prototype.oublier = function () {
    for (var k in this.tuiles) {
      if (this.tuiles[k]) URL.revokeObjectURL(this.tuiles[k]);
    }
    this.tuiles = {};
  };

  /* ---------- deux façons d'atteindre les octets -------------------------- */

  /* L'archive est un Blob — **c'est le mode à utiliser**.
   *
   * Un Blob est conservé par le navigateur sur le disque, pas dans la mémoire
   * de la page : `slice()` ne lit que les octets demandés. C'est ce qui permet
   * de garder deux archives de 51 et 56 Mo sans occuper 108 Mo de mémoire vive.
   *
   * La première version passait par des ArrayBuffer, gardés entiers en RAM.
   * Cela fonctionne sur un ordinateur et **fait tuer l'onglet par Safari sur
   * iPhone**, dont la limite mémoire par page est bien plus basse : la page
   * devenait blanche sans message. C'est le défaut signalé par Paco le 02/09.
   */
  function depuisBlob(blob) {
    return new Archive(function (position, taille) {
      return blob.slice(position, position + taille).arrayBuffer();
    }).ouvrir();
  }

  /* L'archive est déjà en mémoire. Conservé pour les cas où l'on tient un
   * ArrayBuffer sous la main, mais `depuisBlob` est préférable partout. */
  function depuisTampon(tampon) {
    return new Archive(function (position, taille) {
      return Promise.resolve(tampon.slice(position, position + taille));
    }).ouvrir();
  }

  /* L'archive est sur un serveur qui honore les requêtes de plage. Réservé aux
   * hébergements qui les gèrent — pas GitHub Pages. */
  function depuisURL(url) {
    return new Archive(function (position, taille) {
      return fetch(url, {
        headers: { Range: "bytes=" + position + "-" + (position + taille - 1) }
      }).then(function (r) {
        if (r.status !== 206) {
          throw new Error("l'hébergeur n'honore pas les requêtes de plage (" +
                          r.status + ") — télécharger l'archive entière");
        }
        return r.arrayBuffer();
      });
    }).ouvrir();
  }

  global.PMTiles = {
    depuisBlob: depuisBlob,
    depuisTampon: depuisTampon,
    depuisURL: depuisURL,
    identifiant: identifiant
  };
})(this);
