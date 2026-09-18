/* Le programme — poser les adresses sur les jours du voyage.
 *
 * Le carnet répondait à « où ? ». Il ne répondait pas à « quand ? ». Vingt et
 * un jours, six personnes, 544 adresses : sans un endroit où poser les choses,
 * on garde trente envies et on improvise chaque matin — ce qui, au Japon,
 * revient à marcher deux heures pour trouver fermé.
 *
 * Ce que ce fichier fait, et rien de plus :
 *   · une liste de jours, du 2 au 23 octobre ;
 *   · sur chaque jour, des adresses du carnet et une note libre ;
 *   · le tout dans le téléphone, sans serveur, comme les envies.
 *
 * Ce qu'il ne fait pas, volontairement : pas d'heures, pas de durées, pas
 * d'itinéraire calculé. Un programme de voyage qui se pilote à la minute est
 * un programme qu'on abandonne le deuxième jour. On pose des adresses sur un
 * jour, on voit ce que ça donne, on déplace.
 *
 * Le partage entre les six téléphones est dans `js/partage.js`.
 */

(function (global) {
  "use strict";

  var Sur = global.Sur;
  var CLE = "carnet-japon-jours";

  var etat = {
    debut: null, fin: null, lieux: [],
    jours: {},                 // "2026-10-02" -> { lieux: [clé, …], note: "" }
    surChangement: function () {}
  };

  /* ---------- dates -------------------------------------------------------- */

  function cleDate(d) {
    var m = d.getMonth() + 1, j = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (j < 10 ? "0" : "") + j;
  }

  function estCleDate(s) {
    return typeof s === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s);
  }

  function dateDepuisCle(s) {
    var p = s.split("-");
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }

  /* « ven. 2 oct. » — court, parce que la colonne est étroite sur un téléphone
     et que l'année ne surprendra personne. */
  function libelleJour(d) {
    try {
      return new Intl.DateTimeFormat("fr-FR", {
        weekday: "short", day: "numeric", month: "short"
      }).format(d);
    } catch (e) { return cleDate(d); }
  }

  function tousLesJours() {
    var liste = [], d = new Date(etat.debut.getTime());
    while (d <= etat.fin) {
      liste.push(new Date(d.getTime()));
      d.setDate(d.getDate() + 1);
    }
    return liste;
  }

  /* ---------- stockage ----------------------------------------------------- */

  function valide(v) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    var cles = Object.keys(v);
    if (cles.length > 400) return false;
    for (var i = 0; i < cles.length; i++) {
      if (!estCleDate(cles[i])) return false;
      var j = v[cles[i]];
      if (!j || typeof j !== "object" || Array.isArray(j)) return false;
      if (j.lieux !== undefined) {
        if (!Array.isArray(j.lieux) || j.lieux.length > 60) return false;
        for (var k = 0; k < j.lieux.length; k++) {
          if (typeof j.lieux[k] !== "string" || j.lieux[k].length > 400) return false;
        }
      }
      if (j.note !== undefined && typeof j.note !== "string") return false;
      if (j.note && j.note.length > 2000) return false;
    }
    return true;
  }

  /* Un jour hors du voyage ne sert à rien et ne s'affiche nulle part : il
     viendrait d'un carnet reçu d'un autre voyage, ou d'une date mal recopiée.
     On le retire **sans jeter le reste** — rejeter le stockage entier pour une
     clé douteuse ferait perdre un programme complet pour une virgule. */
  function dansLeVoyage(cle) {
    if (!etat.debut || !etat.fin) return true;
    var d = dateDepuisCle(cle);
    return d >= etat.debut && d <= etat.fin;
  }

  function nettoyer(v) {
    var propre = {};
    Object.keys(v || {}).forEach(function (c) {
      if (dansLeVoyage(c)) propre[c] = v[c];
    });
    return propre;
  }

  function lire() { etat.jours = nettoyer(Sur.lire(CLE, valide, {})); }

  function ecrire() {
    if (!Sur.ecrire(CLE, etat.jours)) {
      if (global.Carnet && global.Carnet.dire) {
        global.Carnet.dire("Le programme n'a pas pu être enregistré sur cet appareil.");
      }
      return false;
    }
    return true;
  }

  /* ---------- le modèle ---------------------------------------------------- */

  function cleLieu(p) { return (p.nom || "") + "|" + (p.ville || ""); }

  function lieuDepuisCle(k) {
    for (var i = 0; i < etat.lieux.length; i++) {
      if (cleLieu(etat.lieux[i]) === k) return etat.lieux[i];
    }
    return null;
  }

  function journee(cle) {
    if (!etat.jours[cle]) etat.jours[cle] = { lieux: [], note: "" };
    if (!etat.jours[cle].lieux) etat.jours[cle].lieux = [];
    return etat.jours[cle];
  }

  function estPose(p, cle) {
    var j = etat.jours[cle];
    return !!(j && j.lieux && j.lieux.indexOf(cleLieu(p)) >= 0);
  }

  /* Les jours où cette adresse est posée. Une adresse peut l'être plusieurs
     fois — un café où l'on repasse, une boutique à revoir avec de la place
     dans la valise. */
  function joursDe(p) {
    var k = cleLieu(p), r = [];
    Object.keys(etat.jours).forEach(function (c) {
      var j = etat.jours[c];
      if (j && j.lieux && j.lieux.indexOf(k) >= 0) r.push(c);
    });
    return r.sort();
  }

  function basculer(p, cle) {
    var j = journee(cle), k = cleLieu(p);
    var i = j.lieux.indexOf(k);
    if (i >= 0) { j.lieux.splice(i, 1); } else { j.lieux.push(k); }
    // Un jour vide ne reste pas dans le stockage : il se recrée tout seul.
    if (!j.lieux.length && !j.note) delete etat.jours[cle];
    ecrire();
    etat.surChangement();
  }

  function noter(cle, texte) {
    var j = journee(cle);
    j.note = Sur.texte(texte, 2000);
    if (!j.lieux.length && !j.note) delete etat.jours[cle];
    ecrire();
  }

  function compte(cle) {
    var j = etat.jours[cle];
    return j && j.lieux ? j.lieux.length : 0;
  }

  function total() {
    var n = 0;
    Object.keys(etat.jours).forEach(function (c) { n += compte(c); });
    return n;
  }

  /* ---------- le choix d'un jour, depuis une adresse -----------------------
   *
   * Un panneau modal plutôt qu'une liste déroulante : à 22 jours, un `<select>`
   * natif sur iPhone ouvre une roue où l'on ne voit que trois lignes, et l'on
   * ne peut y cocher qu'une seule valeur. Ici, on voit le mois, ce qui est
   * déjà posé chaque jour, et l'on coche autant de jours qu'on veut.
   */
  var panneau = null, retourFocus = null, lieuCourant = null;

  function construirePanneau() {
    panneau = document.createElement("div");
    panneau.className = "choix-jour";
    panneau.id = "choixJour";
    panneau.setAttribute("role", "dialog");
    panneau.setAttribute("aria-modal", "true");
    panneau.setAttribute("aria-label", "Choisir un jour");
    panneau.hidden = true;
    panneau.innerHTML =
      '<div class="cj-boite">' +
        '<div class="cj-tete">' +
          '<p class="cj-titre" id="cjTitre"></p>' +
          '<button type="button" class="cj-fermer" id="cjFermer" aria-label="Fermer">×</button>' +
        "</div>" +
        '<div class="cj-jours" id="cjJours"></div>' +
      "</div>";
    document.body.appendChild(panneau);

    panneau.addEventListener("click", function (e) {
      // Un clic sur le fond referme : c'est le geste attendu d'une feuille qui
      // monte du bas.
      if (e.target === panneau) fermerChoix();
    });
    document.getElementById("cjFermer").addEventListener("click", fermerChoix);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panneau && !panneau.hidden) fermerChoix();
    });

    /* Le panneau recouvre le carnet : la tabulation ne doit pas en sortir.
       Sans ce tour, on tabule « à travers » et l'on se retrouve à parcourir des
       fiches devenues invisibles, sans comprendre pourquoi plus rien ne
       répond. Même raison, même remède que pour « Montrer ». */
    panneau.addEventListener("keydown", function (e) {
      if (e.key !== "Tab" || panneau.hidden) return;
      var cibles = panneau.querySelectorAll("button");
      if (!cibles.length) return;
      var premier = cibles[0], dernier = cibles[cibles.length - 1];
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault(); dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault(); premier.focus();
      }
    });
  }

  function rendreChoix() {
    var hote = document.getElementById("cjJours");
    hote.innerHTML = "";
    tousLesJours().forEach(function (d, i) {
      var c = cleDate(d);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cj-jour";
      b.setAttribute("aria-pressed", estPose(lieuCourant, c) ? "true" : "false");
      b.innerHTML =
        '<span class="cj-n">J' + (i + 1) + "</span>" +
        '<span class="cj-date">' + Sur.echapper(libelleJour(d)) + "</span>" +
        '<span class="cj-compte">' + (compte(c) ? compte(c) + " posée" + (compte(c) > 1 ? "s" : "") : "") + "</span>";
      b.addEventListener("click", function () {
        basculer(lieuCourant, c);
        rendreChoix();
      });
      hote.appendChild(b);
    });
  }

  function ouvrirChoix(p) {
    if (!panneau) construirePanneau();
    lieuCourant = p;
    retourFocus = document.activeElement;
    document.getElementById("cjTitre").textContent = "Quel jour ? — " + (p.nom || "");
    panneau.hidden = false;
    rendreChoix();
    document.getElementById("cjFermer").focus();
  }

  function fermerChoix() {
    if (!panneau || panneau.hidden) return;
    panneau.hidden = true;
    if (retourFocus && document.contains(retourFocus)) retourFocus.focus();
    retourFocus = null;
    etat.surChangement();
  }

  /* ---------- le bloc de l'accueil ---------------------------------------- */

  function rendreBloc(hote, options) {
    var o = options || {};
    var jours = tousLesJours();
    var aujourdhui = cleDate(new Date());
    var remplis = jours.filter(function (d) {
      var c = cleDate(d);
      return compte(c) > 0 || (etat.jours[c] && etat.jours[c].note);
    });

    if (!remplis.length && !o.tout) {
      hote.innerHTML =
        '<p class="invite">Aucun jour n\'a encore de programme. Sur une adresse ' +
        'qui vous tente, touchez <b>Poser un jour</b> — elle apparaîtra ici, ' +
        'à sa date.</p>' +
        '<p><button type="button" class="bouton" id="prgTout">Voir les 22 jours</button></p>';
      var bt = document.getElementById("prgTout");
      if (bt) bt.addEventListener("click", function () {
        rendreBloc(hote, { tout: true });
      });
      return;
    }

    var liste = o.tout ? jours : remplis;
    var html = '<div class="prg-jours">';
    liste.forEach(function (d) {
      var c = cleDate(d);
      var j = etat.jours[c] || { lieux: [], note: "" };
      var noms = (j.lieux || []).map(lieuDepuisCle).filter(Boolean);
      html +=
        '<div class="prg-jour' + (c === aujourdhui ? " prg-aujourdhui" : "") + '">' +
          '<div class="prg-tete">' +
            '<span class="prg-date">' + Sur.echapper(libelleJour(d)) + "</span>" +
            (c === aujourdhui ? '<span class="prg-marque">aujourd\'hui</span>' : "") +
          "</div>" +
          (noms.length
            ? '<ul class="prg-lieux">' + noms.map(function (p) {
                return '<li><button type="button" class="prg-lieu" data-cle="' +
                  Sur.echapper(cleLieu(p)) + '">' +
                  '<i class="pastille cat-' +
                  Sur.echapper((p.cat || "").toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")) +
                  '"></i>' + Sur.echapper(p.nom) +
                  (p.quartier ? '<span class="prg-q">' + Sur.echapper(p.quartier) + "</span>" : "") +
                  "</button>" +
                  '<button type="button" class="prg-oter" data-cle="' + Sur.echapper(cleLieu(p)) +
                  '" data-jour="' + c + '" aria-label="Retirer de ce jour">×</button></li>';
              }).join("") + "</ul>"
            : '<p class="prg-vide">rien de posé</p>') +
          '<label class="prg-note"><span class="hors-vue">Note du ' +
            Sur.echapper(libelleJour(d)) + '</span>' +
            '<textarea rows="1" data-jour="' + c + '" placeholder="une note pour ce jour…" ' +
            'maxlength="2000">' + Sur.echapper(j.note || "") + "</textarea></label>" +
        "</div>";
    });
    html += "</div>";
    html += '<p class="prg-pied"><button type="button" class="lien" id="prgBascule">' +
      (o.tout ? "Ne montrer que les jours remplis" : "Voir les 22 jours") + "</button></p>";
    hote.innerHTML = html;

    [].forEach.call(hote.querySelectorAll(".prg-lieu"), function (b) {
      b.addEventListener("click", function () {
        var p = lieuDepuisCle(b.getAttribute("data-cle"));
        if (p && global.Carnet) global.Carnet.ouvrirLieu(p);
      });
    });
    [].forEach.call(hote.querySelectorAll(".prg-oter"), function (b) {
      b.addEventListener("click", function () {
        var p = lieuDepuisCle(b.getAttribute("data-cle"));
        if (p) { basculer(p, b.getAttribute("data-jour")); rendreBloc(hote, o); }
      });
    });
    [].forEach.call(hote.querySelectorAll(".prg-note textarea"), function (t) {
      // La note s'enregistre à la frappe : personne ne pense à valider une
      // note de voyage, et une note perdue est pire que pas de note.
      t.addEventListener("input", function () {
        noter(t.getAttribute("data-jour"), t.value);
        t.style.height = "auto";
        t.style.height = Math.min(t.scrollHeight, 220) + "px";
      });
      if (t.value) {
        t.style.height = "auto";
        t.style.height = Math.min(t.scrollHeight, 220) + "px";
      }
    });
    var bb = document.getElementById("prgBascule");
    if (bb) bb.addEventListener("click", function () {
      rendreBloc(hote, { tout: !o.tout });
    });
  }

  /* ---------- montage ------------------------------------------------------ */

  function demarrer(options) {
    var o = options || {};
    etat.debut = o.debut;
    etat.fin = o.fin;
    etat.lieux = o.lieux || [];
    etat.surChangement = o.surChangement || function () {};
    lire();
  }

  global.Jours = {
    demarrer: demarrer,
    rendreBloc: rendreBloc,
    ouvrirChoix: ouvrirChoix,
    joursDe: joursDe,
    compte: compte,
    total: total,
    libelleJour: libelleJour,
    dateDepuisCle: dateDepuisCle,
    cleDate: cleDate,
    // Pour le partage : lire et remplacer l'ensemble d'un coup.
    tout: function () { return etat.jours; },
    remplacer: function (v) {
      if (!valide(v)) return false;
      etat.jours = nettoyer(v);
      var ok = ecrire();
      etat.surChangement();
      return ok;
    }
  };
})(window);
