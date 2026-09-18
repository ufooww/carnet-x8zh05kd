/* L'onglet « Utile » — ce qu'on ouvre quand quelque chose ne va pas.
 *
 * Le carnet savait où manger. Il ne savait pas dire « appelez une ambulance »,
 * ni combien font 3 500 ¥, ni quoi faire quand la terre tremble — et ce sont
 * les seuls moments où l'on ouvre un carnet en catastrophe.
 *
 * Sept blocs, dans l'ordre où on en a besoin :
 *
 *   1. Ma base     — l'adresse de l'hébergement, en japonais, à montrer à un taxi
 *   2. Urgences    — 110, 119, la hotline, le consulat
 *   3. Combien ça fait — le convertisseur, qui marche sans réseau
 *   4. Phrases     — à montrer, pas à prononcer
 *   5. Si ça tourne mal — séisme, typhon, dernier train, téléphone perdu
 *   6. La carte sans réseau — installer ou reprendre les 108 Mo d'archives
 *   7. L'heure     — Tokyo et Paris, pour savoir si l'on peut appeler
 *
 * **Tout fonctionne sans réseau.** C'est la règle de cet onglet : rien de ce
 * qu'il affiche ne dépend d'une requête. Un taux de change figé et juste vaut
 * mieux qu'un taux exact qu'on ne peut pas aller chercher.
 *
 * Les données sont dans `donnees/utile.json`, publiées par construire.py.
 */

