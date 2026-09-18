/* Le partage — faire circuler un carnet entre six téléphones, sans serveur.
 *
 * Les envies et le programme vivent dans le téléphone de chacun. C'est un
 * choix, pas un manque : une liste partagée demanderait un serveur, des
 * comptes, et un endroit où les adresses de six personnes seraient stockées
 * chez quelqu'un d'autre. Le carnet n'en veut pas.
 *
 * Reste qu'on part à six et qu'on veut se dire « voilà ce que j'ai gardé ».
 * D'où ce format : **du texte, lisible, qui se colle dans la conversation du
 * groupe.** Pas de code à barres, pas de base64, pas de lien à cliquer. On
 * copie, on colle dans WhatsApp, l'autre copie et colle ici.
 *
 * ⚠️ **Ce que l'import peut faire, et ce qu'il ne peut pas.**
 *
 * Un texte collé vient de l'extérieur : c'est une donnée hostile jusqu'à
 * preuve du contraire. L'import ne crée donc **jamais** d'adresse. Il ne fait
 * que cocher, parmi les 544 du carnet, celles qu'il reconnaît — un nom qui n'y
 * figure pas est compté et ignoré. Le seul texte libre accepté est la note
 * d'une journée : bornée à 2 000 caractères, nettoyée de ses caractères de
 * contrôle, et affichée comme du texte, jamais comme du HTML.
 *
 * Conséquence : coller le carnet d'un inconnu ne peut rien faire de pire que
 * cocher des adresses. C'est le genre de garantie qu'on veut pouvoir donner
 * en une phrase.
 */

