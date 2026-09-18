/* Regroupement d'épingles — écrit de ma main, sans bibliothèque.
 *
 * À l'échelle d'une ville, deux cents épingles se recouvrent : au-dessus de
 * Shibuya on ne voit plus qu'une bouillie. On les rassemble donc en disques
 * portant un nombre, qu'un clic fait éclater.
 *
 * **Pourquoi pas une grille.** La version précédente découpait le monde en
 * carrés de 46 px et groupait par case. C'est rapide mais ça a un défaut
 * visible : deux épingles distantes de dix pixels tombent parfois de part et
 * d'autre d'une frontière et restent seules, l'une contre l'autre, alors que
 * deux épingles aux coins opposés d'une même case sont groupées bien qu'on les
 * distingue très bien. Le regroupement dépend de l'endroit où le quadrillage
 * tombe, pas de ce qu'on voit.
 *
 * **Ce qu'on fait à la place — un glouton par distance.** On trie les points,
 * on prend le premier libre, on lui agrège tous ses voisins à moins d'un rayon,
 * on recommence. Le critère devient « ces épingles se chevauchent-elles ? »,
 * ce qui est exactement la question posée. C'est en O(n·k) avec une grille
 * d'accélération, et sur nos 318 points c'est instantané.
 *
 * L'ordre de parcours décide du résultat : on trie du plus dense au moins
 * dense, pour que les centres de groupe tombent là où il y a foule plutôt que
 * sur un point de bordure pris au hasard.
 */

(function (global) {
  "use strict";

  var RAYON = 44;          // px d'écran — deux épingles plus proches se cachent

  /* Grille d'accélération : on ne compare un point qu'aux cases voisines. */
  function indexer(points, maille) {
    var cases = {};
    points.forEach(function (p, i) {
      var k = Math.floor(p.x / maille) + ":" + Math.floor(p.y / maille);
      (cases[k] = cases[k] || []).push(i);
    });
    return cases;
  }

  function voisins(cases, maille, p) {
    var cx = Math.floor(p.x / maille), cy = Math.floor(p.y / maille), out = [];
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        var c = cases[(cx + dx) + ":" + (cy + dy)];
        if (c) out.push.apply(out, c);
      }
    }
    return out;
  }

  /* `entrees` : [{x, y, ...}] en pixels monde au zoom courant.
   * Renvoie [{type:"point"|"groupe", x, y, membres|…}]. */
  function grouper(entrees, rayon) {
    rayon = rayon || RAYON;
    var maille = rayon;
    var cases = indexer(entrees, maille);
    var r2 = rayon * rayon;

    // Densité locale : combien de voisins dans le rayon. Elle décide de l'ordre.
    var densite = entrees.map(function (p) {
      var n = 0;
      voisins(cases, maille, p).forEach(function (j) {
        var q = entrees[j], dx = q.x - p.x, dy = q.y - p.y;
        if (dx * dx + dy * dy <= r2) n++;
      });
      return n;
    });

    var ordre = entrees.map(function (_, i) { return i; })
      .sort(function (a, b) { return densite[b] - densite[a] || a - b; });

    var pris = new Uint8Array(entrees.length), sortie = [];
    ordre.forEach(function (i) {
      if (pris[i]) return;
      var p = entrees[i], membres = [];
      voisins(cases, maille, p).forEach(function (j) {
        if (pris[j]) return;
        var q = entrees[j], dx = q.x - p.x, dy = q.y - p.y;
        if (dx * dx + dy * dy <= r2) { pris[j] = 1; membres.push(q); }
      });
      if (membres.length === 1) {
        sortie.push({ type: "point", e: membres[0], x: p.x, y: p.y });
      } else {
        // Le disque se pose au barycentre : un groupe centré sur son premier
        // membre paraît décalé par rapport à la tache qu'il remplace.
        var sx = 0, sy = 0;
        membres.forEach(function (m) { sx += m.x; sy += m.y; });
        sortie.push({ type: "groupe", membres: membres,
                      x: sx / membres.length, y: sy / membres.length });
      }
    });
    return sortie;
  }

  global.Groupes = { grouper: grouper, RAYON: RAYON };
})(this);
