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
window.CARNET_VERSION = "v18 — 18 septembre 2026";

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

  window.addEventListener("error", function (e) {
    if (e.target && e.target.tagName === "SCRIPT") {
      montrer("Script non chargé : " + (e.target.src || "?"));
      return;
    }
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
