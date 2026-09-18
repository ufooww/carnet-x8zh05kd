/* La boîte à liens — « j'ai vu un endroit, je te l'envoie ».
 *
 * Le carnet est un site statique, et sa politique de sécurité lui interdit
 * d'émettre quoi que ce soit (`default-src 'none'`, `connect-src 'self'`,
 * `form-action 'none'`). Il n'y a donc **aucun formulaire qui envoie**, et il
 * n'y en aura pas : ce serait un serveur à tenir, une adresse de plus où les
 * liens de six personnes dormiraient chez un tiers, et une brèche dans la seule
 * règle qui rend ce carnet sûr.
 *
 * Le chemin est donc le même que pour le partage des envies : **du texte, qui
 * se copie et se colle dans la conversation du groupe.** L'ami colle son lien
 * ici, il s'empile dans son téléphone, et quand il en a deux ou trois il touche
 * « Envoyer à Paco ». Sur un téléphone, le partage natif ouvre directement
 * WhatsApp ; ailleurs, le texte part dans le presse-papier.
 *
 * ⚠️ **Un lien collé vient de l'extérieur.** Trois filtres, dans cet ordre :
 *   1. `Sur.urlSure` écarte tout ce qui n'est pas `https:` — c'est lui qui a
 *      attrapé l'adresse `javascript:` de l'audit du 17/09 ;
 *   2. le domaine doit figurer dans la liste blanche ci-dessous : un carnet de
 *      voyage n'a aucune raison de recevoir autre chose qu'un réseau social ou
 *      une carte ;
 *   3. le lien est rangé et **affiché comme du texte**, jamais comme un lien
 *      cliquable — personne n'a à cliquer sur ce que quelqu'un d'autre a collé.
 *
 * Rien n'est ajouté au carnet ici. Un lien est une piste, pas une adresse : il
 * passe par moi, je regarde la vidéo, et la fiche entre au carnet avec sa
 * source. C'est la même règle que pour l'import d'un carnet — l'extérieur ne
 * crée jamais d'adresse.
 */

