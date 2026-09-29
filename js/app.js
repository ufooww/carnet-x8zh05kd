/* Carnet Japon — l'application.
 *
 * Quatre onglets : la carte, la liste d'adresses, ce qu'il faut savoir avant de
 * partir, et les questions non tranchées. Les données viennent de js/donnees.js,
 * produit par outils/construire.py à partir de donnees/*.json. La page ne
 * fabrique rien qu'elle ne puisse refabriquer : elle n'est plus, comme
 * l'ancienne, la source de sa propre mise à jour.
 */

(function () {
  "use strict";

  var LIEUX = window.LIEUX || [], CONSEILS = window.CONSEILS || [],
      ATRANCHER = window.ATRANCHER || [], GALERIE = window.GALERIE || [];

  /* ⚠️ Une ville n'est pas une position — 29/09/2026.
   *
   * Faute de quartier, le géocodeur a posé dix-sept adresses au centre de leur
   * ville : treize sur la gare de Tokyo, deux sur le centre d'Osaka, une sur
   * la gare de Kyoto. Sur la carte, American Diner ou Nuir Vintage avaient
   * l'air d'être à Tokyo-eki — et « Itinéraire » y menait tout droit. Leur
   * adresse le dit pourtant : « quartier à confirmer ». Elles redeviennent
   * « non situées », comme les 130 autres dont on ne sait pas où elles sont :
   * le nom se cherche sur place, une fausse épingle égare. */
  var INCONNU = /(quartier|nom et quartier|ruelle|établissement) à confirmer|communiquée à la réservation|^À géocoder/;
  LIEUX.forEach(function (p) {
    if (p.lat != null && p.prec === "quartier" &&
        (!p.quartier || p.quartier === p.ville) && INCONNU.test(p.adresse || "")) {
      p.lat = null; p.lon = null; p.prec = "echec";
    }
  });

  var $ = function (id) { return document.getElementById(id); };

  function classeCat(c) {
    return "cat-" + (c || "").toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
  }
  function normaliser(s) {
    // L'apostrophe courbe et la fine insécable sont dans les fiches, jamais
    // sous les doigts de celui qui cherche. On les ramène au clavier, comme
    // le fait construire.py sur l'index.
    return (s || "").replace(/’/g, "'").replace(/ /g, " ")
      .normalize("NFKD").toLowerCase();
  }
  /* Deux gestes, un seul endroit où ils sont écrits : `js/sur.js`. Le carnet
     en avait sa propre version, qui ne filtrait que quatre caractères et ne
     regardait jamais les adresses — voir l'audit du 17/09/2026. Les alias
     locaux gardent les 60 appels existants lisibles. */
  var echapper = window.Sur.echapper;
  var urlSure = window.Sur.urlSure;
  var lienExterne = window.Sur.lien;

  /* ---------- onglets ----------------------------------------------------- */

  /* Tous les onglets — y compris ceux qu'on a retirés de la barre — pour que
     `allerAOnglet` puisse encore les activer. */
  var onglets = [].slice.call(document.querySelectorAll("nav.onglets button"));
  /* Ceux que l'on voit : la navigation aux flèches ne doit pas s'arrêter sur un
     onglet masqué, et le `tabindex` mobile ne doit pas s'y perdre. */
  function ongletsVisibles() {
    return onglets.filter(function (o) { return !o.hidden; });
  }
  var ongletCourant = 0;
  onglets.forEach(function (b, iCible) {
    b.addEventListener("click", function () {
      /* Le panneau entre du côté d'où il vient. `--dx` porte le signe ; le
         reste est dans la feuille de style. Réamorcer l'animation demande de
         la couper et de forcer un calcul de mise en page entre les deux,
         sinon le navigateur ne voit aucun changement et ne rejoue rien. */
      var pane = $(b.dataset.pane);
      var dx = iCible > ongletCourant ? 14 : -14;
      ongletCourant = iCible;
      pane.style.animation = "none";
      pane.style.setProperty("--dx", dx + "px");
      void pane.offsetWidth;
      pane.style.animation = "";

      onglets.forEach(function (o) {
        var actif = o === b;
        o.setAttribute("aria-selected", actif ? "true" : "false");
        // Seul l'onglet courant est atteignable à la tabulation ; les flèches
        // parcourent les autres. Sans ce `tabindex` mobile, il faut quatre
        // arrêts pour traverser la barre avant d'entrer dans la liste.
        o.setAttribute("tabindex", actif ? "0" : "-1");
        var pane = $(o.dataset.pane);
        if (actif) { pane.setAttribute("data-actif", ""); }
        else { pane.removeAttribute("data-actif"); }
      });
      // La carte a besoin de connaître sa taille : elle vient d'apparaître.
      if (b.dataset.pane === "paneCarte" && carte) { carte.rendre(); }
    });
  });

  /* Aller à un onglet par son identifiant. Tout le code qui navigue passe par
     ici : un onglet ajouté en tête ne doit plus jamais casser une destination. */
  function allerAOnglet(id) {
    var b = $(id);
    if (b) b.click();
  }

  /* Flèches, Origine et Fin dans la barre d'onglets — la convention ARIA, et
     surtout le seul moyen de changer de section au clavier une fois le
     `tabindex` mobile en place. Le focus suit la sélection : c'est l'usage
     pour des panneaux déjà chargés, où rien ne coûte à s'afficher. */
  var barreTablist = document.querySelector("nav.onglets");
  if (barreTablist) {
    barreTablist.addEventListener("keydown", function (e) {
      var visibles = ongletsVisibles();
      var i = visibles.indexOf(document.activeElement);
      if (i < 0) return;
      var cible = null;
      if (e.key === "ArrowRight") { cible = (i + 1) % visibles.length; }
      else if (e.key === "ArrowLeft") { cible = (i - 1 + visibles.length) % visibles.length; }
      else if (e.key === "Home") { cible = 0; }
      else if (e.key === "End") { cible = visibles.length - 1; }
      if (cible === null) return;
      e.preventDefault();
      visibles[cible].click();
      visibles[cible].focus();
    });
  }

  /* ---------- frontispice --------------------------------------------------
     Une fois par session, sautable au moindre geste, effacé seul en 1,9 s.
     Voir la section « frontispice » de la feuille de style pour le pourquoi. */

  function ouvrirFrontispice(total) {
    var vu = false;
    try { vu = sessionStorage.getItem("frontispice") === "1"; } catch (e) {}
    if (vu) return;
    try { sessionStorage.setItem("frontispice", "1"); } catch (e) {}

    var ecran = $("frontispice");
    var champ = $("fCompte");
    if (!ecran || !champ) return;
    ecran.hidden = false;
    ecran.setAttribute("aria-hidden", "true");

    var sobre = window.matchMedia &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (sobre) {
      champ.textContent = total;
    } else {
      /* Le compte se compose au lieu de s'afficher : c'est la collecte qu'on
         montre, pas le nombre. Courbe ralentie en fin de course, et on pose
         la valeur exacte au dernier pas — une interpolation ne retombe pas
         toujours juste. */
      var debut = 0, duree = 900;
      (function pas(t) {
        if (!debut) debut = t;
        var k = Math.min((t - debut) / duree, 1);
        champ.textContent = Math.round(total * (1 - Math.pow(1 - k, 3)));
        if (k < 1) { requestAnimationFrame(pas); }
        else { champ.textContent = total; }
      })(performance.now());
    }

    var fini = false;
    function fermer() {
      if (fini) return;
      fini = true;
      ecran.setAttribute("data-sort", "");
      setTimeout(function () { ecran.hidden = true; }, 430);
      document.removeEventListener("pointerdown", fermer);
      document.removeEventListener("keydown", fermer);
      document.removeEventListener("wheel", fermer);
    }
    document.addEventListener("pointerdown", fermer);
    document.addEventListener("keydown", fermer);
    document.addEventListener("wheel", fermer, { passive: true });
    setTimeout(fermer, sobre ? 1100 : 1900);
  }

  /* ---------- les envies ----------------------------------------------------
   *
   * Ce qui manquait le plus. Six personnes partent ensemble, et personne ne
   * pouvait dire « moi je veux faire ça » : le carnet était en lecture seule.
   *
   * Conservées dans `localStorage`, donc disponibles hors connexion et propres
   * à chacun — rien ne circule entre les six téléphones, et c'est assumé : une
   * liste partagée demanderait un serveur, que ce carnet n'a pas et ne doit pas
   * avoir. Chacun garde la sienne et la montre.
   *
   * La clé est le nom plus la ville, pas l'indice : les indices changent à
   * chaque reconstruction des données, et les envies de Paco seraient parties
   * se poser sur d'autres adresses au premier import.
   */
  var CLE_ENVIES = "carnet-japon-envies";
  var envies = {};

  function cleEnvie(p) { return (p.nom || "") + "|" + (p.ville || ""); }

  /* Ce qui sort du stockage est relu comme un fichier trouvé par terre : sur
     GitHub Pages, le tiroir `localStorage` est partagé par tout ce qui est
     publié sous le même compte, et une valeur peut aussi venir d'une version
     antérieure du carnet. On n'accepte qu'un objet plat dont chaque valeur
     vaut 1 — tout le reste redevient une liste vide plutôt que de se répandre
     dans l'affichage. */
  function envieValide(v) {
    return window.Sur.estDictionnaireSimple(v, function (x) { return x === 1; }, 2000);
  }

  function lireEnvies() {
    envies = window.Sur.lire(CLE_ENVIES, envieValide, {});
  }

  function ecrireEnvies() {
    /* L'échec n'est plus muet : en navigation privée sur iPhone le quota vaut
       zéro, et l'on gardait des adresses qui disparaissaient à la fermeture
       sans que rien ne l'ait dit. */
    if (!window.Sur.ecrire(CLE_ENVIES, envies)) {
      montrerPied("Vos envies ne peuvent pas être enregistrées sur cet appareil " +
                  "— navigation privée, ou stockage plein.",
                  { secondes: 6, refermable: true });
    }
  }

  function estEnvie(p) { return !!envies[cleEnvie(p)]; }

  function basculerEnvie(p) {
    var k = cleEnvie(p);
    if (envies[k]) { delete envies[k]; } else { envies[k] = 1; }
    ecrireEnvies();
    majMarquesEnvie(p);
    rendreAccueil();
  }

  function lieuxEnvies() {
    return LIEUX.filter(estEnvie);
  }

  /* Met à jour tous les boutons qui parlent de cette adresse — la fiche de la
     liste, le tiroir de la carte, la vignette de l'accueil peuvent être à
     l'écran en même temps. */
  function majMarquesEnvie(p) {
    var k = cleEnvie(p), garde = estEnvie(p);
    [].forEach.call(document.querySelectorAll("[data-envie]"), function (b) {
      if (b.getAttribute("data-envie") !== k) return;
      b.setAttribute("aria-pressed", garde ? "true" : "false");
      b.title = garde ? "Retirer de mes envies" : "Garder cette adresse";
      var t = b.querySelector(".e-texte");
      if (t) t.textContent = garde ? "Gardée" : "Garder";
    });
  }

  function boutonEnvie(p, avecTexte) {
    var garde = estEnvie(p);
    return '<button type="button" class="envie' + (avecTexte ? " avec-texte" : "") +
      '" data-envie="' + echapper(cleEnvie(p)) + '"' +
      ' aria-pressed="' + (garde ? "true" : "false") + '"' +
      ' title="' + (garde ? "Retirer de mes envies" : "Garder cette adresse") + '">' +
      '<span class="e-marque" aria-hidden="true"></span>' +
      (avecTexte ? '<span class="e-texte">' + (garde ? "Gardée" : "Garder") + "</span>"
                 : '<span class="hors-vue">Garder cette adresse</span>') +
      "</button>";
  }

  /* Branche les boutons d'envie contenus dans `hote`. Le lieu est retrouvé par
     sa clé, ce qui permet de brancher un fragment sans savoir quoi il porte. */
  function brancherEnvies(hote) {
    [].forEach.call(hote.querySelectorAll("[data-envie]"), function (b) {
      if (b._branche) return;
      b._branche = true;
      b.addEventListener("click", function (e) {
        e.stopPropagation();          // ne pas replier la fiche qu'on ouvre
        var k = b.getAttribute("data-envie");
        var p = LIEUX.filter(function (x) { return cleEnvie(x) === k; })[0];
        if (p) basculerEnvie(p);
      });
    });
  }

  /* ---------- état des filtres -------------------------------------------- */

  var etat = { texte: "", ville: "Toutes", cat: "Tout", cuisine: null };

  /* Déclaré ici plutôt qu'à côté de la porte qui l'allume : `correspond` s'en
     sert, et une `var` déclarée plus bas y vaudrait `undefined` au premier
     passage — ça marcherait par accident, pas par construction. */
  var filtreCitees = false;

  function correspond(p) {
    if (filtreCitees && (p.srcs || []).length < 2) return false;
    if (etat.ville !== "Toutes" && villeAffichee(p) !== etat.ville) return false;
    if (etat.cat !== "Tout" && p.cat !== etat.cat) return false;
    if (etat.cuisine && (p.cuisines || []).indexOf(etat.cuisine) < 0) return false;
    if (etat.texte) {
      // Chaque mot doit être présent : « issey shibuya » cherche les deux.
      var mots = etat.texte.split(/\s+/).filter(Boolean);
      for (var i = 0; i < mots.length; i++) {
        if (p._r.indexOf(mots[i]) < 0) return false;
      }
    }
    return true;
  }

  function retenus() { return LIEUX.filter(correspond); }

  /* ---------- construction des filtres ------------------------------------ */

  function compter(cle) {
    var c = {};
    LIEUX.forEach(function (p) { c[p[cle]] = (c[p[cle]] || 0) + 1; });
    return c;
  }

  /* Le kanji qu'on lit sur les devantures, pas une traduction du mot français.
     得 est celui de お得 — « bonne affaire ». Il est décoratif pour un lecteur
     d'écran : d'où aria-hidden, sinon la puce s'annonce deux fois. */
  var KANJI = {
    "Tout": "全", "Manger": "食", "Shopping": "買", "Visiter": "見",
    "Café": "茶", "Sortir": "夜", "Dormir": "宿", "Bon plan": "得",
    "Excursion": "旅"
  };

  function poserPuces(hote, valeurs, actif, surChoix, compte) {
    hote.innerHTML = "";
    valeurs.forEach(function (v) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "puce";
      b.setAttribute("aria-pressed", v === actif ? "true" : "false");
      b.innerHTML =
        (KANJI[v] ? '<span class="k" aria-hidden="true">' + KANJI[v] + "</span>" : "") +
        echapper(v) +
        (compte && compte[v] !== undefined
          ? ' <span class="n">' + compte[v] + "</span>" : "");
      b.addEventListener("click", function () { surChoix(v); });
      hote.appendChild(b);
    });
    if (hote.classList.contains("defilante")) { suivreDebord(hote); }
  }

  /* Marque les bords où il reste des filtres hors de l'écran, pour que le CSS
     y pose son fondu. Réévalué au défilement, au redimensionnement, et une fois
     après la pose — la largeur n'est connue qu'une fois les puces dans le DOM. */
  function suivreDebord(hote) {
    function majuger() {
      var reste = hote.scrollWidth - hote.clientWidth;
      if (reste <= 1) {
        hote.removeAttribute("data-gauche");
        hote.removeAttribute("data-droite");
        return;
      }
      if (hote.scrollLeft > 2) { hote.setAttribute("data-gauche", ""); }
      else { hote.removeAttribute("data-gauche"); }
      if (hote.scrollLeft < reste - 2) { hote.setAttribute("data-droite", ""); }
      else { hote.removeAttribute("data-droite"); }
    }
    if (!hote._debordSuivi) {
      hote._debordSuivi = true;
      hote.addEventListener("scroll", majuger, { passive: true });
      window.addEventListener("resize", majuger);
    }
    majuger();
    // Une seconde passe après la mise en page : sur Safari mobile, scrollWidth
    // vaut encore clientWidth au moment où l'on vient d'insérer les boutons.
    if (window.requestAnimationFrame) { requestAnimationFrame(majuger); }
  }

  /* Trente-six villes distinctes, dont trente-deux ne portent qu'une ou deux
     adresses : en faire trente-six boutons donnait une barre interminable où
     l'on ne retrouvait plus Tokyo. Les villes du voyage gardent leur bouton,
     le reste se range sous « Ailleurs ». */
  var VILLES_DU_VOYAGE = ["Tokyo", "Osaka", "Kyoto", "Kamakura"];
  var AILLEURS = "Ailleurs";

  function villeAffichee(p) {
    return VILLES_DU_VOYAGE.indexOf(p.ville) >= 0 ? p.ville : AILLEURS;
  }

  function compterVilles() {
    var c = {};
    LIEUX.forEach(function (p) {
      var v = villeAffichee(p);
      c[v] = (c[v] || 0) + 1;
    });
    return c;
  }

  var cVilles = compterVilles();
  var VILLES = ["Toutes"].concat(VILLES_DU_VOYAGE.filter(function (v) {
    return cVilles[v];
  }).concat(cVilles[AILLEURS] ? [AILLEURS] : []));
  var CATS = ["Tout"].concat(Object.keys(compter("cat"))
    .sort(function (a, b) { return compter("cat")[b] - compter("cat")[a]; }));

  /* Le total sur « Tout » et « Toutes ». Sans lui, on additionne les catégories
     visibles à l'écran — la barre en cache la moitié sur un téléphone — et l'on
     tombe sur un nombre inférieur au total annoncé en tête de page. Signalé le
     14/09/2026 : « en cumulant toutes les catégories on n'arrive pas à 544 ». */
  function avecTotal(compte, motTout) {
    var c = {}, somme = 0, k;
    for (k in compte) { if (compte.hasOwnProperty(k)) { c[k] = compte[k]; somme += compte[k]; } }
    c[motTout] = somme;
    return c;
  }

  function tousLesTypes() {
    var c = {};
    LIEUX.forEach(function (p) {
      (p.cuisines || []).forEach(function (t) { c[t] = (c[t] || 0) + 1; });
    });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; });
  }

  function rafraichirFiltres() {
    poserPuces($("filtresVille"), VILLES, etat.ville, function (v) {
      etat.ville = v;
      rafraichir();
      // Choisir une ville dans la liste doit aussi déplacer la carte : sans
      // cela, on bascule sur l'onglet Carte et on est resté à Tokyo.
      if (carte) {
        var pts = pointsCarte();
        if (pts.length) carte.cadrer(v === "Toutes" ? noyau(pts) : pts);
      }
    }, avecTotal(compterVilles(), "Toutes"));
    poserPuces($("filtresCat"), CATS, etat.cat, function (v) {
      etat.cat = v;
      if (v !== "Manger") etat.cuisine = null;
      rafraichir();
    }, avecTotal(compter("cat"), "Tout"));

    // Le filtre par type de cuisine n'apparaît que sous « Manger » : dix-huit
    // puces de plus en permanence noieraient les autres.
    var boite = $("filtresCuisine");
    if (etat.cat === "Manger") {
      var types = tousLesTypes();
      boite.style.display = "flex";
      poserPuces(boite, types, etat.cuisine, function (v) {
        etat.cuisine = (etat.cuisine === v) ? null : v;
        rafraichir();
      });
    } else {
      boite.style.display = "none";
      boite.innerHTML = "";
    }
  }

  /* Remet les quatre filtres à zéro. Appelé depuis deux endroits — le bandeau
     de la carte et l'état vide de la liste —, d'où la fonction plutôt que le
     gestionnaire recopié. */
  function toutReafficher() {
    etat.texte = ""; etat.ville = "Toutes"; etat.cat = "Tout"; etat.cuisine = null;
    filtreCitees = false;
    $("recherche").value = "";
    $("rechercheBoite").classList.remove("plein");
    rafraichir();
  }

  /* ---------- la liste ----------------------------------------------------- */

  function ligneFiche(p, i) {
    var li = document.createElement("li");
    li.className = "fiche " + classeCat(p.cat);
    li.dataset.i = i;

    var etiquettes = [];
    (p.marques || []).slice(0, 4).forEach(function (m) {
      etiquettes.push('<span class="eti marque">' + echapper(m) + "</span>");
    });
    (p.cuisines || []).slice(0, 3).forEach(function (c) {
      etiquettes.push('<span class="eti">' + echapper(c) + "</span>");
    });
    (p.reperes || []).forEach(function (r) {
      etiquettes.push('<span class="eti">' + echapper(r) + "</span>");
    });
    if (p.prec === "quartier") {
      etiquettes.push('<span class="eti approx">position au quartier</span>');
    } else if (p.prec === "echec") {
      etiquettes.push('<span class="eti approx">non située</span>');
    }
    if (p["avérifier"]) {
      etiquettes.push('<span class="eti approx">à vérifier</span>');
    }
    // Yoron, Fukuoka, Aichi : de vraies adresses, mais pas sur le trajet de
    // cet octobre. Elles restent au carnet et le disent, au lieu de porter
    // « HORS PERIMETRE » en capitales au milieu de la note.
    if (p.hors) {
      etiquettes.push('<span class="eti hors">hors du parcours</span>');
    }

    var sousLigne = [p.quartier, p.ville, p.genre].filter(Boolean)
      .map(echapper).join(" · ");

    li.innerHTML =
      '<button class="entete" type="button">' +
        '<span class="ligne1"><span class="nom">' + echapper(p.nom) + "</span>" +
          (p.jp ? '<span class="nom-jp">' + echapper(p.jp) + "</span>" : "") +
        "</span>" +
        '<span class="ligne2"><i class="pastille"></i>' + sousLigne + "</span>" +
        (p.note ? '<span class="extrait">' + gras(p.note) + "</span>" : "") +
        (p.alerte ? '<span class="alerte">' + gras(p.alerte) + "</span>" : "") +
        (etiquettes.length ? '<span class="etiquettes">' + etiquettes.join("") + "</span>" : "") +
      "</button>" +
      boutonEnvie(p, false) +
      '<div class="detail"></div>';

    brancherEnvies(li);

    li.querySelector("button.entete").addEventListener("click", function () {
      var ouvert = li.hasAttribute("data-ouvert");
      if (ouvert) { li.removeAttribute("data-ouvert"); return; }
      li.querySelector(".detail").innerHTML = detailHTML(p, false);
      li.setAttribute("data-ouvert", "");
      brancherDetail(li.querySelector(".detail"), p);
    });
    return li;
  }

  function detailHTML(p, avecNote, actionsEnDernier) {
    var dl = "";
    [["Adresse", p.adresse], ["Horaires", p.horaires], ["Fermé", p.ferme],
     ["Budget", p.budget], ["Accès", p.acces]].forEach(function (c) {
      if (c[1]) dl += "<dt>" + c[0] + "</dt><dd>" + gras(c[1]) + "</dd>";
    });
    var actions = boutonEnvie(p, true);
    /* Garder une adresse et lui donner un jour sont deux gestes différents :
       le premier dit « ça me tente », le second engage une matinée. Le bouton
       porte le compte quand l'adresse est déjà posée quelque part — sans ce
       retour, on la repose trois fois sans le savoir. */
    if (window.Jours) {
      actions += '<button class="bouton' + (window.Jours.joursDe(p).length ? " pose" : "") +
        '" data-jour>' + echapper(etiquetteJour(p)) + "</button>";
    }
    if (p.lat != null) {
      actions += '<button class="bouton plein" data-voir>Voir sur la carte</button>';
    }
    /* Le nom en kanji est ce qu'on tend à quelqu'un dans la rue. Sans nom
       japonais il n'y a rien à montrer : 400 fiches sur 544 en portent un. */
    if (p.jp) {
      actions += '<button class="bouton" data-montrer>見せる · Montrer</button>';
    }
    /* **Itinéraire, et non plus recherche.** Sur place, la question n'est
       jamais « où est-ce ? » mais « comment j'y vais ? » — et Google Maps sait
       répondre en transports en commun à Tokyo mieux que n'importe quoi
       d'autre. Quand l'adresse est située, on donne les coordonnées : un nom
       de restaurant, même en japonais, peut désigner trois enseignes d'une
       chaîne ; une latitude n'en désigne qu'une.
       `noreferrer` en plus de `noopener` : sans lui, Google apprend l'adresse
       exacte du carnet à chaque itinéraire demandé. */
    actions += '<a class="bouton" target="_blank" rel="noopener noreferrer" ' +
      'href="' + echapper(lienItineraire(p)) + '">Itinéraire ↗</a>';
    /* Envoyer une adresse au groupe. Le carnet ne se partage pas en entier —
       c'est le rôle du bloc « Partager » de l'accueil ; ici c'est une adresse,
       une seule, celle qu'on vient de trouver. */
    actions += '<button class="bouton" data-envoyer>Envoyer ↗</button>';

    var videos = "";
    if ((p.srcs || []).length) {
      /* `echapper` ne protège pas une adresse : `javascript:…` la traverse
         sans une égratignure et s'exécute au premier doigt posé dessus. Ces
         adresses viennent de fichiers alimentés par des scripts qui lisent
         TikTok et Instagram — c'est exactement le champ auquel on ne peut pas
         faire confiance. `Sur.lien` n'ouvre que du https. */
      videos = '<div class="videos">' + p.srcs.map(function (u, k) {
        return lienExterne(u, "Vidéo " + (k + 1) + " ↗");
      }).join("") + "</div>";
    }
    /* L'ordre des deux derniers blocs dépend de l'endroit.
       · Dans le tiroir de la carte, les actions sont collées au bas
         (`position: sticky`) : elles doivent donc venir en dernier, sinon les
         liens de vidéos se glissent sous la barre collée.
       · Dans la liste, rien n'est collé — et mettre « Vidéo 1 » avant
         « Garder » et « Voir sur la carte » reléguerait les gestes derrière
         une simple référence. */
    var tete = (avecNote && p.note ? '<p class="note">' + gras(p.note) + "</p>" : "") +
               (p.alerte ? '<p class="alerte forte">' + gras(p.alerte) + "</p>" : "") +
               (dl ? "<dl>" + dl + "</dl>" : "");
    var blocActions = '<div class="actions">' + actions + "</div>";
    return tete + (actionsEnDernier ? videos + blocActions : blocActions + videos);
  }

  function etiquetteJour(p) {
    var poses = window.Jours.joursDe(p);
    if (!poses.length) return "Poser un jour";
    return "Posée " + (poses.length > 1 ? "sur " + poses.length + " jours"
      : "le " + window.Jours.libelleJour(window.Jours.dateDepuisCle(poses[0])));
  }

  /* La destination confiée à Google Maps. Des coordonnées seulement quand
     elles désignent la porte : une adresse posée au centre de son quartier y
     aurait envoyé à trois cents mètres de la boutique. Le nom, suivi du
     quartier, trouve l'enseigne — et le quartier départage les chaînes
     (Okura Umeda n'est pas Okura Shinsaibashi). */
  function lienItineraire(p) {
    var dest = (p.lat != null && p.prec !== "quartier")
      ? p.lat + "," + p.lon
      : [p.jp || p.nom, p.prec === "quartier" && p.quartier !== p.ville ? p.quartier : "",
         p.ville].filter(Boolean).join(" ");
    return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(dest);
  }

  /* Les alertes portent parfois un <b> voulu par la rédaction. On échappe tout,
   * puis on rend ce seul balisage : afficher du HTML brut venu des données
   * serait une porte ouverte, et l'échapper entièrement montrerait « <b> ». */
  function gras(s) {
    return echapper(s).replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>");
  }

  function brancherDetail(hote, p) {
    brancherMontrer(hote, p);
    brancherEnvies(hote);
    var be = hote.querySelector("[data-envoyer]");
    if (be) {
      be.addEventListener("click", function (e) {
        e.stopPropagation();
        envoyerLieu(p, be);
      });
    }
    var bj = hote.querySelector("[data-jour]");
    if (bj && window.Jours) {
      bj.addEventListener("click", function (e) {
        e.stopPropagation();
        window.Jours.ouvrirChoix(p);
      });
    }
    var b = hote.querySelector("[data-voir]");
    if (!b) return;
    b.addEventListener("click", function () {
      // Par identifiant, pas par indice : l'ajout de l'onglet Accueil en tête
      // a décalé toute la barre, et `onglets[0]` menait désormais à l'accueil.
      allerAOnglet("ongletCarte");
      if (carte) { carte.allerA(p.lat, p.lon, 17); ouvrirTiroir(p); }
    });
  }

  /* Une adresse envoyée au groupe. Sur un téléphone, `navigator.share` ouvre
     la feuille de partage du système — WhatsApp, Messages, ce qu'on veut.
     Ailleurs, et quand l'utilisateur annule, on retombe sur le presse-papier :
     un bouton qui ne fait rien est pire qu'un bouton absent. */
  function texteDuLieu(p) {
    var bouts = [p.nom];
    if (p.jp) bouts.push(p.jp);
    var ou = [p.quartier, p.ville].filter(Boolean).join(", ");
    var t = bouts.join(" ") + (ou ? " — " + ou : "");
    if (p.adresse) t += "\n" + p.adresse;
    t += "\n" + lienItineraire(p);
    return t;
  }

  function envoyerLieu(p, bouton) {
    var texte = texteDuLieu(p);
    if (navigator.share) {
      navigator.share({ title: p.nom, text: texte }).catch(function () {
        // Annulé, ou refusé : on ne dit rien, l'utilisateur sait ce qu'il a fait.
      });
      return;
    }
    if (window.Utile) window.Utile.copier(texte, bouton);
  }

  function brancherMontrer(hote, p) {
    var b = hote.querySelector("[data-montrer]");
    if (b) b.addEventListener("click", function () { montrer(p); });
  }

  /* Plein écran, fond clair, rien que le nom. Voir la section « montrer » de
     la feuille de style pour le raisonnement. */
  var montrerRetour = null;   // à qui rendre le focus en refermant

  /* Le panneau ne sert plus seulement à tendre le nom d'un restaurant : il
     montre aussi une phrase japonaise et l'adresse de son logement. Trois
     lignes, toujours les mêmes — le gros en japonais, ce que ça veut dire,
     puis le détail. */
  function montrerTexte(gros, dessous, detail) {
    $("montrerJp").textContent = gros || "";
    $("montrerNom").textContent = dessous || "";
    $("montrerLieu").textContent = detail || "";
    montrerRetour = document.activeElement;
    $("montrer").hidden = false;
    $("montrerFermer").focus();
  }

  function montrer(p) {
    $("montrerJp").textContent = p.jp || p.nom;
    $("montrerNom").textContent = p.jp ? p.nom : "";
    $("montrerLieu").textContent =
      [p.quartier, p.ville].filter(Boolean).join(" · ");
    montrerRetour = document.activeElement;
    $("montrer").hidden = false;
    // Le panneau recouvre le carnet : le focus doit y entrer, sinon la
    // tabulation continue de parcourir des fiches devenues invisibles.
    $("montrerFermer").focus();
  }

  function fermerMontrer() {
    if ($("montrer").hidden) return;
    $("montrer").hidden = true;
    // Rendu au bouton d'où l'on venait : sans cela, le focus retombe en haut
    // de la page et l'on a perdu sa place dans une liste de 544 entrées.
    if (montrerRetour && document.contains(montrerRetour)) { montrerRetour.focus(); }
    montrerRetour = null;
  }

  $("montrerFermer").addEventListener("click", fermerMontrer);
  /* Échap ferme aussi : le panneau recouvre tout, et sur un ordinateur le
     bouton n'est pas le premier réflexe. */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { fermerMontrer(); return; }
    /* Le panneau est modal : la tabulation ne doit pas en sortir. Il ne
       contient qu'un seul élément atteignable, donc tout Tab y revient. */
    if (e.key === "Tab" && !$("montrer").hidden) {
      e.preventDefault();
      $("montrerFermer").focus();
    }
  });

  /* Replie la barre de filtres dès qu'on descend dans une liste, la rouvre au
     premier geste vers le haut. Le seuil de 6 px évite qu'un tremblement de
     doigt ne fasse clignoter la barre ; les 30 premiers pixels la gardent
     toujours ouverte, sinon on ne peut plus taper une recherche sans que la
     zone se dérobe. */
  function replierAuDefilement(pane) {
    var zone = pane.querySelector(".defile");
    if (!zone) return;
    var precedent = 0;
    zone.addEventListener("scroll", function () {
      var y = zone.scrollTop;
      if (Math.abs(y - precedent) < 6) return;
      if (y > precedent && y > 30) { pane.setAttribute("data-replie", ""); }
      else if (y < precedent)      { pane.removeAttribute("data-replie"); }
      precedent = y;
    }, { passive: true });
  }
  [].forEach.call(document.querySelectorAll(".pane"), replierAuDefilement);

  function rafraichirListe() {
    var l = retenus();
    var ul = $("liste");
    ul.innerHTML = "";
    if (!l.length) {
      /* « Essayez moins de filtres » demandait de deviner lesquels. Le cas
         courant est une catégorie restée active d'une consultation précédente
         plus un mot de recherche : on cherche « ramen » avec Shopping coché et
         l'on conclut que le carnet est vide. On nomme donc ce qui filtre, et
         l'on offre de tout rouvrir d'un geste. */
      var actifs = [];
      if (filtreCitees)            actifs.push("Les plus citées");
      if (etat.texte)              actifs.push("« " + $("recherche").value.trim() + " »");
      if (etat.ville !== "Toutes") actifs.push(etat.ville);
      if (etat.cat !== "Tout")     actifs.push(etat.cat);
      if (etat.cuisine)            actifs.push(etat.cuisine);

      /* Le compte reste écrit — c'est lui qui est annoncé à voix haute — mais
         il sort de la vue : à l'écran il répétait mot pour mot le message
         placé juste en dessous. */
      $("compte").textContent = "Aucune adresse";
      $("compte").classList.add("hors-vue");
      ul.innerHTML =
        '<li class="vide">' +
          "<p><b>Aucune des " + LIEUX.length + " adresses ne correspond.</b></p>" +
          (actifs.length
            ? "<p>Filtres en cours : " +
              actifs.map(function (a) {
                return '<span class="eti">' + echapper(a) + "</span>";
              }).join(" ") + "</p>"
            : "") +
          '<p><button type="button" class="bouton plein" id="videVider">' +
            "Tout réafficher</button></p>" +
        "</li>";
      var bv = $("videVider");
      if (bv) bv.addEventListener("click", function () { toutReafficher(); });
      return;
    }
    // Le tri met en tête ce qu'on peut atteindre : une adresse non située
    // en fin de liste vaut mieux qu'en travers du chemin.
    l.sort(function (a, b) {
      if ((a.prec === "echec") !== (b.prec === "echec")) return a.prec === "echec" ? 1 : -1;
      return a.nom.localeCompare(b.nom, "fr");
    });
    var frag = document.createDocumentFragment();
    l.forEach(function (p) { frag.appendChild(ligneFiche(p, LIEUX.indexOf(p))); });
    ul.appendChild(frag);
    $("compte").classList.remove("hors-vue");
    $("compte").textContent = l.length + " adresse" + (l.length > 1 ? "s" : "") +
      (l.length < LIEUX.length ? " sur " + LIEUX.length : "");
  }

  /* ---------- la carte ------------------------------------------------------ */

  var carte = null;

  /* `groupe` : la liste d'où l'on vient, quand la fiche a été ouverte depuis
     un amas — un lien permet d'y revenir sans refermer le tiroir. */
  var lieuTiroir = null;      // la fiche affichée dans le tiroir, s'il y en a une

  function ouvrirTiroir(p, groupe) {
    lieuTiroir = p;
    $("tiroirCorps").innerHTML =
      (groupe ? '<p class="tiroir-retour"><button type="button" class="lien" id="tiroirRetour">← Les ' +
                groupe.length + " adresses de cet endroit</button></p>" : "") +
      "<h3>" + echapper(p.nom) + (p.jp ? ' <span class="nom-jp">' + echapper(p.jp) + "</span>" : "") + "</h3>" +
      '<p class="ligne2 situation">' +
      [p.quartier, p.ville, p.genre].filter(Boolean).map(echapper).join(" · ") + "</p>" +
      detailHTML(p, true, true);
    /* « Voir sur la carte » n'a pas de sens dans le tiroir de la carte : on
       l'ôte avant de brancher, sinon on branche un bouton qu'on supprime. */
    var b = $("tiroirCorps").querySelector("[data-voir]");
    if (b) b.remove();
    brancherDetail($("tiroirCorps"), p);
    if (groupe) {
      $("tiroirRetour").addEventListener("click", function () { ouvrirGroupe(groupe); });
    }
    // Une nouvelle fiche s'ouvre en haut, pas au niveau où l'on avait laissé
    // défiler la précédente.
    $("tiroir").scrollTop = 0;
    $("tiroir").setAttribute("data-ouvert", "");
    if (carte) carte.mettreEnAvantLieu(p);
  }

  /* Les adresses qu'aucun zoom ne sépare — même immeuble, ou posées au centre
     de leur quartier faute d'adresse exacte. Avant le 29/09/2026 leur disque
     ne s'ouvrait jamais : 65 adresses étaient inaccessibles depuis la carte.
     On les donne en liste, dans le tiroir. */
  function ouvrirGroupe(membres) {
    lieuTiroir = null;
    var tries = membres.slice().sort(function (a, b) { return a.nom.localeCompare(b.nom, "fr"); });
    var approx = tries.filter(function (p) { return p.prec === "quartier"; }).length;
    var pourquoi = approx === tries.length
      ? "Posées au centre du quartier : leur adresse exacte n’est pas connue. Le nom se cherche sur place."
      : approx
        ? "Au même endroit sur la carte — certaines ne sont placées qu’au quartier."
        : "Même immeuble ou même rue : la carte ne peut pas les séparer.";
    $("tiroirCorps").innerHTML =
      "<h3>" + tries.length + " adresses à cet endroit</h3>" +
      '<p class="ligne2 situation">' + pourquoi + "</p>" +
      '<ul class="groupe-liste">' + tries.map(function (p, k) {
        return '<li><button type="button" class="groupe-lieu ' + classeCat(p.cat) +
          '" data-k="' + k + '"><i class="pastille"></i><span class="g-txt">' +
          '<span class="g-nom">' + echapper(p.nom) + "</span>" +
          '<span class="g-sous">' + [p.genre || p.cat, p.quartier].filter(Boolean)
            .map(echapper).join(" · ") + "</span></span></button></li>";
      }).join("") + "</ul>";
    [].forEach.call($("tiroirCorps").querySelectorAll(".groupe-lieu"), function (b) {
      b.addEventListener("click", function () { ouvrirTiroir(tries[+b.dataset.k], tries); });
    });
    $("tiroir").scrollTop = 0;
    $("tiroir").setAttribute("data-ouvert", "");
    if (carte) carte.mettreEnAvantLieu(null);
  }

  $("tiroirFermer").addEventListener("click", function () {
    $("tiroir").removeAttribute("data-ouvert");
    if (carte) carte.mettreEnAvantLieu(null);
  });

  function pointsCarte() {
    return retenus().filter(function (p) { return p.lat != null; });
  }

  /* Cadrer sur *tous* les points ouvre la carte sur le Japon entier : le carnet
   * contient une adresse à Sapporo, une à Fukuoka, une à Hiroshima, et ces trois
   * points étirent l'emprise sur 1 200 km alors que 268 adresses sur 284 tiennent
   * dans trois villes. On cadre donc sur la ville la mieux représentée parmi les
   * points affichés — c'est là qu'on veut regarder. */
  function noyau(points) {
    var parVille = {};
    points.forEach(function (p) {
      (parVille[p.ville] = parVille[p.ville] || []).push(p);
    });
    var meilleure = null;
    Object.keys(parVille).forEach(function (v) {
      if (!meilleure || parVille[v].length > parVille[meilleure].length) meilleure = v;
    });
    return meilleure ? parVille[meilleure] : points;
  }

  function demarrerCarte() {
    carte = new window.CarteJapon($("carte"), {
      lat: 35.68, lon: 139.76, zoom: 11,
      // Les tuiles viennent de CARTO, dont les fonds de plan sont publics et
      // dont le style sombre convient au thème de nuit. On n'utilise plus
      // OpenStreetMap en direct : leur politique interdit l'usage par une
      // application tierce et leurs serveurs nous répondent « access denied ».
      //
      // Plus d'archive imposée au démarrage : Paco a tranché le 02/09, il veut
      // d'abord une carte complète et fluide. Nos archives ne couvraient que
      // la moitié de la surface aux niveaux fins, ce qui donnait un patchwork
      // d'échelles au zoom. Le hors-connexion redeviendra une option, pas une
      // condition d'affichage.
      zoomMin: 3, zoomMax: 19,
      surClic: function (p) { ouvrirTiroir(p); },
      surGroupe: function (membres) { ouvrirGroupe(membres); },
      surPosition: function (coords, proches, err) {
        var boite = $("autour");
        /* Un échec de localisation doit se lire À L'ÉCRAN. Le motif n'était
           donné que dans le `title` du bouton — c'est-à-dire nulle part sur un
           téléphone, où rien ne survole. On tapait « ma position », il ne se
           passait rien, et le carnet paraissait cassé (constaté le 14/09/2026). */
        if (!coords && err) {
          var quoi;
          if (err.code === -1 || window.isSecureContext === false) {
            quoi = "Le carnet est ouvert en <b>http</b> : le navigateur y interdit " +
                   "la localisation. Rouvrez-le en <b>https</b> — même adresse, " +
                   "même port.";
          } else if (err.code === 1) {
            quoi = "Localisation refusée. À réautoriser dans les réglages du " +
                   "navigateur pour ce site.";
          } else if (err.code === 2 || err.code === 3) {
            // La veille continue : voir `suivrePosition`. On ne dit donc pas
            // « réessayez », puisque le carnet réessaie tout seul.
            quoi = "Pas encore de position — le téléphone cherche toujours. " +
                   "À découvert, loin des tours, c’est plus rapide.";
          } else {
            quoi = "Ce navigateur ne sait pas se localiser.";
          }
          if (!autourMasque) boite.setAttribute("data-actif", "");
          $("autourListe").innerHTML = '<li class="avis">' + quoi + "</li>";
          return;
        }
        if (!coords) { boite.removeAttribute("data-actif"); return; }
        if (!autourMasque) boite.setAttribute("data-actif", "");
        $("autourListe").innerHTML = proches.map(function (e) {
          var d = e.m < 1000 ? Math.round(e.m) + " m"
                             : (e.m / 1000).toFixed(1) + " km";
          return '<li data-nom="' + echapper(e.p.nom) + '"><span class="d">' +
                 d + " " + e.cap + "</span><span>" + echapper(e.p.nom) + "</span></li>";
        }).join("") || "<li>Rien du carnet à moins de 3 km.</li>";
        [].slice.call($("autourListe").children).forEach(function (li, k) {
          li.addEventListener("click", function () {
            var p = proches[k] && proches[k].p;
            if (p) { carte.allerA(p.lat, p.lon, 17); ouvrirTiroir(p); }
          });
        });
      }
    });
    var pts = pointsCarte();
    carte.definirPoints(pts);
    // Ouverture déterministe sur la ville la mieux représentée. Le cadrage
    // automatique donnait un zoom imprévisible selon le moment où la mise en
    // page était prête ; ici on sait toujours où l'on arrive.
    var n = noyau(pts);
    if (n.length) {
      var somLat = 0, somLon = 0;
      n.forEach(function (p) { somLat += p.lat; somLon += p.lon; });
      carte.allerA(somLat / n.length, somLon / n.length, 12);
    }
    // Exposée pour pouvoir diagnostiquer depuis la console du navigateur —
    // c'est ce qui a permis de trouver le trou de tuiles au-delà du zoom 15.
    window.carteJapon = carte;

    /* Le panneau « Autour de moi » se referme. Le point bleu reste — c'est
       lui qu'on suit en marchant — mais la liste, qui peut couvrir 40 % de la
       carte, ne revient qu'au prochain appui sur « ma position ». Sans cette
       retenue, la position suivante la rouvrait dans la seconde. */
    $("autourFermer").addEventListener("click", function () {
      autourMasque = true;
      $("autour").removeAttribute("data-actif");
    });
    $("carte").addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".jp-moi")) autourMasque = false;
    }, true);
  }
  var autourMasque = false;

  function rafraichirCarte() {
    if (!carte) return;
    carte.definirPoints(pointsCarte());
    majBandeauFiltre();
  }

  /* Une recherche tapée dans l'onglet Adresses filtre aussi la carte — c'est
   * cohérent, mais invisible : on revient à la carte, il ne reste que deux
   * épingles, et rien n'explique pourquoi. Ce bandeau le dit et permet de
   * tout réafficher d'un geste. */
  function majBandeauFiltre() {
    var b = $("filtreActif");
    if (!b) return;
    var bouts = [];
    if (filtreCitees) bouts.push("Les plus citées");
    if (etat.texte) bouts.push("« " + $("recherche").value.trim() + " »");
    if (etat.ville !== "Toutes") bouts.push(etat.ville);
    if (etat.cat !== "Tout") bouts.push(etat.cat);
    if (etat.cuisine) bouts.push(etat.cuisine);
    if (!bouts.length) { b.hidden = true; return; }
    /* Deux nombres, et ils diffèrent légitimement : la liste compte les
       adresses retenues, la carte ne peut afficher que celles qui ont une
       position. « Les plus citées » en donne 62 dans la liste et 55 sur la
       carte. Le bandeau dit donc « sur la carte » — sans quoi on croit à une
       erreur de comptage en passant d'un onglet à l'autre. */
    var surCarte = carte ? carte.points.length : 0;
    var total = retenus().length;
    $("filtreActifTexte").textContent =
      bouts.join(" · ") + " — " + surCarte +
      (surCarte > 1 ? " adresses" : " adresse") +
      (total > surCarte ? " sur la carte, " + total + " en tout" : "");
    b.hidden = false;
  }

  /* Les filtres de la carte sont volontairement plus courts que ceux de la
   * liste : dans la rue on trie par envie, pas par critère. */
  function filtresCarte() {
    var valeurs = CATS;
    poserPuces($("filtresCarte"), valeurs, etat.cat, function (v) {
      etat.cat = v;
      if (v !== "Manger") etat.cuisine = null;
      rafraichir();
    }, avecTotal(compter("cat"), "Tout"));
  }

  /* ---------- l'accueil ------------------------------------------------------
   *
   * Quatre blocs : combien de jours il reste, ce qu'on a gardé, trois entrées
   * dans les 544, et une adresse au hasard. Aucune carte, aucune ombre — les
   * blocs se séparent au filet, comme les fiches. Un écran d'accueil est le
   * premier endroit où le kit SaaS s'installe.
   */

  /* Le départ de Paris et l'arrivée au Japon sont deux jours différents : on
     s'envole le 1er, on se réveille à Tokyo le 2. Le compte à rebours visait
     l'arrivée en annonçant « avant le départ » — il avait un jour de retard
     (corrigé le 29/09/2026). Le programme, lui, commence bien le 2. */
  var DEPART  = new Date(2026, 9, 1);
  var ARRIVEE = new Date(2026, 9, 2);    // vendredi 2 octobre 2026
  var RETOUR  = new Date(2026, 9, 23);

  function rendreDepart() {
    var jour = 24 * 3600 * 1000;
    var aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    var reste = Math.round((DEPART - aujourdhui) / jour);

    var chiffre = $("departJours"), mot = $("departMot"), dates = $("departDates");
    if (reste > 1) {
      chiffre.textContent = reste;
      mot.textContent = "jours avant le départ";
    } else if (reste === 1) {
      chiffre.textContent = "Demain";
      mot.textContent = "le départ";
    } else if (reste === 0) {
      chiffre.textContent = "Aujourd’hui";
      mot.textContent = "le départ";
    } else if (aujourdhui <= RETOUR) {
      // Sur place : le compte à rebours n'a plus de sens, le jour de voyage si.
      chiffre.textContent = "Jour " + (Math.round((aujourdhui - ARRIVEE) / jour) + 1);
      mot.textContent = "au Japon";
    } else {
      chiffre.textContent = "C’était bien";
      mot.textContent = "";
    }
    dates.textContent = "octobre 2026";
    $("departSource").textContent =
      LIEUX.length + " adresses relevées sur 368 vidéos et 200 publications";
  }

  /* Une vignette d'adresse, compacte : de quoi reconnaître et décider. Sert à
     la fois aux envies et au tirage au hasard. */
  function vignetteLieu(p) {
    return '<div class="v-lieu">' +
      '<button type="button" class="v-ouvrir">' +
        '<span class="v-nom">' + echapper(p.nom) + "</span>" +
        (p.jp ? '<span class="v-jp">' + echapper(p.jp) + "</span>" : "") +
        '<span class="v-lieu2"><i class="pastille ' + classeCat(p.cat) + '"></i>' +
          [p.quartier, p.ville].filter(Boolean).map(echapper).join(" · ") + "</span>" +
        (p.note ? '<span class="v-note">' + gras(p.note) + "</span>" : "") +
      "</button>" +
      boutonEnvie(p, true) +
    "</div>";
  }

  /* Ouvre une adresse là où elle se lit le mieux : sur la carte si on sait où
     elle est, dans la liste sinon — 135 adresses n'ont pas de position. */
  function ouvrirLieu(p) {
    if (p.lat != null) {
      /* Une envie gardée hier, ouverte aujourd'hui avec « Shopping » coché
         sur la carte : la vue s'y posait, mais l'épingle n'y était pas — le
         filtre l'excluait. On rouvre tout plutôt que de montrer un vide. */
      if (!correspond(p)) toutReafficher();
      allerAOnglet("ongletCarte");
      if (carte) { carte.allerA(p.lat, p.lon, 16); ouvrirTiroir(p); }
      return;
    }
    toutReafficher();
    allerAOnglet("ongletListe");
    $("recherche").value = p.nom;
    $("rechercheBoite").classList.add("plein");
    etat.texte = normaliser(p.nom);
    rafraichir();
  }

  function brancherOuvertures(hote, lieux) {
    [].slice.call(hote.querySelectorAll(".v-ouvrir")).forEach(function (b, i) {
      b.addEventListener("click", function () { ouvrirLieu(lieux[i]); });
    });
    brancherEnvies(hote);
  }

  function rendreEnvies() {
    var gardes = lieuxEnvies();
    var corps = $("enviesCorps");
    $("nEnvies").textContent = gardes.length ? gardes.length : "";

    if (!gardes.length) {
      /* Un écran vide invite à agir, il ne constate pas. On dit le geste exact
         et où le faire. */
      corps.innerHTML =
        '<p class="invite">Rien de gardé pour l’instant. Sur une adresse qui ' +
        'vous tente, touchez <span class="e-marque en-ligne" aria-hidden="true"></span> ' +
        '<b>Garder</b> — elle reviendra ici.</p>' +
        '<p><button type="button" class="bouton" id="enviesParcourir">' +
        'Parcourir les adresses</button></p>';
      var bp = $("enviesParcourir");
      if (bp) bp.addEventListener("click", function () {
        toutReafficher(); allerAOnglet("ongletListe");
      });
      return;
    }
    corps.innerHTML = gardes.map(vignetteLieu).join("");
    brancherOuvertures(corps, gardes);
  }

  /* Les trois portes. Chacune est un vrai raccourci vers un état du carnet —
     pas une catégorie de plus : elles existent parce qu'elles répondent à une
     question qu'on se pose vraiment. */
  function rendrePortes() {
    var hote = $("portes");
    var citees = LIEUX.filter(function (p) { return (p.srcs || []).length >= 2; });

    var portes = [
      { jp: "近", titre: "Près de moi",
        sous: "Ce que le carnet connaît autour de vous",
        faire: function () {
          allerAOnglet("ongletCarte");
          autourMasque = false;
          // La carte vient d'apparaître : lui laisser le temps de connaître sa
          // taille avant de la recentrer sur la position.
          setTimeout(function () {
            if (carte && carte.maPosition) carte.maPosition();
          }, 60);
        } },
      { jp: "食", titre: "Manger",
        sous: compter("cat")["Manger"] + " adresses",
        faire: function () {
          toutReafficher(); etat.cat = "Manger"; rafraichir();
          allerAOnglet("ongletListe");
        } },
      { jp: "推", titre: "Les plus citées",
        sous: citees.length + " adresses revenues dans plusieurs vidéos",
        faire: function () { ouvrirLesPlusCitees(citees); } }
    ];

    hote.innerHTML = portes.map(function (e) {
      return '<button type="button" class="porte">' +
        '<span class="p-jp" aria-hidden="true">' + e.jp + "</span>" +
        '<span class="p-txt"><span class="p-titre">' + echapper(e.titre) + "</span>" +
        '<span class="p-sous">' + echapper(e.sous) + "</span></span>" +
      "</button>";
    }).join("");

    [].slice.call(hote.querySelectorAll(".porte")).forEach(function (b, i) {
      b.addEventListener("click", portes[i].faire);
    });
  }

  /* Le corpus se répète : 62 adresses sont citées par deux vidéos ou plus, une
     par cinq. C'est une recommandation qui dormait dans les données. */
  function ouvrirLesPlusCitees() {
    toutReafficher();
    filtreCitees = true;
    allerAOnglet("ongletListe");
    rafraichir();
  }

  function rendreHasard() {
    var p = LIEUX[Math.floor(Math.random() * LIEUX.length)];
    var corps = $("hasardCorps");
    corps.innerHTML = vignetteLieu(p);
    brancherOuvertures(corps, [p]);
  }

  /* La constellation. Créée une fois, redessinée quand une envie change —
     c'est ce qui fait que garder une adresse l'allume aussitôt dans le ciel. */
  var ciel = null;

  function demarrerConstellation() {
    var toile = $("ciel");
    if (!toile || !window.Constellation) return;

    /* L'aurore, sous le dessin. Elle n'est pas indispensable : si WebGL
       manque, `poser` rend `null` et le dégradé CSS tient le rôle — la
       constellation, elle, s'affiche dans tous les cas. Le grand format
       reçoit la sienne, un peu plus sourde : sur toute la hauteur d'un écran,
       la même intensité mangerait les points les plus faibles. */
    if (window.Aurore) {
      /* Le fond de tout l'accueil, pas seulement de la vignette : on lui
         passe la zone qui défile pour que le soleil monte à mesure qu'on
         descend dans la page. */
      /* Un seul ciel, derrière le site entier, et il ne défile pas. On lui
         passe les quatre zones qui défilent : celle qui bouge est celle
         qu'on regarde, et c'est elle qui fait monter le soleil. */
      window.Aurore.poser(document.body, {
        defile: document.querySelectorAll(".pane .defile")
      });
      window.Aurore.poser($("grandCiel"), { intensite: 0.88 });
    }
    ciel = new window.Constellation(toile, LIEUX, {
      estGarde: estEnvie,
      // Toucher un point ouvre l'adresse : c'est ce qui sépare une image d'un
      // outil. On passe par le même chemin que partout ailleurs dans le carnet.
      surChoix: function (p) { ouvrirLieu(p); },

      /* Retour d'un ami de Paco, le 16/09 : « on ne comprend pas trop ». Il
         avait raison, et le défaut n'était pas la taille seule.
         · Le remplissage passe de 0,74 à 0,94 : la nuée touche presque les
           deux bords. À 0,74 elle flottait au milieu d'un cadre vide, ce qui
           la faisait lire comme un ornement plutôt que comme une carte.
         · **Les noms de quartiers arrivent dans la vignette.** Ils étaient
           réservés au plein écran faute de place ; le cadre agrandi la donne.
           Ce sont eux qui font la différence : sans eux on admire une nuée,
           avec eux on reconnaît Shibuya et Shinjuku — et l'on comprend
           d'un coup qu'on regarde Tokyo. */
      remplissage: 0.94,
      remplissageH: 0.72,
      /* Le cadrage se fait sur la masse, pas sur les extrêmes. Tokyo a
         quelques adresses très excentrées — Disneyland, l'aéroport — et
         cadrer dessus réduisait le centre dense à un petit amas au milieu
         d'un cadre vide : d'où l'impression de petitesse. En écartant 6 % des
         points les plus éloignés du calcul, Shibuya, Shinjuku et Ueno
         remplissent enfin le cadre. Les quelques adresses écartées sortent du
         cadre — elles restent dans la liste, sur la carte et en plein écran. */
      rejet: 0.06,
      avecQuartiers: true
    });
    ciel.demarrer();
    // Exposée pour le diagnostic depuis la console, comme `carteJapon`.
    window.constellation = ciel;

    /* Le choix de la ville. Trois puces, dans l'ordre du séjour — Tokyo
       d'abord, où l'on passe quatorze des vingt et une nuits et où le carnet
       compte le plus d'adresses. */
    var hote = $("cielVilles");
    var cadres = window.Constellation.CADRES;
    function poser() {
      hote.innerHTML = "";
      cadres.forEach(function (c) {
        var n = LIEUX.filter(function (p) {
          return p.lat != null && p.ville === c.cle;
        }).length;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "puce";
        b.setAttribute("aria-pressed", c === ciel.cadre ? "true" : "false");
        // Le kanji identifie, le nombre informe : le nom latin est de trop —
        // il figure déjà dans les filtres, la liste et l'en-tête. Il reste lu
        // à voix haute par le libellé accessible.
        b.innerHTML = '<span class="k" aria-hidden="true">' + c.nom + "</span>" +
                      '<span class="n">' + n + "</span>";
        b.setAttribute("aria-label", c.cle + " — " + n + " adresses situées");
        b.addEventListener("click", function () {
          ciel.cadrerSur(c);
          ciel.entree = 0;          // les points de la nouvelle ville se posent
          ciel.boucler();
          poser();
        });
        hote.appendChild(b);
      });
    }
    poser();
    brancherGrandCiel(poser);

    /* L'invitation à toucher ne paraît qu'une fois la constellation posée, et
       s'efface au premier geste — une aide qui reste avoue que le geste n'est
       pas devinable. Elle ne revient pas dans la session. */
    var aide = $("cielAide");
    var dejaVu = false;
    try { dejaVu = sessionStorage.getItem("cielAide") === "1"; } catch (e) {}
    if (aide && !dejaVu) {
      setTimeout(function () { aide.setAttribute("data-visible", ""); }, 1700);
      var effacer = function () {
        aide.removeAttribute("data-visible");
        try { sessionStorage.setItem("cielAide", "1"); } catch (e) {}
        toile.removeEventListener("pointerdown", effacer);
        toile.removeEventListener("keydown", effacer);
      };
      toile.addEventListener("pointerdown", effacer);
      toile.addEventListener("keydown", effacer);
      setTimeout(effacer, 9000);
    }
  }

  /* ---------- la constellation en grand ------------------------------------
     Une seconde instance plutôt qu'un déplacement du canvas : le cadrage se
     calcule sur la place disponible, et les deux tailles n'ont rien à voir.
     Créée à la première ouverture seulement — beaucoup de visites n'y viendront
     jamais, et 263 points valent d'être calculés à la demande. */
  var grandCiel = null;

  function brancherGrandCiel(reposerPucesAccueil) {
    var ouvrir = $("cielGrand");
    var panneau = $("grandCiel");
    if (!ouvrir || !panneau) return;
    var retour = null;

    function poserPuces() {
      var hote = $("gcVilles");
      hote.innerHTML = "";
      window.Constellation.CADRES.forEach(function (c) {
        var n = LIEUX.filter(function (p) {
          return p.lat != null && p.ville === c.cle;
        }).length;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "puce";
        b.setAttribute("aria-pressed", c === grandCiel.cadre ? "true" : "false");
        b.setAttribute("aria-label", c.cle + " — " + n + " adresses situées");
        b.innerHTML = '<span class="k" aria-hidden="true">' + c.nom + "</span>" +
                      '<span class="n">' + n + "</span>";
        b.addEventListener("click", function () {
          grandCiel.cadrerSur(c);
          grandCiel.entree = 0;
          grandCiel.boucler();
          poserPuces();
        });
        hote.appendChild(b);
      });
    }

    function fermer() {
      if (panneau.hidden) return;
      panneau.hidden = true;
      if (retour && document.contains(retour)) retour.focus();
      retour = null;
      /* Les deux vues restent d'accord : la ville choisie en grand devient
         celle de la vignette. Sans cela on revient à l'accueil et le carnet
         paraît avoir oublié ce qu'on venait de regarder. */
      if (grandCiel && ciel && grandCiel.cadre !== ciel.cadre) {
        ciel.cadrerSur(grandCiel.cadre);
        ciel.entree = 1;
        ciel.dessiner();
        if (reposerPucesAccueil) reposerPucesAccueil();
      }
    }

    ouvrir.addEventListener("click", function () {
      retour = document.activeElement;
      panneau.hidden = false;
      if (!grandCiel) {
        grandCiel = new window.Constellation($("gcToile"), LIEUX, {
          estGarde: estEnvie,
          avecQuartiers: true,
          // La toile plein écran est deux fois plus haute que large ; la ville
          // est large et basse. On remplit donc la largeur franchement.
          remplissage: 0.92,
          remplissageH: 0.74,
          // On resserre sur la masse : voir la note dans `redimensionner`.
          rejet: 0.07,
          surChoix: function (p) { fermer(); ouvrirLieu(p); }
        });
        if (ciel) grandCiel.cadrerSur(ciel.cadre);
        grandCiel.demarrer();
        window.grandeConstellation = grandCiel;
      } else {
        // Le canvas était masqué : il n'avait aucune taille à mesurer.
        grandCiel.redimensionner();
        grandCiel.entree = 0;
        grandCiel.boucler();
      }
      poserPuces();
      $("gcFermer").focus();
    });

    $("gcFermer").addEventListener("click", fermer);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { fermer(); }
    });
  }

  /* Le programme, sous les envies. Le compte affiché en tête du bloc est le
     nombre d'adresses posées sur un jour, pas le nombre de jours : c'est lui
     qui dit si le voyage est préparé. */
  function rendreProgramme() {
    if (!window.Jours) return;
    var hote = $("programmeCorps");
    if (!hote) return;
    window.Jours.rendreBloc(hote, {});
    var n = window.Jours.total();
    $("nProgramme").textContent = n ? n : "";
  }

  /* Le partage. Trois boutons et une zone de collage — voir js/partage.js pour
     ce que la relecture accepte. */
  function brancherPartage() {
    var bCopier = $("partCopier"), bColler = $("partColler"),
        zone = $("partZone"), bLire = $("partLire"),
        bAnnuler = $("partAnnuler"), avis = $("partAvis"), champ = $("partTexte");
    if (!bCopier || !window.Partage) return;

    bCopier.addEventListener("click", function () {
      var texte = window.Partage.exporter({
        envies: lieuxEnvies(),
        jours: window.Jours ? window.Jours.tout() : {}
      });
      window.Utile.copier(texte, bCopier);
      /* Le texte est aussi posé dans la zone : sur un iPhone où le presse-
         papier est refusé (page en http), c'est le seul moyen de le récupérer
         — on le sélectionne à la main. */
      zone.hidden = false;
      champ.value = texte;
      champ.select();
      avis.textContent = "Copiez ce texte et collez-le dans la conversation du groupe.";
    });

    bColler.addEventListener("click", function () {
      zone.hidden = false;
      champ.value = "";
      avis.textContent = "";
      champ.focus();
    });

    bAnnuler.addEventListener("click", function () {
      zone.hidden = true;
      champ.value = "";
      avis.textContent = "";
    });

    bLire.addEventListener("click", function () {
      var r = window.Partage.importer(champ.value, { lieux: LIEUX });
      if (!r.valide) { avis.textContent = window.Partage.resume(r); return; }

      /* Fusion, jamais remplacement : on reçoit les envies d'un autre, on ne
         perd pas les siennes. C'est aussi ce qui rend l'opération sans risque
         — rien de ce qu'on avait ne peut disparaître. */
      var ajoutees = 0;
      r.envies.forEach(function (q) {
        if (!estEnvie(q)) { envies[cleEnvie(q)] = 1; ajoutees += 1; }
      });
      if (ajoutees) ecrireEnvies();

      var joursAjoutes = 0;
      if (window.Jours) {
        var actuels = window.Jours.tout();
        Object.keys(r.jours).forEach(function (c) {
          var recu = r.jours[c];
          if (!actuels[c]) actuels[c] = { lieux: [], note: "" };
          (recu.lieux || []).forEach(function (k) {
            if (actuels[c].lieux.indexOf(k) < 0) {
              actuels[c].lieux.push(k); joursAjoutes += 1;
            }
          });
          /* La note reçue ne remplace pas la sienne : elle s'ajoute dessous,
             avec son auteur. Deux personnes peuvent avoir écrit sur le même
             jour, et la plus rapide n'a pas raison. */
          if (recu.note) {
            var marque = (r.de ? r.de + " : " : "reçu : ") + recu.note;
            if ((actuels[c].note || "").indexOf(recu.note) < 0) {
              actuels[c].note = (actuels[c].note ? actuels[c].note + "\n" : "") + marque;
            }
          }
        });
        window.Jours.remplacer(actuels);
      }

      avis.textContent = window.Partage.resume(r) + " — " + ajoutees +
        " envie" + (ajoutees > 1 ? "s" : "") + " et " + joursAjoutes +
        " adresse" + (joursAjoutes > 1 ? "s" : "") + " de programme ajoutées.";
      champ.value = "";
      rendreAccueil();
      rafraichirListe();
    });
  }

  function rendreAccueil() {
    rendreDepart();
    rendreEnvies();
    rendreProgramme();
    if (ciel) ciel.rafraichir();
    if (grandCiel) grandCiel.rafraichir();
  }

  /* ---------- avant de partir ----------------------------------------------- */

  function rendreConseils() {
    // La liste de départ, en tête du même panneau. Elle vit dans utile.js avec
    // le reste des fiches pratiques ; seul son emplacement est ici.
    if (window.Utile && window.Utile.rendreAvant) {
      window.Utile.rendreAvant($("avantDePartir"));
    }
    var hote = $("conseils");
    hote.innerHTML = "";
    CONSEILS.forEach(function (c) {
      var d = document.createElement("article");
      d.className = "conseil";
      d.innerHTML =
        "<button type=\"button\">" +
          (c.cat ? '<span class="cat">' + echapper(c.cat) + "</span>" : "") +
          "<h3>" + echapper(c.titre) + "</h3>" +
        "</button>" +
        '<div class="corps">' +
          (c.note ? '<p class="chapo">' + echapper(c.note) + "</p>" : "") +
          (c.points && c.points.length
            ? "<dl>" + c.points.map(function (p) {
                return "<dt>" + echapper(p[0]) + "</dt><dd>" + echapper(p[1]) + "</dd>";
              }).join("") + "</dl>"
            : "") +
        "</div>";
      d.querySelector("button").addEventListener("click", function () {
        if (d.hasAttribute("data-ouvert")) d.removeAttribute("data-ouvert");
        else d.setAttribute("data-ouvert", "");
      });
      hote.appendChild(d);
    });
  }

  /* ---------- à trancher ----------------------------------------------------- */

  function rendreTrancher() {
    var hote = $("trancher");
    hote.innerHTML = "";
    ATRANCHER.forEach(function (t, i) {
      var d = document.createElement("div");
      d.className = "vignette";
      /* Pas d'attributs `width`/`height` ici, et c'est délibéré : les captures
         font 440×297, 440×223, 620×419 — aucune dimension commune. C'est le
         CSS qui réserve la place, avec `aspect-ratio: 9/14` sur `.vignette
         img`, donc la grille ne saute pas à l'arrivée des images. Écrire des
         dimensions fixes ne ferait qu'y inscrire une proportion fausse.
         `decoding="async"` évite que le décodage bloque le défilement. */
      /* Deux adresses filtrées plutôt qu'échappées : la vignette est un chemin
         du carnet (`img/…`) et ne doit pas pouvoir devenir une adresse
         extérieure, le lien de vidéo ne doit pouvoir être que du https. */
      var vignette = urlSure(t.vignette);
      d.innerHTML =
        (vignette ? '<img loading="lazy" decoding="async" alt="" src="' +
                    echapper(vignette) + '">'
                  : '<div class="sansimage">pas de vignette</div>') +
        '<div class="txt">' +
          '<div class="num">' + (i + 1) + " · " + echapper(t.ville || "") + "</div>" +
          '<div class="sujet">' + echapper(t.sujet || "") + "</div>" +
          (t.question ? '<div class="q">' + echapper(t.question) + "</div>" : "") +
          (t.src ? lienExterne(t.src, "Vidéo ↗") : "") +
        "</div>";
      hote.appendChild(d);
    });

    // La galerie des vidéos non identifiées vient à la suite : même nature de
    // question, même geste de réponse.
    GALERIE.forEach(function (g, i) {
      var d = document.createElement("div");
      d.className = "vignette";
      /* L'identifiant et le compte viennent du relevé TikTok. On les recolle
         dans une adresse — donc on vérifie qu'ils ne contiennent que ce qu'un
         identifiant TikTok contient. Sans ce contrôle, un compte nommé
         `x/../../autre-chose` réécrit la destination du lien. */
      var id = /^[0-9]{6,32}$/.test(String(g.v || "")) ? String(g.v) : "";
      var compte = /^[A-Za-z0-9._]{1,30}$/.test(String(g.compte || "")) ? String(g.compte) : "";
      var img = id ? urlSure("img/" + id + ".jpg") : "";
      var versVideo = (id && compte)
        ? "https://www.tiktok.com/@" + compte + "/video/" + id : "";
      d.innerHTML =
        (img ? '<img loading="lazy" decoding="async" alt="" src="' +
               echapper(img) + '">' : "") +
        '<div class="txt">' +
          '<div class="num">' + (ATRANCHER.length + i + 1) + " · " +
            echapper(g.ville || "?") + "</div>" +
          '<div class="sujet">' + echapper(g.quoi || "") + "</div>" +
          /* `pourquoi` dit ce qui a déjà été cherché et pourquoi ça n'a rien
             donné. Sans lui, la vignette redemande « quel lieu ? » à
             l'infini et le travail se refait à chaque session. */
          (g.pourquoi ? '<div class="raison">' + echapper(g.pourquoi) + "</div>"
                      : '<div class="q">Quel lieu ?</div>') +
          (versVideo ? lienExterne(versVideo, "Vidéo ↗") : "") +
        "</div>";
      hote.appendChild(d);
    });
  }

  /* ---------- hors connexion ------------------------------------------------- */

  /* Les archives PMTiles sont téléchargées **entières**, par un GET ordinaire,
   * puis conservées dans IndexedDB. On ne lit jamais par requêtes de plage : la
   * spec le permet, mais GitHub Pages ne les honore pas de façon fiable (fils
   * Protomaps #582 et #584). Télécharger l'archive complète contourne le
   * problème et, pour un usage hors connexion, c'est de toute façon ce qu'on
   * veut : une requête par ville au lieu de 3 497. */

  var ARCHIVES = [
    { nom: "kanto",  fichier: "tuiles/kanto.pmtiles",  libelle: "Tokyo et environs" },
    { nom: "kansai", fichier: "tuiles/kansai.pmtiles", libelle: "Osaka, Kyoto, Nara" }
  ];
  var BASE = "carnet-japon", MAGASIN = "archives";
  var archives = {};          // nom -> objet PMTiles ouvert

  function ouvrirBase() {
    return new Promise(function (ok, non) {
      var r = indexedDB.open(BASE, 1);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains(MAGASIN)) {
          r.result.createObjectStore(MAGASIN);
        }
      };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { non(r.error); };
    });
  }

  function lireBase(cle) {
    return ouvrirBase().then(function (db) {
      return new Promise(function (ok, non) {
        var t = db.transaction(MAGASIN, "readonly").objectStore(MAGASIN).get(cle);
        t.onsuccess = function () { ok(t.result || null); };
        t.onerror = function () { non(t.error); };
      });
    });
  }

  function ecrireBase(cle, valeur) {
    return ouvrirBase().then(function (db) {
      return new Promise(function (ok, non) {
        var t = db.transaction(MAGASIN, "readwrite").objectStore(MAGASIN).put(valeur, cle);
        t.onsuccess = function () { ok(); };
        t.onerror = function () { non(t.error); };
      });
    });
  }

  function effacerBase(cle) {
    return ouvrirBase().then(function (db) {
      return new Promise(function (ok, non) {
        var t = db.transaction(MAGASIN, "readwrite").objectStore(MAGASIN).delete(cle);
        t.onsuccess = function () { ok(); };
        t.onerror = function () { non(t.error); };
      });
    });
  }

  /* La source que le moteur interroge. On essaie chaque archive chargée, en
   * demandant l'agrandissement : si la tuile exacte n'existe pas — au-delà du
   * niveau 15, ou en bordure de zone — le lecteur remonte d'un ou plusieurs
   * niveaux et renvoie le fragment qui convient.
   *
   * ⚠️ **Aucun repli vers le réseau, et c'est délibéré.** La première version
   * allait chercher chez OpenStreetMap les tuiles absentes de l'archive. Deux
   * raisons de l'avoir retiré le 02/09 :
   *
   * 1. **OpenStreetMap nous bloque.** Leurs serveurs répondent
   *    `x-blocked: Access denied` — leur politique interdit qu'une application
   *    tierce tape directement sur leurs tuiles, et le volume de nos
   *    téléchargements a déclenché le blocage. C'est ce qui faisait disparaître
   *    la carte dès qu'on zoomait au-delà du niveau 15 : l'archive n'avait
   *    rien, le réseau refusait, il ne restait que les épingles sur du vide.
   * 2. **Un carnet hors connexion ne doit dépendre de personne.** Une carte qui
   *    marche au bureau et s'efface dans une rue de Shimokitazawa ne sert à rien.
   */
  function sourceEmbarquee(z, x, y) {
    var noms = Object.keys(archives);
    if (!noms.length) return Promise.resolve(null);
    var i = 0;
    function suivant() {
      if (i >= noms.length) return Promise.resolve(null);
      return archives[noms[i++]].tuileOuParente(z, x, y).then(function (r) {
        return r || suivant();
      });
    }
    return suivant();
  }

  function activerEmbarque() {
    if (!carte) return;
    carte.sourceTuile = sourceEmbarquee;
    // On aligne les bornes de zoom sur ce que l'archive couvre réellement :
    // en dessous de son niveau le plus grossier il n'y a rien, et
    // l'agrandissement ne sait pas descendre.
    var noms = Object.keys(archives);
    if (noms.length) {
      carte.zoomMin = Math.min.apply(null, noms.map(function (n) {
        return archives[n].entete.zoomMin;
      }));
      // Au-delà du niveau le plus fin de l'archive, le moteur agrandit d'un
      // bloc plutôt que de réclamer des tuiles qui n'existent pas.
      carte.zoomTuilesMax = Math.max.apply(null, noms.map(function (n) {
        return archives[n].entete.zoomMax;
      }));
      // Deux niveaux au-dessus du plus fin disponible, pas davantage : à
      // quatre fois la taille d'origine les rues restent lisibles, à huit fois
      // ce n'est plus qu'une bouillie qui n'apprend rien de plus.
      carte.zoomMax = carte.zoomTuilesMax + 2;
      if (carte.z > carte.zoomMax) carte.reglerZoom(carte.zoomMax);
      // Passer par reglerZoom : écrire `carte.z` directement laisserait le
      // centre exprimé en pixels de l'ancien zoom, et la carte se retrouverait
      // à des milliers de kilomètres — c'est ce qui vidait l'écran.
      if (carte.z < carte.zoomMin) carte.reglerZoom(carte.zoomMin);
    }
    carte._tuiles = {};
    carte.cTuiles.innerHTML = "";
    carte.rendre();
    var m = $("messageCarte");
    if (m) m.removeAttribute("data-actif");
  }

  /* L'exact inverse d'`activerEmbarque`, et il doit être complet : laisser
     `zoomTuilesMax` posé bornerait la carte à ce que l'archive couvrait, alors
     même qu'on est revenu au fond du réseau. */
  function activerReseau() {
    if (!carte) return;
    carte.sourceTuile = null;
    carte.zoomMin = 3;
    carte.zoomMax = 19;
    carte.zoomTuilesMax = null;
    carte._tuiles = {};
    carte.cTuiles.innerHTML = "";
    carte.rendre();
  }

  /* ⚠️ La bascule de secours ne déplace JAMAIS la vue — 18/09/2026.
   *
   * `activerEmbarque` cale les bornes sur ce que l'archive couvre — 11 à 15,
   * agrandi jusqu'à 17 — et ramène le zoom courant dans cet intervalle. C'est
   * juste quand l'archive est le seul fond possible dès le départ. En secours,
   * c'est brutal, et Paco l'a vu le jour même : on regarde le Japon entier au
   * niveau 7, le téléphone perd une seconde de réseau, et **la carte saute
   * toute seule au niveau 11**. Les butées apparaissent, puis disparaissent au
   * retour du signal, sans que rien ne l'explique à l'écran. « La map réagit
   * bizarrement au zoom » : c'était ça.
   *
   * Ici on change la source, un point c'est tout. Les bornes restent 3–19, et
   * le lecteur d'archive gère proprement les deux débordements : sous le niveau
   * 11 il renvoie `null` — la carte est vide à cet endroit, exactement comme
   * avant qu'on installe les 108 Mo —, au-dessus de 15 il agrandit la tuile
   * parente. **Un trou à un niveau de zoom vaut mieux qu'une vue qui bouge
   * toute seule.** */
  function passerEnSecours() {
    if (!carte) return;
    carte.sourceTuile = sourceEmbarquee;
    carte._tuiles = {};
    carte.cTuiles.innerHTML = "";
    carte.rendre();
  }

  /* ---------- la reprise, et le trou qu'elle bouche -------------------------
   *
   * ⚠️ Jusqu'au 18/09/2026, les 108 Mo installés ne servaient **que dans la
   * session où on les avait téléchargés**. `initFondDeCarte()` est commentée
   * depuis le 02/09 — Paco voulait d'abord une carte complète et fluide, et il
   * a raison — mais rien n'avait pris le relais : à l'ouverture suivante,
   * `archives` repartait vide, la carte redemandait tout au réseau, et les
   * archives dormaient en base sans que rien ne les rouvre. Le carnet promettait
   * un mode hors connexion qui ne passait pas la nuit.
   *
   * Ceci n'ouvre que ce qui est **déjà en base** : lire l'en-tête et le
   * répertoire racine d'une archive coûte quelques kilooctets, jamais les 108 Mo,
   * et rien n'est téléchargé. */
  function reprendreArchives() {
    return Promise.all(ARCHIVES.map(function (a) {
      if (archives[a.nom]) return true;
      return lireBase(a.nom).then(function (donnee) {
        if (!donnee) return false;
        var blob = donnee instanceof Blob ? donnee : new Blob([donnee]);
        return window.PMTiles.depuisBlob(blob).then(function (arch) {
          archives[a.nom] = arch;
          return true;
        });
      }).catch(function () { return false; });
    })).then(function (etats) {
      return etats.some(Boolean);
    });
  }

  /* Vrai tant qu'on affiche la copie locale faute de mieux. Sert à savoir s'il
     y a lieu de rendre la main au réseau : une archive activée volontairement
     ne doit pas être défaite par un simple retour de signal. */
  var surSecours = false;

  function basculerHorsConnexion() {
    if (surSecours) return Promise.resolve(true);
    return reprendreArchives().then(function (dispo) {
      if (!dispo) return false;
      surSecours = true;
      passerEnSecours();
      return true;
    });
  }

  /* `navigator.onLine` ment dans un seul sens : il peut annoncer « en ligne »
     derrière un portail captif d'hôtel qui ne laisse rien passer. On ne le croit
     donc pas sur parole — on demande une vraie tuile avant de rendre la main au
     serveur japonais. Une `Image` et non un `fetch` : la politique de sécurité
     autorise `tile.openstreetmap.jp` en `img-src`, jamais en `connect-src`.
     C'est la gare de Tokyo au niveau 12. */
  function reseauRepond() {
    return new Promise(function (ok) {
      var img = new Image(), tranche = false;
      function repondre(v) { if (!tranche) { tranche = true; ok(v); } }
      img.onload = function () { repondre(true); };
      img.onerror = function () { repondre(false); };
      setTimeout(function () { repondre(false); }, 5000);
      img.src = "https://tile.openstreetmap.jp/12/3638/1612.png?essai=" + Date.now();
    });
  }

  function revenirAuReseau() {
    if (!surSecours) return;
    reseauRepond().then(function (vraiment) {
      if (!vraiment || !surSecours) return;
      surSecours = false;
      activerReseau();
    });
  }

  function chargerArchive(a, surProgres) {
    return lireBase(a.nom).then(function (tampon) {
      if (tampon) return tampon;
      return fetch(a.fichier).then(function (r) {
        if (!r.ok) throw new Error("téléchargement impossible (" + r.status + ")");
        var total = parseInt(r.headers.get("content-length") || "0", 10);
        if (!r.body || !total) return r.blob();
        // Lecture par morceaux, pour montrer une progression honnête : sans
        // elle, on regarde un bouton figé pendant cinquante mégaoctets. Les
        // morceaux sont assemblés en Blob et non en ArrayBuffer — voir plus bas.
        var lecteur = r.body.getReader(), recus = 0, morceaux = [];
        return (function pomper() {
          return lecteur.read().then(function (res) {
            if (res.done) return new Blob(morceaux);
            morceaux.push(res.value);
            recus += res.value.length;
            surProgres(recus / total);
            return pomper();
          });
        })();
      }).then(function (blob) {
        return ecrireBase(a.nom, blob).then(function () { return blob; });
      });
    }).then(function (donnee) {
      // On range et on lit des **Blob**, jamais des ArrayBuffer. Un Blob reste
      // sur le disque du téléphone et ne se lit que par tranches ; deux
      // ArrayBuffer de 51 et 56 Mo occupent 108 Mo de mémoire vive, ce que
      // Safari sur iPhone ne tolère pas — il tue l'onglet, et la page devient
      // blanche sans message. Une base écrite par une version antérieure peut
      // encore contenir un ArrayBuffer : on le convertit au passage.
      if (donnee instanceof Blob) {
        return window.PMTiles.depuisBlob(donnee).then(function (arch) {
          archives[a.nom] = arch;
          return donnee.size;
        });
      }
      // Base écrite par une version antérieure : on convertit **et on
      // réécrit**, sinon chaque ouverture repasserait par la mémoire vive et
      // ferait replanter l'onglet sur téléphone.
      var blob = new Blob([donnee]);
      return ecrireBase(a.nom, blob).then(function () {
        return window.PMTiles.depuisBlob(blob);
      }).then(function (arch) {
        archives[a.nom] = arch;
        return blob.size;
      });
    });
  }

  /* Le pied de page, et pourquoi il ne disait rien.
   *
   * Il est posé `transform: translateY(101%)` et ne remonte qu'avec l'attribut
   * `data-actif`. Or personne ne le posait : `initFondDeCarte()` est
   * volontairement désactivée depuis le 02/09, et c'était la seule fonction à
   * le faire. Résultat, le bloc du service worker écrivait consciencieusement
   * « Hors connexion indisponible » dans une barre restée sous l'écran —
   * c'est-à-dire nulle part. Un carnet dont la raison d'être est de tenir sans
   * réseau ne peut pas taire *ça*.
   *
   * `montrerPied` affiche pour de bon. `effacerPied` escamote. Les deux
   * passent par le même endroit, de sorte qu'aucun message ne puisse plus être
   * écrit sans être vu. */
  function montrerPied(texte, options) {
    var o = options || {};
    $("piedTexte").textContent = texte;

    var jauge = $("piedJaugeBoite");
    if (o.fraction === undefined || o.fraction === null) {
      jauge.hidden = true;
    } else {
      jauge.hidden = false;
      $("piedJauge").style.width = Math.round(o.fraction * 100) + "%";
    }

    var bouton = $("piedAction");
    bouton.onclick = null;
    if (o.bouton && o.surClic) {
      bouton.hidden = false;
      bouton.textContent = o.bouton;
      bouton.onclick = o.surClic;
    } else {
      // Un bouton sans gestionnaire est pire qu'un bouton absent : on tape, il
      // ne se passe rien, et l'on croit le carnet cassé. C'était le cas de
      // « Télécharger », resté dans la page après la mise en sommeil du fond
      // de carte hors connexion.
      bouton.hidden = true;
      bouton.textContent = "";
    }

    $("piedFermer").hidden = !o.refermable;
    $("pied").setAttribute("data-actif", "");

    /* Une seule minuterie à la fois. Chaque message posait la sienne sans
       défaire la précédente : celui du chargement (6 s) effaçait l'annonce
       « Une nouvelle version est prête » arrivée entre-temps — le seul message
       qui doive rester jusqu'à ce qu'on le lise. */
    clearTimeout(minuteurPied);
    if (o.secondes) {
      minuteurPied = setTimeout(function () { effacerPied(); }, o.secondes * 1000);
    }
  }
  var minuteurPied = null;

  function effacerPied() {
    clearTimeout(minuteurPied);
    $("pied").removeAttribute("data-actif");
  }

  $("piedFermer").addEventListener("click", effacerPied);

  /* Conservée pour `initFondDeCarte`, qui suit une progression continue. */
  function majPied(texte, fraction, bouton, surClic) {
    montrerPied(texte, { fraction: fraction, bouton: bouton, surClic: surClic });
  }

  /* Le fond de carte est chargé **automatiquement**, sans rien demander.
   *
   * La première version le proposait par un bouton, au nom du hors-connexion.
   * Paco a tranché le 02/09 : il veut d'abord une carte qui fonctionne. Or
   * sans archive il n'y a aucun fond — OpenStreetMap refuse les requêtes
   * directes — donc la télécharger n'est pas une option offerte, c'est ce que
   * fait la carte pour exister. Elle reste ensuite en base : la fois suivante
   * l'ouverture est instantanée, et le hors-connexion vient par-dessus le
   * marché.
   */
  function initFondDeCarte() {
    var fait = 0;
    /* Retenu ici plutôt que relu sur le DOM à la fin : depuis que `montrerPied`
       affiche vraiment le pied, tester `data-actif` en sortie répondrait
       toujours oui, et l'on annoncerait « Carte installée » même quand tout
       était déjà en base et que rien n'a été téléchargé. */
    var aTelecharge = false;

    function progresser(f) {
      montrerPied("Chargement du fond de carte",
                  { fraction: (fait + f) / ARCHIVES.length });
    }

    Promise.all(ARCHIVES.map(function (a) { return lireBase(a.nom); }))
      .then(function (dejaLa) {
        var toutEnBase = dejaLa.every(Boolean);
        if (!toutEnBase) {
          aTelecharge = true;
          montrerPied("Chargement du fond de carte — 108 Mo, une seule fois",
                      { fraction: 0 });
          var m = $("messageCarte");
          if (m) m.setAttribute("data-actif", "");
        }
        return ARCHIVES.reduce(function (chaine, a) {
          return chaine.then(function () {
            return chargerArchive(a, progresser).then(function () { fait += 1; });
          });
        }, Promise.resolve());
      })
      .then(function () {
        activerEmbarque();
        var m = $("messageCarte");
        if (m) m.removeAttribute("data-actif");
        if (aTelecharge) {
          montrerPied("Carte installée — elle fonctionne désormais sans réseau",
                      { fraction: 1, secondes: 4 });
        } else {
          effacerPied();
        }
      })
      .catch(function (e) {
        /* Ce bouton ne réessayait rien : une substitution automatique du
           14/09 avait remplacé son unique instruction par le commentaire qui
           désactive le chargement d'office — l'indentation cassée le
           trahissait. Un bouton « Réessayer » qui ne réessaie pas est le seul
           défaut d'interface qui fasse douter du reste de la page. */
        montrerPied("Fond de carte indisponible : " + e.message, {
          fraction: 0,
          bouton: "Réessayer",
          surClic: function () { initFondDeCarte(); }
        });
      });
  }

  /* ---------- rafraîchissement global ---------------------------------------- */

  function rafraichir() {
    rafraichirFiltres();
    filtresCarte();
    rafraichirListe();
    rafraichirCarte();
  }

  /* ---------- démarrage -------------------------------------------------------- */

  $("recherche").addEventListener("input", function () {
    etat.texte = normaliser(this.value.trim());
    $("rechercheBoite").classList.toggle("plein", !!this.value);
    rafraichirListe();
    rafraichirCarte();
  });
  $("viderRecherche").addEventListener("click", function () {
    $("recherche").value = ""; etat.texte = "";
    $("rechercheBoite").classList.remove("plein");
    rafraichirListe(); rafraichirCarte();
  });

  $("nListe").textContent = LIEUX.length;
  $("nConseils").textContent = CONSEILS.length;
  $("nTrancher").textContent = ATRANCHER.length + GALERIE.length;

  var situees = LIEUX.filter(function (p) { return p.lat != null; }).length;
  /* `ouvrirFrontispice` n'est plus appelée — le frontispice a été retiré le
     14/09 au profit de l'écran d'accueil, qui dit la même chose sans bloquer.
     La fonction est conservée : elle sort proprement si l'élément est absent,
     et la page de garde peut revenir d'une ligne si Paco la regrette. */

  /* L'écart entre les deux nombres est l'information : ce qui n'est pas situé
     ne se trouvera pas sur la carte. Le `title` le dit en clair pour qui
     survole — sur un téléphone rien ne survole, d'où un libellé déjà complet
     à l'écran. */
  $("sousTitre").textContent =
    LIEUX.length + " adresses · " + situees + " situées";
  $("sousTitre").title =
    LIEUX.length + " adresses au carnet, dont " + situees +
    " placées sur la carte — " + (LIEUX.length - situees) +
    " sont sans position exacte.";

  var bfv = $("filtreActifVider");
  if (bfv) bfv.addEventListener("click", toutReafficher);

  /* La version, écrite en clair à côté du diagnostic. Sans elle, il n'y a aucun
     moyen de savoir ce qu'on regarde : c'est ce qui a fait perdre une demi-heure
     le 18/09, à chercher côté serveur un carnet qui était périmé côté téléphone. */
  var bv = $("versionCarnet");
  if (bv) bv.textContent = window.CARNET_VERSION || "";

  var bd = $("diag");
  if (bd) bd.addEventListener("click", function () { window.__diagnostic(); });

  var bt = $("versTrancher");
  if (bt) bt.addEventListener("click", function () { allerAOnglet("ongletTrancher"); });
  var br = $("trancherRetour");
  if (br) br.addEventListener("click", function () { allerAOnglet("ongletAccueil"); });
  $("nTrancherLien").textContent =
    ATRANCHER.length + GALERIE.length;

  var barreOnglets = document.querySelector("nav.onglets");
  if (barreOnglets) { suivreDebord(barreOnglets); }

  /* ---------- ce que le carnet expose aux autres fichiers -------------------
   *
   * `app.js` est fermé sur lui-même (une fonction anonyme exécutée), et c'est
   * bien : rien de son état interne ne traîne dans la page. Mais l'onglet
   * « Utile » et le programme ont besoin de trois gestes — montrer un texte en
   * grand, ouvrir une adresse, dire quelque chose dans le pied de page. On les
   * expose explicitement, et rien d'autre : c'est une porte, pas un mur
   * abattu. */
  window.Carnet = {
    montrer: montrerTexte,
    ouvrirLieu: ouvrirLieu,
    dire: function (texte) {
      montrerPied(texte, { secondes: 5, refermable: true });
    },

    /* --- la carte sans réseau ---------------------------------------------
     *
     * Les 108 Mo d'archives ne sont plus chargés d'office depuis le 02/09 —
     * ils coûtent cher et ne couvrent que les zooms 11 à 15. Mais un carnet
     * dont la carte s'efface dans une ruelle de Shimokitazawa ne remplit pas
     * sa fonction : la seule chose qui manquait était **de pouvoir le décider
     * soi-même**, avant de partir, en Wi-Fi.
     *
     * D'où ces trois gestes, offerts à l'onglet « Utile » : savoir où l'on en
     * est, installer, désinstaller. Rien ne se déclenche tout seul.
     */
    etatCarte: function () {
      return Promise.all(ARCHIVES.map(function (a) { return lireBase(a.nom); }))
        .then(function (blobs) {
          var taille = 0, presentes = 0;
          blobs.forEach(function (b) {
            if (b) { presentes += 1; taille += (b.size || b.byteLength || 0); }
          });
          return {
            installees: presentes, total: ARCHIVES.length,
            octets: taille, active: Object.keys(archives).length > 0
          };
        })
        .catch(function () {
          return { installees: 0, total: ARCHIVES.length, octets: 0, active: false, erreur: true };
        });
    },

    installerCarte: function (surProgres) {
      var fait = 0;
      function progresser(f) {
        if (surProgres) surProgres((fait + f) / ARCHIVES.length);
      }
      return ARCHIVES.reduce(function (chaine, a) {
        return chaine.then(function () {
          return chargerArchive(a, progresser).then(function () {
            fait += 1;
            if (surProgres) surProgres(fait / ARCHIVES.length);
          });
        });
      }, Promise.resolve()).then(function () {
        /* On n'impose pas la copie locale à quelqu'un qui a du réseau : elle
           ne couvre que les niveaux 11 à 15 et lui donnerait une carte plus
           pauvre que celle qu'il regardait. Elle prendra le relais à la
           première coupure — c'est très exactement ce qu'on lui a promis. */
        if (surSecours || navigator.onLine === false) {
          surSecours = true;
          passerEnSecours();
        }
        return true;
      });
    },

    supprimerCarte: function () {
      return Promise.all(ARCHIVES.map(function (a) { return effacerBase(a.nom); }))
        .then(function () {
          // Le moteur revient au fond en ligne : sans cela, il continuerait
          // d'interroger des archives qu'on vient d'effacer et n'afficherait
          // plus rien du tout.
          archives = {};
          surSecours = false;
          activerReseau();
          return true;
        });
    }
  };

  lireEnvies();

  /* Le programme connaît les dates du voyage et la liste des adresses ; il
     redessine l'accueil quand quelque chose bouge — poser une adresse depuis
     la carte doit se voir sur l'accueil sans rechargement. */
  if (window.Jours) {
    window.Jours.demarrer({
      debut: ARRIVEE, fin: RETOUR, lieux: LIEUX,
      surChangement: function () {
        rendreProgramme();
        // Le bouton de la fiche ouverte porte le compte : il doit suivre.
        rafraichirListe();
        /* Le tiroir de la carte aussi : il gardait « Poser un jour » sur une
           adresse qu'on venait de poser (29/09/2026). */
        var bj = lieuTiroir && $("tiroir").hasAttribute("data-ouvert") &&
                 $("tiroirCorps").querySelector("[data-jour]");
        if (bj) {
          bj.textContent = etiquetteJour(lieuTiroir);
          bj.classList.toggle("pose", window.Jours.joursDe(lieuTiroir).length > 0);
        }
      }
    });
  }

  rendreAccueil();
  brancherPartage();
  if (window.Utile) window.Utile.demarrer($("utile"));
  if (window.Liens) window.Liens.demarrer();
  rendrePortes();
  rendreHasard();
  demarrerConstellation();
  $("hasardTotal").textContent = LIEUX.length;
  $("hasardTirer").addEventListener("click", rendreHasard);

  rendreConseils();
  rendreTrancher();
  rafraichir();
  demarrerCarte();
  // Le fond de carte hors connexion reste disponible, mais n'est plus chargé
  // d'office : il coûte 108 Mo et ne couvre que la moitié de la surface aux
  // niveaux fins. Voir README — à reprendre avec une couverture complète.
  // initFondDeCarte();

  /* ---------- emporter la carte, depuis la carte ----------------------------
   *
   * Le téléchargement des 108 Mo existait depuis le 17/09 — mais dans l'onglet
   * « Utile », en sixième position, sous les phrases japonaises et les numéros
   * d'urgence. Paco ne l'avait jamais vu et a demandé le 18/09 « un bouton ou
   * une icône qui nous propose de télécharger la carte hors connexion ». Une
   * fonction qu'on ne trouve pas n'existe pas : elle se propose désormais là où
   * la question vient, sur la carte.
   *
   * Ce bloc ne refait rien — il appelle `Carnet.etatCarte` et
   * `Carnet.installerCarte`, exactement comme l'onglet « Utile », qui garde la
   * vue complète : place occupée et désinstallation.
   *
   * **Ce qu'il ne fait pas, et c'est délibéré : rien ne se télécharge tout
   * seul.** 108 Mo, sur un forfait en itinérance, ne se prennent pas par
   * surprise. Le bouton propose, la feuille dit le prix, Paco décide.
   */
  (function () {
    var bouton = $("emporter");
    if (!bouton) return;

    var icone = $("emporterIcone"), mot = $("emporterMot"), jauge = $("emporterJauge"),
        voile = $("emporterVoile"), feuille = $("emporterFeuille"),
        bLancer = $("emporterLancer"), bPlusTard = $("emporterPlusTard");

    /* Le « plus tard » se retient, sinon la pilule dépliée redemande à chaque
       ouverture ce à quoi on a déjà répondu. */
    var CLE_PLUS_TARD = "carnet-japon-carte-plus-tard";

    /* Dessinées ici et non dans `icones.js`, qui est le jeu des catégories du
       carnet : une flèche pleine qui descend sur un socle, une coche. Formes
       pleines et non des traits d'un pixel — à dix-sept pixels sur un fond de
       rues, un contour fin disparaît. */
    var FLECHE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M10.4 3h3.2v6.9h3.5L12 16.6 5.9 9.9h4.5V3Z"/>' +
      '<path d="M4.4 18.4h15.2V21H4.4z"/></svg>';
    var COCHE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M9.5 18 3.4 11.9l2.5-2.5 3.6 3.6 8.6-8.6L20.6 7 9.5 18Z"/></svg>';

    var enCours = false;

    /* ⚠️ Dépliée, la pilule occupe cent quatre-vingts pixels dans le coin bas
       droit — là où le pouce se pose pour pincer. Un geste de zoom qui commence
       dessus est avalé par le bouton, et le zoom ne prend pas. Elle se replie
       donc au premier contact avec la carte : vue à l'ouverture, hors du chemin
       dès qu'on manipule. Une fois repliée par un geste, elle le reste. */
    var plieeParGeste = false;

    function refusee() {
      return window.Sur.lire(CLE_PLUS_TARD, function (v) { return v === 1; }, 0) === 1;
    }

    function ouvrirFeuille() {
      $("emporterNb").textContent = LIEUX.length + " adresses";
      voile.hidden = false;
      feuille.hidden = false;
      bLancer.focus();
    }

    function fermerFeuille(rendreLeFocus) {
      voile.hidden = true;
      feuille.hidden = true;
      if (rendreLeFocus && !bouton.hidden) bouton.focus();
    }

    function telecharger() {
      if (enCours) return;
      enCours = true;
      fermerFeuille(false);
      bouton.classList.remove("plie");
      bouton.disabled = true;
      mot.textContent = "Téléchargement… 0 %";
      jauge.style.width = "0%";

      window.Carnet.installerCarte(function (f) {
        var pc = Math.round(Math.min(Math.max(f, 0), 1) * 100);
        jauge.style.width = pc + "%";
        mot.textContent = "Téléchargement… " + pc + " %";
      }).then(function () {
        enCours = false;
        bouton.disabled = false;
        bouton.classList.add("fait");
        icone.innerHTML = COCHE;
        mot.textContent = "Carte prête sans réseau";
        jauge.style.width = "100%";
        window.Carnet.dire("Carte installée. Elle prendra le relais toute seule " +
                           "dès que le réseau manquera.");
        /* Puis elle s'efface : ce qui est fait n'a plus à occuper la carte.
           L'onglet « Utile » garde la place occupée et le bouton pour la
           libérer. */
        setTimeout(function () { bouton.hidden = true; }, 6000);
      }, function (err) {
        enCours = false;
        bouton.disabled = false;
        jauge.style.width = "0%";
        icone.innerHTML = FLECHE;
        mot.textContent = "Reprendre le téléchargement";
        bouton.classList.remove("plie");
        window.Carnet.dire("Téléchargement interrompu : " +
          ((err && err.message) || "réseau perdu") +
          ". À reprendre en Wi-Fi — les mégaoctets déjà passés sont gardés.");
      });
    }

    function rendre() {
      if (!window.Carnet || !window.Carnet.etatCarte) return;
      window.Carnet.etatCarte().then(function (e) {
        if (enCours) return;
        /* Déjà installée : on ne propose plus rien. Un bouton qui reste après
           coup ne se lit plus comme une offre mais comme un doute. */
        if (e.total > 0 && e.installees === e.total) {
          bouton.hidden = true;
          return;
        }
        icone.innerHTML = FLECHE;
        mot.textContent = e.installees ? "Reprendre le téléchargement"
                                       : "Carte hors connexion";
        /* Dépliée tant que la question n'a pas été tranchée : c'est une
           invitation, elle doit se lire. Une fois remise à plus tard, elle se
           replie sur son icône — toujours là, sans encombrer. */
        bouton.classList.toggle("plie", plieeParGeste || (refusee() && !e.installees));
        bouton.hidden = false;
      });
    }

    bouton.addEventListener("click", function () {
      if (enCours) return;
      ouvrirFeuille();
    });
    bLancer.addEventListener("click", telecharger);
    bPlusTard.addEventListener("click", function () {
      window.Sur.ecrire(CLE_PLUS_TARD, 1);
      fermerFeuille(true);
      bouton.classList.add("plie");
    });
    voile.addEventListener("click", function () { fermerFeuille(true); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !feuille.hidden) fermerFeuille(true);
    });

    var plan = $("carte");
    if (plan) {
      plan.addEventListener("pointerdown", function () {
        if (plieeParGeste) return;
        plieeParGeste = true;
        bouton.classList.add("plie");
      }, { passive: true });
    }

    rendre();
    /* L'onglet « Utile » peut installer ou libérer de son côté : la pilule se
       remet d'accord avec la base quand on revient sur la carte. */
    var ongletCarte = $("ongletCarte");
    if (ongletCarte) ongletCarte.addEventListener("click", rendre);
  })();

  /* ---------- quand le réseau tombe -----------------------------------------
   *
   * Au Japon, ça arrivera : dans le métro entre deux stations, dans un
   * sous-sol de Shibuya, le jour où l'eSIM décide de ne plus fonctionner. Le
   * carnet continue de marcher — c'est sa raison d'être — mais rien ne le
   * disait, et l'on croyait l'application cassée.
   *
   * `navigator.onLine` ment dans un sens seulement : il peut dire « en ligne »
   * derrière un portail captif qui ne laisse rien passer. Il ne dit jamais
   * « hors ligne » à tort. On ne s'en sert donc que pour annoncer la perte,
   * jamais pour promettre le retour.
   */
  (function () {
    /* La bascule d'abord, l'annonce ensuite : ce qu'on dit dépend de ce qu'on
       a réussi à rouvrir. Avant le 18/09 on annonçait d'après `archives`, qui
       était vide à chaque ouverture — le carnet disait « le fond de carte,
       non » à des gens qui l'avaient pourtant installé. */
    function annoncerPerte() {
      /* ⚠️ On vérifie avant de croire à la coupure. `navigator.onLine` bascule
         pour un simple changement d'antenne ou un passage Wi-Fi → 4G, et le
         carnet se mettait alors à changer de fond de carte et à annoncer une
         panne qui n'existait pas. Tant que le serveur de tuiles répond, il ne
         s'est rien passé : ni message, ni bascule. */
      reseauRepond().then(function (encoreLa) {
        if (encoreLa) return;
        basculerHorsConnexion().then(function (fond) {
          montrerPied(
            "Hors connexion. Les " + LIEUX.length + " adresses, les phrases et les " +
            "numéros restent là" +
            /* La couverture est dite, parce qu'elle s'aperçoit sinon comme une
               panne : l'archive va du niveau 11 au niveau 15, donc trop dézoomé
               l'écran est vide, et zoomé à fond l'image est agrandie. Annoncer
               « le fond de carte aussi » sans le préciser ferait croire à un
               bug au premier coup d'œil. */
            (fond ? ", et le fond de carte aussi — de la ville au quartier."
                  : " — le fond de carte, non."),
            { refermable: true, secondes: 8 });
        });
      });
    }
    window.addEventListener("offline", annoncerPerte);
    /* Le retour du signal ne défait pas la bascule tout seul : `revenirAuReseau`
       va d'abord chercher une vraie tuile, parce qu'un portail captif suffit à
       faire dire « en ligne » à un téléphone qui ne passe nulle part. */
    window.addEventListener("online", revenirAuReseau);
    // Au chargement : si l'on ouvre le carnet déjà hors connexion, il faut le
    // dire tout de suite, sinon la carte vide passe pour une panne.
    if (navigator.onLine === false) { setTimeout(annoncerPerte, 900); }
  })();

  /* Le mode hors connexion, et ce qui l'empêche.

     `navigator.serviceWorker` n'existe pas sur une origine non sécurisée. Servi
     en clair sur une adresse IP, le carnet ne peut donc rien mettre en cache —
     et c'est précisément ce pour quoi il est fait : tenir sans réseau au Japon.
     L'échec était avalé par un `catch` vide ; il se dit maintenant dans le pied
     de page, seul endroit où Paco le lira avant de partir. */
  (function () {
    if (!("serviceWorker" in navigator)) {
      montrerPied(window.isSecureContext === false
        ? "Sans réseau, le carnet ne s’ouvrira pas : il est servi en http. Rouvrez-le en https."
        : "Sans réseau, le carnet ne s’ouvrira pas : ce navigateur ne sait pas le mettre en cache.",
        { refermable: true });
      return;
    }
    var majPrete = false;
    function poser() {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        /* ⚠️ **LE CARNET POUVAIT RESTER BLOQUÉ SUR UNE VERSION ANCIENNE.**
         *
         * Constaté le 18/09/2026 : Paco ouvrait le carnet sur son téléphone et
         * y trouvait la version d'avant le 14 septembre — sans onglet Accueil,
         * sans constellation. Le serveur servait pourtant la bonne.
         *
         * La stratégie « cache d'abord » sert la copie installée, puis va
         * chercher la suite en arrière-plan. Tant que la page n'est pas
         * rechargée **après** cette mise à jour, on continue de voir l'ancienne
         * — et rien ne le dit. Sur un carnet ouvert deux minutes puis refermé,
         * cela peut durer indéfiniment : chaque ouverture affiche l'ancienne
         * version et prépare la nouvelle, que l'ouverture suivante n'utilisera
         * pas davantage.
         *
         * Deux gestes ici :
         *   1. `reg.update()` force la vérification au chargement, sans
         *      attendre le rythme du navigateur ;
         *   2. quand une version est installée **alors qu'une autre est déjà en
         *      service**, on le dit et on offre de recharger. C'est la seule
         *      chose qui manquait.
         */
        try { reg.update(); } catch (e) {}
        reg.addEventListener("updatefound", function () {
          var arrivant = reg.installing;
          if (!arrivant) return;
          arrivant.addEventListener("statechange", function () {
            if (arrivant.state !== "installed") return;
            // Sans contrôleur, c'est la première installation : rien à annoncer.
            if (!navigator.serviceWorker.controller) return;
            majPrete = true;
            montrerPied("Une nouvelle version du carnet est prête.", {
              bouton: "Recharger",
              refermable: true,
              surClic: function () { location.reload(); }
            });
          });
        });
        /* Ce qui tient sans réseau, et ce qui ne tient pas. Le fond de carte
           vient du serveur japonais et ne tient sans réseau que si on l'a
           emporté — le message le disait « demande une connexion » même à
           qui avait installé les 108 Mo (corrigé le 29/09). */
        window.Carnet.etatCarte().then(function (e) {
          if (majPrete) return;     // l'annonce de mise à jour passe avant
          var emportee = e.total > 0 && e.installees === e.total;
          montrerPied("Les " + LIEUX.length + " adresses sont consultables sans réseau." +
                      (emportee ? " Le fond de carte aussi, de la ville au quartier."
                                : " Le fond de carte, lui, demande une connexion."),
                      { secondes: 6, refermable: true });
        });
      }, function (e) {
        montrerPied("Sans réseau, le carnet ne s’ouvrira pas — la mise en cache a échoué.",
                    { refermable: true, bouton: "Réessayer",
                      surClic: function () { effacerPied(); poser(); } });
        if (window.console) { console.warn("service worker :", e); }
      });
    }
    // `load` a pu passer avant que ce script s'exécute — au rechargement d'une
    // page déjà en cache, notamment. On attendait alors un événement qui ne
    // viendrait plus, et le pied restait sur son texte d'attente.
    if (document.readyState === "complete") { poser(); }
    else { window.addEventListener("load", poser); }
  })();
})();
