/* Les icônes des catégories — dessinées ici, à la main.
 *
 * Sur la carte, une pastille de couleur ne dit rien : on voit un point gris et
 * l'on ne sait pas si l'on va tomber sur un yakitori ou sur un temple. La
 * couleur seule demande d'apprendre une légende ; une forme se reconnaît.
 *
 * **Contraintes de dessin, et elles sont sévères.** Ces icônes vivent à 11 px
 * de côté, à l'intérieur d'une goutte de 20 px, par-dessus une carte chargée.
 * D'où les partis pris :
 *   · des formes **pleines**, jamais de traits fins — un contour d'un pixel
 *     disparaît sur un fond de rues ;
 *   · **une seule idée par icône**. Un sushi, ce sont deux formes : le riz et
 *     le poisson. Y ajouter l'algue ferait une tache ;
 *   · silhouettes reconnaissables **en négatif**, puisqu'elles sont blanches
 *     sur la couleur de la catégorie ;
 *   · ce qui vient du Japon plutôt que d'un jeu d'icônes générique — un torii
 *     pour visiter, une lanterne d'izakaya pour sortir. Le carnet parle d'un
 *     pays, ses icônes aussi.
 *
 * Aucune police d'icônes, aucun fichier image : du SVG en ligne, mis en cache
 * avec le reste. Les huit tiennent en deux kilooctets.
 *
 * Les clés sont les catégories telles que `construire.py` les écrit, après la
 * fusion Friperie/Boutique → Shopping.
 */
(function () {
  "use strict";

  // Toutes les formes sont dessinées dans un carré de 24, puis mises à
  // l'échelle par le CSS. `currentColor` laisse l'appelant décider de la
  // teinte — blanc sur la carte, couleur de la catégorie dans une liste.
  function svg(contenu) {
    return '<svg class="jp-icone" viewBox="0 0 24 24" fill="currentColor" ' +
           'aria-hidden="true" focusable="false">' + contenu + "</svg>";
  }

  var FORMES = {
    /* Un nigiri vu de trois quarts : la boule de riz, et la tranche posée
       dessus qui déborde des deux côtés. C'est ce débord qui le distingue
       d'un simple galet. */
    "Manger": '<path d="M2.6 13.4c0-3.6 4.2-6.2 9.4-6.2s9.4 2.6 9.4 6.2z"/>' +
              '<rect x="2.6" y="14.4" width="18.8" height="6.4" rx="3.2"/>',

    /* Un sac à anses. Le corps s'évase légèrement vers le bas : un rectangle
       droit se lit comme une boîte, pas comme un sac qu'on porte. */
    "Shopping": '<path d="M4.4 8.2h15.2l-1.3 12.6H5.7z"/>' +
                '<path d="M8.6 9V6.4a3.4 3.4 0 0 1 6.8 0V9h-2.2V6.4a1.2 1.2 0 0 0-2.4 0V9z"/>',

    /* Un torii. Deux traverses, deux piliers, et le linteau supérieur plus
       large que la base — sans ce débord, on lit une porte quelconque. */
    "Visiter": '<path d="M1.8 4.2h20.4v2.9H1.8z"/>' +
               '<path d="M4.6 8.6h14.8v2.3H4.6z"/>' +
               '<path d="M5.9 7.1h2.7v13.7H5.9z"/>' +
               '<path d="M15.4 7.1h2.7v13.7h-2.7z"/>',

    /* Une tasse sur sa soucoupe, avec l'anse à droite. La soucoupe compte :
       sans elle, la forme se confond avec un seau. */
    "Café": '<path d="M3.4 8.6h12.2v6.1a4.3 4.3 0 0 1-4.3 4.3H7.7a4.3 4.3 0 0 1-4.3-4.3z"/>' +
            '<path d="M16.6 10.1h1.6a2.9 2.9 0 0 1 0 5.8h-1.6v-2.1h1.6a.8.8 0 0 0 0-1.6h-1.6z"/>' +
            '<rect x="2.2" y="20" width="15.4" height="2.1" rx="1.05"/>',

    /* Une lanterne de papier 提灯, celle qui pend devant les izakaya. Les deux
       coiffes plates en haut et en bas sont ce qui la sépare d'un ballon. */
    "Sortir": '<ellipse cx="12" cy="12.4" rx="6.3" ry="7.6"/>' +
              '<rect x="7.9" y="2.6" width="8.2" height="2.2" rx="1.1"/>' +
              '<rect x="7.9" y="19.4" width="8.2" height="2.2" rx="1.1"/>' +
              '<rect x="11.2" y="0.9" width="1.6" height="2"/>',

    /* Un futon posé : le matelas bas, et l'oreiller carré à gauche. Un lit
       occidental à pieds hauts n'aurait rien dit de l'endroit. */
    "Dormir": '<rect x="2" y="14.6" width="20" height="5.2" rx="1.6"/>' +
              '<rect x="3.6" y="10.4" width="6.6" height="4.6" rx="1.8"/>' +
              '<path d="M11 10.4h9.4a1.6 1.6 0 0 1 1.6 1.6v3h-11z"/>',

    /* Une étiquette de prix, percée de son œillet. */
    "Bon plan": '<path d="M11.4 2.2h8.4a2 2 0 0 1 2 2v8.4L12 22.4 1.6 12z"/>' +
                '<circle cx="17.4" cy="6.6" r="1.9" fill="#fff" opacity=".85"/>',

    /* Une montagne à double sommet, le petit devant le grand — la silhouette
       d'un massif, pas le triangle isolé du Fuji, puisque la catégorie couvre
       toutes les sorties hors des villes. */
    "Excursion": '<path d="M1.4 20.4l6.5-10.8 4 6.2 2.6-4.2 8.1 8.8z"/>'
  };

  /* Quand une catégorie n'a pas de forme — une valeur inattendue arrivée d'un
     import —, on ne renvoie rien plutôt qu'un point d'interrogation : la
     pastille de couleur seule reste, et elle reste juste. */
  window.Icones = {
    pour: function (categorie) {
      var f = FORMES[categorie];
      return f ? svg(f) : "";
    },
    categories: Object.keys(FORMES)
  };
})();