(function (global) {
  "use strict";

  var Sur = global.Sur;
  var $ = function (id) { return document.getElementById(id); };

  /* La base : ce que chacun note pour soi, sur son téléphone. Rien ne circule
     entre les six appareils — voir la note des envies dans app.js. */
  var CLE_BASE = "carnet-japon-base";

  function lireLogement() {
    return Sur.lire(CLE_BASE, function (v) {
      return v && typeof v === "object" && !Array.isArray(v) &&
             (v.nom === undefined || typeof v.nom === "string") &&
             (v.adresse === undefined || typeof v.adresse === "string");
    }, { nom: "", adresse: "" });
  }

  function ecrireLogement(b) { return Sur.ecrire(CLE_BASE, b); }

  /* ---------- 1. ma base ---------------------------------------------------
   *
   * Un chauffeur de taxi japonais ne lit pas « 2-15-3 Kitazawa, Setagaya ». Il
   * lit 北沢2-15-3. C'est la seule chose qui compte ici : que l'adresse de
   * l'hébergement soit écrite en japonais, disponible sans réseau, et
   * affichable en grand d'un seul geste.
   */
  function blocBase(hote) {
    var b = lireLogement();
    var section = document.createElement("section");
    section.className = "bloc bloc-base";
    section.innerHTML =
      "<h2>Ma base <span class=\"u-jp\">宿</span></h2>" +
      '<p class="bloc-note">L\'adresse où vous dormez en ce moment. Écrivez-la ' +
      'en japonais : c\'est ce qu\'un chauffeur de taxi peut lire. Elle reste ' +
      'sur ce téléphone.</p>' +
      '<label class="u-champ"><span>Nom du logement</span>' +
      '<input type="text" id="baseNom" autocomplete="off" ' +
      'placeholder="Notre logement" maxlength="80"></label>' +
      '<label class="u-champ"><span>Adresse, en japonais</span>' +
      '<textarea id="baseAdresse" rows="2" autocomplete="off" ' +
      'placeholder="東京都〇〇区〇〇1-2-3" maxlength="200"></textarea></label>' +
      '<div class="u-actions">' +
        '<button type="button" class="bouton plein" id="baseMontrer">見せる · Montrer en grand</button>' +
        '<button type="button" class="bouton" id="baseCopier">Copier</button>' +
      "</div>";
    hote.appendChild(section);

    $("baseNom").value = b.nom || "";
    $("baseAdresse").value = b.adresse || "";

    function enregistrer() {
      var v = { nom: Sur.texte($("baseNom").value, 80),
                adresse: Sur.texte($("baseAdresse").value, 200) };
      if (!ecrireLogement(v)) {
        global.Carnet.dire("L'adresse n'a pas pu être enregistrée sur cet appareil.");
      }
    }
    $("baseNom").addEventListener("input", enregistrer);
    $("baseAdresse").addEventListener("input", enregistrer);

    $("baseMontrer").addEventListener("click", function () {
      var v = lireLogement();
      if (!v.adresse && !v.nom) {
        global.Carnet.dire("Notez d'abord l'adresse de votre logement.");
        return;
      }
      /* L'adresse passe en grand, le nom en dessous : c'est l'adresse que le
         chauffeur lit, pas le nom de l'annonce Airbnb. */
      global.Carnet.montrer(v.adresse || v.nom, v.nom, "ここまでお願いします");
    });

    $("baseCopier").addEventListener("click", function () {
      var v = lireLogement();
      copier(v.adresse || v.nom, $("baseCopier"));
    });
  }

  /* Copier sans dépendre du presse-papier moderne : sur une page servie en
     http, `navigator.clipboard` n'existe pas — c'est exactement le cas du
     carnet essayé depuis une adresse IP locale. Le repli par champ caché
     fonctionne partout. */
  function copier(texte, bouton) {
    var fini = function (ok) {
      if (!bouton) return;
      var avant = bouton.textContent;
      bouton.textContent = ok ? "Copié" : "Impossible";
      setTimeout(function () { bouton.textContent = avant; }, 1400);
    };
    if (!texte) { fini(false); return; }
    if (global.navigator.clipboard && global.isSecureContext) {
      global.navigator.clipboard.writeText(texte).then(function () { fini(true); },
                                                       function () { fini(false); });
      return;
    }
    try {
      var z = document.createElement("textarea");
      z.value = texte;
      z.setAttribute("readonly", "");
      z.className = "hors-vue";
      document.body.appendChild(z);
      z.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(z);
      fini(ok);
    } catch (e) { fini(false); }
  }

  /* ⚠️ Les exemples de ces deux champs sont fictifs, et doivent le rester.
     Ils portaient le nom et l'adresse au numéro près d'un logement réellement
     envisagé. Sur un site public, un texte d'exemple se lit comme le reste :
     il disait où le groupe dort, et les dates du voyage étaient à côté.
     Trouvé à l'audit de publication du 18/09/2026. Un gabarit avec des 〇
     montre le format sans désigner personne. */

  /* ---------- 2. les urgences --------------------------------------------- */
  function blocUrgences(hote, donnees) {
    var section = document.createElement("section");
    section.className = "bloc";
    var html = "<h2>Urgences <span class=\"u-jp\">緊急</span></h2>" +
      '<p class="bloc-note">Les deux premiers sont gratuits depuis n\'importe ' +
      'quel téléphone, même sans carte SIM et même écran verrouillé.</p>' +
      '<div class="u-urgences">';

    (donnees.urgences || []).forEach(function (u) {
      /* `tel:` n'est autorisé que par ce chemin-ci, et seulement s'il ressemble
         à un numéro : voir la note de `Sur.urlSure`. Une donnée ne fabrique
         jamais un lien toute seule. */
      var tel = u.tel ? Sur.urlSure(u.tel, { telAutorise: true }) : "";
      html +=
        '<div class="u-urg">' +
          '<div class="u-urg-tete">' +
            (tel ? '<a class="u-num" href="' + Sur.echapper(tel) + '">' +
                   Sur.echapper(u.numero) + "</a>"
                 : '<span class="u-num">' + Sur.echapper(u.numero) + "</span>") +
            '<span class="u-urg-titre">' + Sur.echapper(u.titre) + "</span>" +
          "</div>" +
          '<p class="u-urg-quoi">' + Sur.echapper(u.quoi) + "</p>" +
          (u.note ? '<p class="u-urg-note">' + Sur.echapper(u.note) + "</p>" : "") +
        "</div>";
    });
    section.innerHTML = html + "</div>";
    hote.appendChild(section);
  }

  /* ---------- 3. combien ça fait ------------------------------------------
   *
   * Un convertisseur hors connexion, donc à taux figé. Le taux est daté et
   * modifiable : c'est plus honnête qu'un chiffre qui a l'air vivant et qui ne
   * l'est pas. La règle de tête est là pour les cas où l'on n'ouvre même pas
   * le carnet — c'est elle qu'on retient au bout de trois jours.
   */
  var CLE_TAUX = "carnet-japon-taux";

  function tauxCourant(defaut) {
    var v = Sur.lire(CLE_TAUX, function (x) {
      return typeof x === "number" && x > 50 && x < 500;
    }, null);
    return v || defaut;
  }

  function blocArgent(hote, donnees) {
    var ch = donnees.change || {};
    var taux = tauxCourant(ch.yenParEuro || 179);

    var section = document.createElement("section");
    section.className = "bloc";
    section.innerHTML =
      "<h2>Combien ça fait <span class=\"u-jp\">円</span></h2>" +
      '<div class="u-change">' +
        '<label class="u-conv"><span class="u-conv-eti">yens</span>' +
          '<input type="text" inputmode="decimal" id="convYen" ' +
          'autocomplete="off" placeholder="3500"></label>' +
        '<span class="u-conv-fleche" aria-hidden="true">⇄</span>' +
        '<label class="u-conv"><span class="u-conv-eti">euros</span>' +
          '<input type="text" inputmode="decimal" id="convEur" ' +
          'autocomplete="off" placeholder="19,55"></label>' +
      "</div>" +
      '<p class="u-regle"><b>' + Sur.echapper(ch.regle || "") + "</b> " +
        Sur.echapper(ch.exemple || "") + "</p>" +
      '<div class="u-reperes" id="convReperes"></div>' +
      '<p class="u-taux">1 € = <input type="text" inputmode="decimal" id="convTaux" ' +
        'value="' + Sur.echapper(String(taux)) + '" autocomplete="off"> ¥ ' +
        '<span class="u-taux-date">relevé le ' + Sur.echapper(ch.releve || "") +
        " — à corriger avant de partir</span></p>";
    hote.appendChild(section);

    var yen = $("convYen"), eur = $("convEur"), champTaux = $("convTaux");

    function lireChiffre(champ) {
      // On accepte la virgule française, les espaces et les points de milliers.
      var t = champ.value.replace(/[^0-9.,]/g, "").replace(",", ".");
      var n = parseFloat(t);
      return isFinite(n) ? n : null;
    }

    function formater(n, decimales) {
      return n.toLocaleString("fr-FR", {
        minimumFractionDigits: decimales, maximumFractionDigits: decimales
      });
    }

    function reperes() {
      var t = tauxCourant(ch.yenParEuro || 179);
      var html = "";
      (ch.reperes || []).forEach(function (v) {
        html += '<div class="u-rep"><span class="u-rep-y">' + formater(v, 0) +
                " ¥</span><span class=\"u-rep-e\">" + formater(v / t, 2) + " €</span></div>";
      });
      $("convReperes").innerHTML = html;
    }

    yen.addEventListener("input", function () {
      var v = lireChiffre(yen);
      eur.value = v === null ? "" : formater(v / tauxCourant(ch.yenParEuro || 179), 2);
    });
    eur.addEventListener("input", function () {
      var v = lireChiffre(eur);
      yen.value = v === null ? "" : formater(v * tauxCourant(ch.yenParEuro || 179), 0);
    });
    champTaux.addEventListener("input", function () {
      var v = lireChiffre(champTaux);
      if (v && v > 50 && v < 500) {
        Sur.ecrire(CLE_TAUX, v);
        reperes();
        // On recalcule la conversion en cours, sinon le chiffre affiché ment.
        if (yen.value) {
          eur.value = formater((lireChiffre(yen) || 0) / v, 2);
        }
      }
    });
    reperes();
  }

  /* ---------- les tailles ---------------------------------------------------
   *
   * 154 des 544 adresses sont des boutiques : pour ce voyage-ci, la
   * correspondance des tailles n'est pas un bonus, c'est un outil de travail.
   * Trois tables, et un avertissement qui compte autant qu'elles — au Japon les
   * coupes taillent petit, et une table ne remplace pas un essayage.
   */
  function blocTailles(hote, donnees) {
    var t = donnees.tailles;
    if (!t) return;
    var section = document.createElement("section");
    section.className = "bloc";
    var html = "<h2>Les tailles <span class=\"u-jp\">サイズ</span></h2>" +
      '<p class="bloc-note">' + Sur.echapper(t.avertissement) + "</p>";

    (t.groupes || []).forEach(function (g) {
      html += '<div class="u-taille">' +
        "<h3>" + Sur.echapper(g.titre) + "</h3>" +
        '<div class="u-table-boite"><table class="u-table"><thead><tr>' +
        (g.colonnes || []).map(function (c) {
          return "<th>" + Sur.echapper(c) + "</th>";
        }).join("") + "</tr></thead><tbody>" +
        (g.lignes || []).map(function (l) {
          return "<tr>" + l.map(function (c, i) {
            return (i === 0 ? "<th scope=\"row\">" : "<td>") + Sur.echapper(c) +
                   (i === 0 ? "</th>" : "</td>");
          }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>" +
        (g.note ? '<p class="u-urg-note">' + Sur.echapper(g.note) + "</p>" : "") +
        "</div>";
    });
    section.innerHTML = html;
    hote.appendChild(section);
  }

  /* ---------- ce qu'il reste à faire avant de partir ------------------------
   *
   * Posée en tête de l'onglet « Avant de partir », là où on la cherche. Les
   * cases cochées restent sur le téléphone ; chacun a la sienne, et c'est bien :
   * à six, une liste partagée deviendrait la liste de personne.
   */
  var CLE_AVANT = "carnet-japon-avant";

  function rendreAvant(hote, donnees) {
    donnees = donnees || global.UTILE;
    if (!hote || !donnees || !donnees.avant) return;
    var faits = Sur.lire(CLE_AVANT, function (v) {
      return Sur.estDictionnaireSimple(v, function (x) { return x === 1; }, 200);
    }, {});

    var restants = donnees.avant.filter(function (a) { return !faits[a.quoi]; }).length;
    var html = '<section class="bloc bloc-avant">' +
      "<h2>À faire avant de partir " +
      '<span class="n">' + (restants ? restants + " à faire" : "tout est fait") + "</span></h2>" +
      '<ul class="u-liste-avant">';
    donnees.avant.forEach(function (a, i) {
      var fait = !!faits[a.quoi];
      html +=
        '<li class="u-avant' + (fait ? " fait" : "") + '">' +
          '<button type="button" role="checkbox" aria-checked="' + (fait ? "true" : "false") +
            '" data-avant="' + i + '">' +
            '<span class="u-case" aria-hidden="true"></span>' +
            '<span class="u-avant-txt"><span class="u-avant-quoi">' +
              Sur.echapper(a.quoi) + "</span>" +
            (a.note ? '<span class="u-avant-note">' + Sur.echapper(a.note) + "</span>" : "") +
            "</span>" +
          "</button>" +
        "</li>";
    });
    html += "</ul></section>";
    hote.innerHTML = html;

    [].forEach.call(hote.querySelectorAll("[data-avant]"), function (b) {
      b.addEventListener("click", function () {
        var a = donnees.avant[parseInt(b.getAttribute("data-avant"), 10)];
        if (!a) return;
        if (faits[a.quoi]) { delete faits[a.quoi]; } else { faits[a.quoi] = 1; }
        Sur.ecrire(CLE_AVANT, faits);
        rendreAvant(hote, donnees);
      });
    });
  }

  /* ---------- 4. les phrases ----------------------------------------------
   *
   * Elles ne sont pas là pour être prononcées — personne n'apprend une langue
   * en huit jours. Elles sont là pour être **montrées** : le bouton en tend une
   * en plein écran, en gros, à la personne en face. C'est le même geste que
   * pour le nom d'un restaurant, et c'est celui qui marche.
   */
  function blocPhrases(hote, donnees) {
    var section = document.createElement("section");
    section.className = "bloc";
    section.innerHTML = "<h2>Phrases <span class=\"u-jp\">言葉</span></h2>" +
      '<p class="bloc-note">Touchez une phrase pour la montrer en grand à ' +
      'votre interlocuteur.</p>' +
      /* Quatre-vingt-une phrases en huit groupes repliés : on les parcourt bien
         quand on a le temps. Le champ est là pour l'autre cas — « allergie »,
         « toilettes », « combien » tapés d'une main dans une situation où l'on
         n'a pas le temps de déplier huit catégories. */
      '<div class="recherche u-recherche" id="uRechercheBoite">' +
        '<label class="hors-vue" for="uRecherche">Chercher une phrase</label>' +
        '<span class="loupe" aria-hidden="true">⌕</span>' +
        '<input type="search" id="uRecherche" autocomplete="off" ' +
        'placeholder="allergie, toilettes, combien…">' +
        '<button class="vider" id="uViderRecherche" aria-label="Vider">×</button>' +
      "</div>" +
      '<p class="u-rien" id="uRien" hidden>Aucune phrase ne correspond.</p>' +
      '<div class="u-phrases" id="uPhrases"></div>';
    hote.appendChild(section);

    var boite = $("uPhrases");
    (donnees.phrases || []).forEach(function (groupe, ig) {
      var art = document.createElement("article");
      art.className = "u-groupe";
      var html =
        '<button type="button" class="u-groupe-tete" aria-expanded="' +
          (ig === 0 ? "true" : "false") + '">' +
          '<span class="u-groupe-jp" aria-hidden="true">' + Sur.echapper(groupe.jp || "") + "</span>" +
          '<span class="u-groupe-nom">' + Sur.echapper(groupe.cat) + "</span>" +
          '<span class="u-groupe-n">' + (groupe.items || []).length + "</span>" +
        "</button><div class=\"u-groupe-corps\">";
      (groupe.items || []).forEach(function (p, i) {
        html +=
          '<button type="button" class="u-phrase" data-g="' + ig + '" data-i="' + i + '">' +
            '<span class="u-fr">' + Sur.echapper(p.fr) + "</span>" +
            '<span class="u-jpp">' + Sur.echapper(p.jp) + "</span>" +
            '<span class="u-ro">' + Sur.echapper(p.ro) + "</span>" +
            (p.note ? '<span class="u-note">' + Sur.echapper(p.note) + "</span>" : "") +
          "</button>";
      });
      art.innerHTML = html + "</div>";
      if (ig === 0) art.setAttribute("data-ouvert", "");
      boite.appendChild(art);
    });

    /* Le filtre. On compare sur le français, le romaji ET le japonais — taper
       « toire » doit trouver トイレ. Les accents sont ramenés au clavier, comme
       pour la recherche d'adresses. */
    function aplatir(t) {
      return String(t || "").normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    var champ = $("uRecherche"), boiteRech = $("uRechercheBoite"), rien = $("uRien");

    function filtrer() {
      var q = aplatir(champ.value.trim());
      boiteRech.classList.toggle("plein", !!champ.value);
      var trouvees = 0;
      [].forEach.call(boite.querySelectorAll(".u-groupe"), function (art) {
        var visiblesDansGroupe = 0;
        [].forEach.call(art.querySelectorAll(".u-phrase"), function (b) {
          var ok = !q || aplatir(b.textContent).indexOf(q) >= 0;
          b.hidden = !ok;
          if (ok) { visiblesDansGroupe += 1; trouvees += 1; }
        });
        art.hidden = q && !visiblesDansGroupe;
        /* Pendant une recherche, tous les groupes qui gardent une phrase
           s'ouvrent : une réponse cachée derrière un repli n'est pas une
           réponse. À l'effacement, on revient à l'état initial. */
        if (q) {
          if (visiblesDansGroupe) art.setAttribute("data-ouvert", "");
        } else {
          if (art !== boite.firstElementChild) art.removeAttribute("data-ouvert");
        }
      });
      rien.hidden = !(q && !trouvees);
    }

    champ.addEventListener("input", filtrer);
    $("uViderRecherche").addEventListener("click", function () {
      champ.value = ""; filtrer(); champ.focus();
    });

    boite.addEventListener("click", function (e) {
      var tete = e.target.closest(".u-groupe-tete");
      if (tete) {
        var art = tete.parentNode;
        var ouvert = art.hasAttribute("data-ouvert");
        if (ouvert) { art.removeAttribute("data-ouvert"); }
        else { art.setAttribute("data-ouvert", ""); }
        tete.setAttribute("aria-expanded", ouvert ? "false" : "true");
        return;
      }
      var b = e.target.closest(".u-phrase");
      if (!b) return;
      var g = donnees.phrases[parseInt(b.getAttribute("data-g"), 10)];
      var p = g && g.items[parseInt(b.getAttribute("data-i"), 10)];
      if (p) global.Carnet.montrer(p.jp, p.fr, p.ro);
    });
  }

  /* ---------- 5. si ça tourne mal ----------------------------------------- */
  function blocSecours(hote, donnees) {
    var section = document.createElement("section");
    section.className = "bloc";
    section.innerHTML = "<h2>Si ça tourne mal <span class=\"u-jp\">もしも</span></h2>" +
      '<div class="conseils-liste u-secours" id="uSecours"></div>';
    hote.appendChild(section);

    var boite = $("uSecours");
    (donnees.secours || []).forEach(function (f) {
      var art = document.createElement("article");
      art.className = "conseil";
      art.innerHTML =
        '<button type="button">' +
          '<span class="cat">' + Sur.echapper(f.jp || "") + "</span>" +
          "<h3>" + Sur.echapper(f.titre) + "</h3>" +
        "</button>" +
        '<div class="corps">' +
          (f.quand ? '<p class="chapo">' + Sur.echapper(f.quand) + "</p>" : "") +
          "<dl>" + (f.points || []).map(function (p) {
            return "<dt>" + Sur.echapper(p[0]) + "</dt><dd>" + Sur.echapper(p[1]) + "</dd>";
          }).join("") + "</dl>" +
        "</div>";
      art.querySelector("button").addEventListener("click", function () {
        if (art.hasAttribute("data-ouvert")) art.removeAttribute("data-ouvert");
        else art.setAttribute("data-ouvert", "");
      });
      boite.appendChild(art);
    });
  }

  /* ---------- 6. la carte sans réseau -------------------------------------
   *
   * Le fond de carte vient d'un serveur japonais : sans données mobiles, la
   * carte du carnet montre des épingles sur du vide. Les 108 Mo d'archives
   * règlent cela — mais 108 Mo ne se téléchargent pas par surprise au milieu
   * d'un forfait. On les propose donc, en disant le prix, et on peut les
   * reprendre.
   *
   * ⚠️ Ce que couvre l'archive, et ce qu'elle ne couvre pas : les niveaux de
   * zoom 11 à 15, c'est-à-dire de la ville au quartier. Au-delà, le carnet
   * agrandit l'image plutôt que d'afficher du vide — les rues restent lisibles,
   * les numéros non.
   */
  function blocCarte(hote) {
    var section = document.createElement("section");
    section.className = "bloc";
    section.innerHTML =
      "<h2>La carte sans réseau <span class=\"u-jp\">地図</span></h2>" +
      '<p class="bloc-note" id="carteEtat">Vérification…</p>' +
      '<div class="u-jauge" id="carteJaugeBoite" hidden><i id="carteJauge"></i></div>' +
      '<div class="u-actions" id="carteActions"></div>' +
      '<p class="u-urg-note">Les 544 adresses, elles, sont consultables sans ' +
      'réseau dès la première ouverture du carnet. Ce téléchargement ne concerne ' +
      'que le fond de carte — les rues, les gares, les noms de quartiers.</p>';
    hote.appendChild(section);

    var etat = $("carteEtat"), actions = $("carteActions"),
        jaugeBoite = $("carteJaugeBoite"), jauge = $("carteJauge");

    function mo(n) { return (n / 1048576).toFixed(0) + " Mo"; }

    function rendre() {
      if (!global.Carnet || !global.Carnet.etatCarte) {
        etat.textContent = "La carte n'est pas chargée.";
        return;
      }
      global.Carnet.etatCarte().then(function (e) {
        actions.innerHTML = "";
        jaugeBoite.hidden = true;
        if (e.installees === e.total && e.total > 0) {
          etat.textContent = "Installée — " + mo(e.octets) +
            " sur ce téléphone. La carte fonctionne sans réseau, du niveau " +
            "de la ville à celui du quartier.";
          var bSupprimer = document.createElement("button");
          bSupprimer.type = "button";
          bSupprimer.className = "bouton";
          bSupprimer.textContent = "Libérer " + mo(e.octets);
          bSupprimer.addEventListener("click", function () {
            bSupprimer.disabled = true;
            bSupprimer.textContent = "Suppression…";
            global.Carnet.supprimerCarte().then(rendre, rendre);
          });
          actions.appendChild(bSupprimer);
        } else {
          etat.textContent = e.installees
            ? "Installée à moitié (" + e.installees + " archive sur " + e.total +
              "). Reprenez le téléchargement pour la compléter."
            : "Pas installée. Sans réseau, la carte montre les épingles mais " +
              "pas les rues.";
          var bInstaller = document.createElement("button");
          bInstaller.type = "button";
          bInstaller.className = "bouton plein";
          bInstaller.textContent = "Télécharger — 108 Mo, une seule fois";
          bInstaller.addEventListener("click", function () {
            bInstaller.disabled = true;
            bInstaller.textContent = "Téléchargement…";
            jaugeBoite.hidden = false;
            global.Carnet.installerCarte(function (f) {
              jauge.style.width = Math.round(Math.min(f, 1) * 100) + "%";
            }).then(function () {
              global.Carnet.dire("Carte installée — elle fonctionne désormais sans réseau.");
              rendre();
            }, function (err) {
              etat.textContent = "Téléchargement impossible : " +
                (err && err.message ? err.message : "réseau interrompu") +
                ". Réessayez en Wi-Fi.";
              bInstaller.disabled = false;
              bInstaller.textContent = "Réessayer";
              jaugeBoite.hidden = true;
            });
          });
          actions.appendChild(bInstaller);
        }
      });
    }
    rendre();
  }

  /* ---------- 7. l'heure ---------------------------------------------------
   *
   * Sept heures d'écart en octobre : quand il est 20 h à Tokyo, il est 13 h à
   * Paris. C'est ce qui décide si l'on peut appeler la banque, la famille, ou
   * l'assurance — et c'est le calcul qu'on rate toujours.
   */
  function blocHeure(hote) {
    var section = document.createElement("section");
    section.className = "bloc bloc-heure";
    section.innerHTML =
      '<div class="u-heures">' +
        '<div class="u-h"><span class="u-h-ville">Tokyo</span>' +
          '<span class="u-h-val" id="hTokyo">—</span></div>' +
        '<div class="u-h"><span class="u-h-ville">Paris</span>' +
          '<span class="u-h-val" id="hParis">—</span></div>' +
      "</div>" +
      '<p class="u-h-note" id="hEcart"></p>';
    hote.appendChild(section);

    function heure(zone) {
      try {
        return new Intl.DateTimeFormat("fr-FR", {
          timeZone: zone, hour: "2-digit", minute: "2-digit", weekday: "short"
        }).format(new Date());
      } catch (e) { return "—"; }
    }

    /* L'écart se calcule, il ne se suppose pas : la France passe à l'heure
       d'hiver le dernier dimanche d'octobre — le 25 en 2026, pendant le
       voyage. L'écart passe ce jour-là de 7 h à 8 h. Le Japon, lui, ne change
       jamais d'heure. */
    function ecart() {
      try {
        var n = new Date();
        var t = new Date(n.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
        var p = new Date(n.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
        var h = Math.round((t - p) / 3600000);
        return "Tokyo a " + h + " heures d'avance sur Paris.";
      } catch (e) { return ""; }
    }

    function maj() {
      $("hTokyo").textContent = heure("Asia/Tokyo");
      $("hParis").textContent = heure("Europe/Paris");
      $("hEcart").textContent = ecart();
    }
    maj();
    // Une fois par minute suffit, et l'on s'arrête quand l'onglet est caché :
    // un minuteur qui tourne dans une poche, c'est de la batterie perdue.
    var timer = setInterval(function () {
      if (!document.hidden) maj();
    }, 60000);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) maj();
    });
    return timer;
  }

  /* ---------- installer le carnet sur l'écran d'accueil ---------------------
   *
   * Tant que le carnet vit dans un onglet, il peut être fermé par le
   * navigateur qui fait de la place, et il s'ouvre avec la barre d'adresse au
   * milieu. Installé, il devient une application : plein écran, instantané, et
   * le hors connexion tient vraiment.
   *
   * Le bloc ne s'affiche **que s'il y a quelque chose à faire** : déjà
   * installé, il disparaît. Sur iPhone, le geste ne peut pas être déclenché par
   * la page — Safari réserve l'installation à son propre menu de partage —
   * donc on l'explique au lieu de proposer un bouton qui ne ferait rien.
   */
  function blocInstaller(hote) {
    var installe = (global.matchMedia &&
                    global.matchMedia("(display-mode: standalone)").matches) ||
                   global.navigator.standalone === true;
    if (installe) return;

    var iOS = /iPad|iPhone|iPod/.test(global.navigator.userAgent || "");
    var section = document.createElement("section");
    section.className = "bloc";
    section.innerHTML =
      "<h2>Installer le carnet <span class=\"u-jp\">手帳</span></h2>" +
      '<p class="bloc-note">Posé sur l\'écran d\'accueil, le carnet s\'ouvre en ' +
      "plein écran et sans barre d'adresse — et surtout, le navigateur ne le " +
      "referme plus pour faire de la place.</p>" +
      (iOS
        ? '<p class="u-urg-quoi">Sur iPhone : touchez <b>Partager</b> en bas de ' +
          "Safari, puis <b>Sur l'écran d'accueil</b>.</p>"
        : '<p class="u-urg-quoi">Sur Android : menu <b>⋮</b> de Chrome, puis ' +
          "<b>Ajouter à l'écran d'accueil</b>.</p>") +
      '<p class="u-urg-note">À faire une fois, en Wi-Fi, avant de partir.</p>';
    hote.appendChild(section);
  }

  /* ---------- montage ------------------------------------------------------ */

  function demarrer(hote) {
    var donnees = global.UTILE;
    if (!hote) return;
    if (!donnees) {
      hote.innerHTML = '<p class="bloc-note">Les fiches pratiques ne sont pas ' +
        "chargées (js/utile-donnees.js manquant).</p>";
      return;
    }
    hote.innerHTML = "";
    blocBase(hote);
    blocUrgences(hote, donnees);
    blocArgent(hote, donnees);
    blocTailles(hote, donnees);
    blocPhrases(hote, donnees);
    blocSecours(hote, donnees);
    blocCarte(hote);
    blocInstaller(hote);
    blocHeure(hote);
  }

  global.Utile = { demarrer: demarrer, copier: copier, rendreAvant: rendreAvant };
})(window);