(function (global) {
  "use strict";

  var Sur = global.Sur;
  var ENTETE = "CARNET JAPON v1";

  /* ---------- écrire ------------------------------------------------------- */

  function exporter(options) {
    var o = options || {};
    var lignes = [ENTETE];
    var qui = Sur.texte(o.qui || "", 40);
    if (qui) lignes.push("# De " + qui);

    var envies = o.envies || [];
    if (envies.length) {
      lignes.push("# Envies");
      envies.forEach(function (p) {
        lignes.push(p.nom + " | " + (p.ville || ""));
      });
    }

    var jours = o.jours || {};
    var cles = Object.keys(jours).sort();
    var aEcrire = cles.filter(function (c) {
      var j = jours[c];
      return j && ((j.lieux && j.lieux.length) || j.note);
    });
    if (aEcrire.length) {
      lignes.push("# Programme");
      aEcrire.forEach(function (c) {
        var j = jours[c];
        (j.lieux || []).forEach(function (k) {
          // La clé est déjà « nom|ville » : on la réécrit espacée, pour que la
          // ligne se lise dans une conversation.
          lignes.push(c + " | " + k.split("|").join(" | "));
        });
        if (j.note) {
          // Une note sur plusieurs lignes deviendrait plusieurs enregistrements :
          // on la met à plat, la relecture la remettra telle quelle.
          lignes.push(c + " note | " + j.note.split("\n").join(" / "));
        }
      });
    }

    if (lignes.length === 1) {
      lignes.push("# Envies");
      lignes.push("(rien de gardé pour l'instant)");
    }
    return lignes.join("\n");
  }

  /* ---------- relire ------------------------------------------------------- */

  /* Rend un compte rendu, jamais une exception : ce texte vient d'un
     copier-coller dans une conversation, il sera souvent tronqué, recollé avec
     des guillemets typographiques ou une signature. On prend ce qui est
     lisible et on dit ce qu'on a laissé. */
  function importer(texte, options) {
    var o = options || {};
    var lieux = o.lieux || [];
    var resultat = { envies: [], jours: {}, inconnus: [], lignes: 0, valide: false, de: "" };

    var brut = Sur.texte(texte || "", 200000);
    if (brut.indexOf(ENTETE) < 0) return resultat;
    resultat.valide = true;

    // Un index des noms du carnet, pour retrouver une adresse malgré les
    // accents, la casse et les apostrophes courbes que les messageries
    // transforment.
    function aplatir(s) {
      return String(s || "").replace(/’/g, "'").normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    }
    var index = {};
    lieux.forEach(function (p) {
      index[aplatir(p.nom) + "|" + aplatir(p.ville)] = p;
      // Second index sur le seul nom : une ville mal recopiée ne doit pas
      // faire perdre l'adresse.
      var seul = aplatir(p.nom);
      if (!index[seul]) index[seul] = p;
    });

    var section = "";
    brut.split(/\r?\n/).forEach(function (ligne) {
      var l = ligne.trim();
      if (!l) return;
      resultat.lignes += 1;
      if (l === ENTETE) return;
      if (l.indexOf("# De ") === 0) { resultat.de = Sur.texte(l.slice(5), 40); return; }
      if (l.charAt(0) === "#") {
        section = l.toLowerCase().indexOf("programme") >= 0 ? "programme" : "envies";
        return;
      }

      var parts = l.split("|").map(function (x) { return x.trim(); });

      if (section === "programme") {
        var cle = parts[0];
        var note = false;
        if (/ note$/.test(cle)) { cle = cle.replace(/ note$/, ""); note = true; }
        /* La forme ne suffit pas : « 2026-13-99 » la respecte. On reconstruit
           la date et l'on vérifie qu'elle se relit identique — c'est le seul
           contrôle qui attrape le 31 février comme le 13e mois. */
        if (!dateReelle(cle)) return;
        if (!resultat.jours[cle]) resultat.jours[cle] = { lieux: [], note: "" };
        if (note) {
          resultat.jours[cle].note = Sur.texte(parts.slice(1).join(" | "), 2000);
          return;
        }
        var p = index[aplatir(parts[1]) + "|" + aplatir(parts[2])] || index[aplatir(parts[1])];
        if (!p) { resultat.inconnus.push(parts[1] || l); return; }
        var k = p.nom + "|" + (p.ville || "");
        if (resultat.jours[cle].lieux.indexOf(k) < 0) resultat.jours[cle].lieux.push(k);
        return;
      }

      // Section « envies » — et par défaut, pour un texte sans en-tête de
      // section : c'est le cas le plus fréquent d'un copier-coller partiel.
      var q = index[aplatir(parts[0]) + "|" + aplatir(parts[1])] || index[aplatir(parts[0])];
      if (!q) { if (parts[0].charAt(0) !== "(") resultat.inconnus.push(parts[0]); return; }
      if (resultat.envies.indexOf(q) < 0) resultat.envies.push(q);
    });

    return resultat;
  }

  /* Vrai si la chaîne est une date du calendrier. Le tour est classique et
     sûr : on fabrique la date, on la réécrit, on compare. */
  function dateReelle(s) {
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return false;
    var p = s.split("-");
    var an = parseInt(p[0], 10), mois = parseInt(p[1], 10), jour = parseInt(p[2], 10);
    if (an < 2020 || an > 2100 || mois < 1 || mois > 12 || jour < 1 || jour > 31) return false;
    var d = new Date(an, mois - 1, jour);
    return d.getFullYear() === an && d.getMonth() === mois - 1 && d.getDate() === jour;
  }

  /* ---------- le compte rendu qu'on montre --------------------------------- */

  function resume(r) {
    if (!r.valide) {
      return "Ce texte n'est pas un carnet — il doit commencer par « " + ENTETE + " ».";
    }
    var bouts = [];
    bouts.push(r.envies.length + " envie" + (r.envies.length > 1 ? "s" : ""));
    var nJours = Object.keys(r.jours).length;
    if (nJours) bouts.push(nJours + " jour" + (nJours > 1 ? "s" : "") + " de programme");
    if (r.inconnus.length) {
      bouts.push(r.inconnus.length + " adresse" + (r.inconnus.length > 1 ? "s" : "") +
                 " que ce carnet ne connaît pas (ignorée" + (r.inconnus.length > 1 ? "s" : "") + ")");
    }
    return (r.de ? "Carnet de " + r.de + " — " : "") + bouts.join(", ") + ".";
  }

  global.Partage = {
    ENTETE: ENTETE,
    exporter: exporter,
    importer: importer,
    resume: resume
  };
})(window);