(function (global) {
  "use strict";

  var Sur = global.Sur;
  var CLE = "carnet-japon-liens";
  var ENTETE = "LIENS JAPON v1";
  var MAX = 40;

  /* Ce qu'on accepte. Les formes raccourcies comptent autant que les longues :
     c'est ce que donne le bouton « partager » des applications, et refuser
     `vm.tiktok.com` rendrait la boîte inutilisable depuis un téléphone. */
  var DOMAINES = [
    "tiktok.com", "vm.tiktok.com", "vt.tiktok.com",
    "instagram.com", "instagr.am",
    "youtube.com", "youtu.be",
    "x.com", "twitter.com",
    "facebook.com", "fb.watch",
    "vimeo.com",
    "google.com", "goo.gl", "maps.app.goo.gl", "google.co.jp",
    "pinterest.com", "pin.it",
    "tabelog.com"
  ];

  function hote(url) {
    /* Pas de `new URL()` : sur un vieux navigateur de téléphone il manque, et
       le carnet doit marcher sur ce que les six ont dans la poche. */
    var m = /^https:\/\/([^/?#]+)/i.exec(url);
    if (!m) return "";
    return m[1].toLowerCase().replace(/^www\./, "").split(":")[0];
  }

  function domaineConnu(url) {
    var h = hote(url);
    if (!h) return false;
    for (var i = 0; i < DOMAINES.length; i++) {
      var d = DOMAINES[i];
      if (h === d || h.slice(-(d.length + 1)) === "." + d) return true;
    }
    return false;
  }

  function valide(liste) {
    if (!liste || typeof liste !== "object" || !liste.length) return false;
    for (var i = 0; i < liste.length; i++) {
      if (typeof liste[i] !== "string") return false;
    }
    return liste.length <= MAX;
  }

  /* ---------- état --------------------------------------------------------- */

  var liens = [];
  var avis = null;

  function charger() {
    var v = Sur.lire(CLE, valide, []);
    liens = Array.isArray(v) ? v : [];
  }

  function ranger() {
    if (!Sur.ecrire(CLE, liens)) {
      dire("Le téléphone refuse d'enregistrer — copiez vos liens tout de suite.");
    }
  }

  function dire(texte, ok) {
    if (!avis) return;
    avis.textContent = texte || "";
    avis.className = "bloc-note" + (ok ? " u-ok" : "");
  }

  /* ---------- ajouter ------------------------------------------------------ */

  function ajouter(brut) {
    var url = Sur.urlSure(String(brut || "").trim());
    if (!url || url.indexOf("https:") !== 0) {
      dire("Il faut un lien complet, qui commence par https.");
      return false;
    }
    if (!domaineConnu(url)) {
      dire("Ce site n'est pas dans la liste : TikTok, Instagram, YouTube, "
           + "Google Maps, Tabelog et quelques autres.");
      return false;
    }
    if (url.length > 400) {
      dire("Ce lien est anormalement long — vérifiez le copier-coller.");
      return false;
    }
    if (liens.indexOf(url) >= 0) {
      dire("Celui-là est déjà dans la liste.");
      return false;
    }
    if (liens.length >= MAX) {
      dire("La liste est pleine (" + MAX + "). Envoyez-la à Paco d'abord.");
      return false;
    }
    liens.push(url);
    ranger();
    rendre();
    dire("Ajouté. Envoyez-les à Paco quand vous en avez plusieurs.", true);
    return true;
  }

  function retirer(url) {
    var i = liens.indexOf(url);
    if (i < 0) return;
    liens.splice(i, 1);
    ranger();
    rendre();
    dire("Retiré.");
  }

  /* ---------- envoyer ------------------------------------------------------ */

  function texteAEnvoyer(qui) {
    var lignes = [ENTETE];
    var nom = Sur.texte(qui || "", 40);
    if (nom) lignes.push("# De " + nom);
    lignes = lignes.concat(liens);
    return lignes.join("\n");
  }

  function envoyer(bouton, qui) {
    if (!liens.length) { dire("Aucun lien à envoyer."); return; }
    var texte = texteAEnvoyer(qui);
    if (global.navigator.share) {
      global.navigator.share({ title: "Adresses pour le carnet", text: texte })
        .then(function () {
          dire("Envoyé. Vous pouvez vider la liste.", true);
        })
        .catch(function () { /* partage refusé : on ne dit rien, il réessaiera */ });
      return;
    }
    if (global.Utile && global.Utile.copier) {
      global.Utile.copier(texte, bouton);
      dire("Copié — collez-le dans la conversation du groupe.", true);
    }
  }

  /* ---------- affichage ---------------------------------------------------- */

  function joli(url) {
    /* Le lien s'affiche pour être reconnu, pas pour être lu en entier : on
       garde le site et la fin de l'identifiant. */
    var h = hote(url);
    var reste = url.replace(/^https:\/\/[^/]+\/?/i, "").replace(/[?#].*$/, "");
    if (reste.length > 34) reste = reste.slice(0, 16) + "…" + reste.slice(-14);
    return h + (reste ? " / " + reste : "");
  }

  function rendre() {
    var hoteListe = document.getElementById("liensListe");
    var compte = document.getElementById("liensCompte");
    if (!hoteListe) return;

    if (compte) {
      compte.textContent = liens.length ? String(liens.length) : "";
    }
    hoteListe.innerHTML = "";
    if (!liens.length) {
      var vide = document.createElement("p");
      vide.className = "bloc-note";
      vide.textContent = "Aucun lien en attente.";
      hoteListe.appendChild(vide);
      basculerActions(false);
      return;
    }

    var ul = document.createElement("ul");
    ul.className = "liens-liste";
    liens.forEach(function (url) {
      var li = document.createElement("li");
      var txt = document.createElement("span");
      txt.className = "liens-url";
      /* `textContent` et pas `innerHTML` : ce texte vient de l'extérieur. */
      txt.textContent = joli(url);
      txt.title = url;
      var bt = document.createElement("button");
      bt.type = "button";
      bt.className = "liens-retirer";
      bt.setAttribute("aria-label", "Retirer ce lien");
      bt.textContent = "×";
      bt.addEventListener("click", function () { retirer(url); });
      li.appendChild(txt);
      li.appendChild(bt);
      ul.appendChild(li);
    });
    hoteListe.appendChild(ul);
    basculerActions(true);
  }

  function basculerActions(actif) {
    ["liensEnvoyer", "liensVider"].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.disabled = !actif;
    });
  }

  /* ---------- démarrage ---------------------------------------------------- */

  function demarrer() {
    var champ = document.getElementById("liensChamp");
    if (!champ) return;
    avis = document.getElementById("liensAvis");
    charger();
    rendre();

    var qui = document.getElementById("liensQui");

    function soumettre() {
      if (ajouter(champ.value)) champ.value = "";
      champ.focus();
    }

    var bAjouter = document.getElementById("liensAjouter");
    if (bAjouter) bAjouter.addEventListener("click", soumettre);
    champ.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); soumettre(); }
    });
    /* Coller vaut ajouter : c'est le geste réel — on sort de TikTok, on colle,
       on veut que ce soit fait. Le délai laisse le champ recevoir le texte. */
    champ.addEventListener("paste", function () {
      global.setTimeout(function () {
        if (champ.value.trim()) soumettre();
      }, 0);
    });

    var bEnvoyer = document.getElementById("liensEnvoyer");
    if (bEnvoyer) {
      bEnvoyer.addEventListener("click", function () {
        envoyer(bEnvoyer, qui ? qui.value : "");
      });
    }
    var bVider = document.getElementById("liensVider");
    if (bVider) {
      bVider.addEventListener("click", function () {
        if (!liens.length) return;
        if (!global.confirm("Vider la liste ? Les liens déjà envoyés à Paco "
                            + "restent chez lui.")) return;
        liens = [];
        ranger();
        rendre();
        dire("Liste vidée.");
      });
    }
  }

  global.Liens = { demarrer: demarrer, ajouter: ajouter };
})(window);
