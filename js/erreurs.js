/* Les erreurs à l'écran, et le diagnostic.
 *
 * Sur un téléphone, une page blanche ne dit rien : la console n'y est pas
 * consultable, et il faut brancher l'appareil à un ordinateur pour savoir ce
 * qui s'est passé. Ce fichier attrape tout ce qui échoue et l'écrit en haut de
 * la page.
 *
 * **Pourquoi il n'est plus écrit dans `index.html`.** Il y était, en clair,
 * dans une balise `<script>` posée avant tout le reste. C'est ce qui obligeait
 * la politique de sécurité de contenu à autoriser `'unsafe-inline'` pour les
 * scripts — c'est-à-dire à autoriser aussi n'importe quel script qu'une donnée
 * mal filtrée aurait fait entrer dans la page. Sorti dans son propre fichier,
 * il est chargé par `script-src 'self'`, et la page peut interdire tout le
 * reste. Il reste le premier script de la page : une erreur de chargement des
 * suivants doit encore pouvoir s'afficher.
 */

/* La version du carnet, écrite à un seul endroit. Elle s'affiche au pied de
   l'accueil et dans le diagnostic : c'est ce qui permet de dire en une seconde
   « tu regardes une version périmée » au lieu de chercher côté serveur.
   ⚠️ À faire monter en même temps que `VERSION` dans sw.js. */
window.CARNET_VERSION = "v20 — 18 septembre 2026";

(function () {
  "use strict";

  function montrer(texte) {
    var d = document.getElementById("erreurJS");
    if (!d) {
      d = document.createElement("div");
      d.id = "erreurJS";
      /* La mise en forme est dans la feuille de style, plus dans un attribut
         `style` : c'est le second morceau qui imposait `'unsafe-inline'`, pour
         les styles cette fois. Si la feuille elle-même n'a pas pu se charger,
         le bandeau apparaît sans décor — mais le texte, lui, s'affiche, et
         c'est tout ce qu'on lui demande dans ce cas-là. */
      (document.body || document.documentElement).appendChild(d);
    }
    d.textContent += texte + "\n";
  }

  /* ⚠️ Le bandeau ne parle que des pannes du carnet.
   *
   * Les navigateurs intégrés à Facebook, Instagram et Messenger glissent leur
   * propre script de mesure dans chaque page qu'ils ouvrent. La
   * politique de sécurité de la page le refuse — `script-src 'self'`, c'est
   * exactement son travail —, et l'échec remontait ici : le carnet s'ouvrait
   * sur un bandeau rouge « Script non chargé : https://connect.facebook.net/… »
   * alors que rien du carnet n'avait échoué (constaté le 18/09/2026, lien
   * ouvert depuis une conversation). Même histoire pour une extension de
   * navigateur ou un antivirus qui injecte du code dans les pages.
   *
   * Ce bandeau sert à comprendre une page blanche sur un téléphone, pas à
   * tenir le journal de ce que les autres tentent d'y mettre : ce qui ne vient
   * pas de notre propre origine est ignoré en silence. */
  function deChezNous(url) {
    if (!url) return false;   /* sans `src` : aucun des nôtres n'est dans ce cas */
    try {
      return new URL(url, location.href).origin === location.origin;
    } catch (erreur) {
      return false;
    }
  }

  window.addEventListener("error", function (e) {
    var balise = e.target && e.target.tagName;

    /* Une ressource qui n'a pas pu se charger : l'événement porte l'élément
       fautif, et rien d'autre — ni message, ni ligne. */
    if (balise) {
      /* Une vignette manquante parmi 351 ne casse rien et n'a pas à couvrir
         l'écran — avant ce tri, elle y écrivait « Erreur : undefined ». */
      if (balise !== "SCRIPT" && balise !== "LINK") return;
      var source = e.target.src || e.target.href;
      if (!deChezNous(source)) return;
      montrer((balise === "SCRIPT" ? "Script non chargé : "
                                   : "Feuille de style non chargée : ") +
              source.split("/").pop());
      return;
    }

    /* Une erreur levée par un script d'une autre origine arrive vidée de sa
       substance : le navigateur n'en livre que « Script error. », sans fichier
       ni ligne. Elle ne nous apprend rien et ne nous concerne pas. */
    if (e.filename && !deChezNous(e.filename)) return;
    if (!e.filename && /^Script error\.?$/.test(e.message || "")) return;

    montrer("Erreur : " + (e.message || e.error) +
            "\n  " + (e.filename || "").split("/").pop() + " ligne " + e.lineno);
  }, true);

  window.addEventListener("unhandledrejection", function (e) {
    montrer("Promesse rejetée : " +
            (e.reason && e.reason.message ? e.reason.message : e.reason));
  });

  /* Ce que le bouton « Diagnostic technique » de l'accueil appelle. Il énumère
     ce dont le carnet a besoin et ce qu'il a trouvé — c'est ce qui a permis, le
     14/09, de comprendre qu'un téléphone n'avait pas `DecompressionStream` et
     que rien d'autre n'était en cause. */
  window.__diagnostic = function () {
    var t = [];
    t.push("version du carnet : " + (window.CARNET_VERSION || "inconnue"));
    t.push("navigateur : " + navigator.userAgent);
    t.push("origine sûre : " + (window.isSecureContext ? "oui" : "NON — hors connexion et position indisponibles"));
    t.push("DecompressionStream : " + (typeof DecompressionStream !== "undefined" ? "oui" : "NON — c'est bloquant"));
    t.push("IndexedDB : " + (typeof indexedDB !== "undefined" ? "oui" : "NON"));
    t.push("ResizeObserver : " + (typeof ResizeObserver !== "undefined" ? "oui" : "non (non bloquant)"));
    t.push("sûreté : " + (window.Sur ? "oui" : "NON — les filtres ne sont pas chargés"));
    t.push("données : " + (window.LIEUX ? window.LIEUX.length + " adresses" : "NON CHARGÉES"));
    t.push("moteur de carte : " + (window.CarteJapon ? "oui" : "NON"));
    t.push("lecteur PMTiles : " + (window.PMTiles ? "oui" : "NON"));
    t.push("regroupement : " + (window.Groupes ? "oui" : "NON"));
    t.push("carte créée : " + (window.carteJapon ? "oui" : "NON"));
    t.push("hors connexion : " + (navigator.serviceWorker && navigator.serviceWorker.controller
      ? "installé" : "pas encore installé"));
    montrer(t.join("\n"));
  };
})();
