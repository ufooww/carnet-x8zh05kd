/* Aurore — le fond animé du ciel.
 *
 * Un dégradé CSS, même lent, reste un dégradé : il se répète, on en fait le
 * tour en deux secondes et l'œil s'en détourne. Ce qui retient, c'est une
 * matière qui ne se répète jamais — des voiles de lumière qui se déforment
 * sans jamais repasser par le même état.
 *
 * C'est un shader, écrit ici en entier : le bruit, les voiles et la palette.
 * Aucune bibliothèque, aucun CDN — le carnet doit s'ouvrir dans une ruelle de
 * Shimokitazawa sans réseau, et 700 Ko de moteur 3D téléchargés à la volée n'y
 * afficheraient rien du tout.
 *
 * Ce qu'il coûte, et comment on le tient :
 *   · WebGL 1, précision moyenne — ce que tout iPhone sait faire depuis 2014 ;
 *   · rendu à 30 images par seconde, pas 60 : l'œil ne voit pas la différence
 *     sur des voiles aussi lents, le processeur graphique la voit très bien ;
 *   · résolution plafonnée à 1,5 fois le point CSS, au lieu des 3 d'un écran
 *     de téléphone récent — un flou qui n'existe pas sur un dégradé ;
 *   · la boucle s'arrête dès que le ciel quitte l'écran ou que l'onglet passe
 *     en arrière-plan. Un carnet de voyage ne vide pas la batterie de celui
 *     qui cherche son restaurant ;
 *   · `prefers-reduced-motion` fige le temps sur une image, toujours composée.
 *
 * Si WebGL manque à l'appel, la fonction sort sans rien faire et le dégradé
 * CSS posé sous le canvas reste visible. Personne ne voit une page cassée.
 */
(function () {
  "use strict";

  /* ---------- le shader ---------------------------------------------------
   *
   * Le sommet ne fait rien d'autre que couvrir l'écran de deux triangles :
   * tout le dessin se joue par pixel, dans le fragment.
   */
  var SOMMET = [
    "attribute vec2 position;",
    "void main() { gl_Position = vec4(position, 0.0, 1.0); }"
  ].join("\n");

  /* Le bruit est écrit à la main, et c'est volontaire : les implémentations
   * de simplex qui circulent sont du code d'autrui. Un bruit de valeur
   * interpolé suffit largement ici — on cherche des voiles, pas un terrain.
   *
   * `hache` : un pseudo-aléatoire reproductible à partir d'un point du plan.
   * `bruit` : ce même aléatoire, lissé entre les quatre coins d'une case,
   *           avec une courbe en S pour que les raccords ne se voient pas.
   * `nuees` : cinq octaves du précédent, chacune deux fois plus fine et deux
   *           fois moins forte — c'est ce qui donne la matière.
   */
  var FRAGMENT = [
    "precision mediump float;",
    "uniform vec2 u_taille;",
    "uniform float u_temps;",
    "uniform float u_intensite;",
    /* Le pointeur, en coordonnées d'écran (0-1), déjà lissé côté JavaScript.
       Au repos il vaut le centre : sur un téléphone, où rien ne survole, le
       ciel doit se tenir sans lui. */
    "uniform vec2 u_souris;",
    /* L'avancée dans la page, de 0 en haut à 1 en bas. Le soleil monte avec
       elle : descendre dans le carnet, c'est avancer dans le petit matin. */
    "uniform float u_defilement;",

    "float hache(vec2 p) {",
    "  return fract(sin(dot(p, vec2(41.317, 289.113))) * 43758.5453123);",
    "}",

    "float bruit(vec2 p) {",
    "  vec2 c = floor(p);",
    "  vec2 f = fract(p);",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",          // lissage en S
    "  float a = hache(c);",
    "  float b = hache(c + vec2(1.0, 0.0));",
    "  float d = hache(c + vec2(0.0, 1.0));",
    "  float e = hache(c + vec2(1.0, 1.0));",
    "  return mix(mix(a, b, u.x), mix(d, e, u.x), u.y);",
    "}",

    "float nuees(vec2 p) {",
    "  float v = 0.0;",
    "  float amplitude = 0.5;",
    "  for (int k = 0; k < 5; k++) {",
    "    v += amplitude * bruit(p);",
    "    p *= 2.03;",                                // jamais exactement 2 :
    "    amplitude *= 0.5;",                         // l'octave se calerait
    "  }",                                           // sur la précédente
    "  return v;",
    "}",

    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / u_taille;",
    "  float t = u_temps;",

    /* Le déplacement du voile. Deux vitesses opposées, et surtout un bruit
       qui sert d'entrée à un autre bruit : c'est cette mise en abîme qui
       produit des formes molles et jamais rectilignes. */
    "  vec2 p = vec2(uv.x * 2.4, uv.y * 1.5);",

    /* Le pointeur pousse le voile, il ne le suit pas. L'écart au centre est
       divisé par dix : au-delà, la matière se met à coller au curseur et l'on
       voit le truc au lieu de voir un ciel. Ce qu'on cherche est une présence,
       pas un pinceau. */
    "  vec2 pousse = (u_souris - 0.5) * vec2(0.22, 0.14);",
    "  float derive = nuees(p * 1.6 + vec2(-t * 0.055, t * 0.028) - pousse * 1.4);",
    "  float voile = nuees(p + vec2(t * 0.045, -t * 0.022) + derive * 0.85 - pousse);",

    /* Deux bandes horizontales lentes traversent le voile. Sans elles, la
       matière est homogène et l'on ne voit pas qu'elle bouge. */
    "  float bande = sin(uv.y * 3.1 - t * 0.17 + voile * 3.4) * 0.5 + 0.5;",
    /* L'exposant décide de tout : à 1.7 le voile couvrait tout le cadre et le
       ciel devenait un aplat mauve où les adresses se perdaient. À 2.4, les
       creux retombent dans le noir et il ne reste que des traînées — une
       aurore, pas un fond coloré. */
    "  float lumiere = pow(voile, 2.4) * (0.40 + bande * 0.60);",

    /* ---- 日の丸 — le disque du soleil levant -----------------------------
     *
     * 日本 se lit « origine du soleil ». Le motif n'est pas un ornement
     * japonisant plaqué sur un fond : c'est le nom du pays, et c'est ce que
     * le carnet regarde. Le voyage commence — le compte à rebours est juste
     * en dessous de ce ciel.
     *
     * Trois précautions pour que ce soit un lever de soleil et pas un
     * drapeau collé sur une image :
     *   · il est **décentré** — au milieu, l'œil lit le hinomaru et s'arrête ;
     *   · il est **bas, à moitié dans la brume**, donc en train de monter ;
     *   · les nuées **passent devant lui** et le voilent par moments. Un
     *     disque net et fixe serait un autocollant.
     *
     * Le repère est corrigé du rapport de l'écran, sinon le soleil devient
     * une ellipse dès que le cadre n'est pas carré — et le plein écran d'un
     * téléphone est deux fois plus haut que large.
     */
    "  float ratio = u_taille.x / max(u_taille.y, 1.0);",
    "  vec2 q = vec2(uv.x * ratio, uv.y);",
    /* Le soleil monte de douze pour cent de la hauteur entre le haut et le bas
       de la page, et dérive à peine avec le pointeur. Douze pour cent, c'est
       assez pour qu'on le remarque en revenant en haut, trop peu pour qu'on
       croie à un objet qu'on manipule : il se lève, on ne le lève pas. */
    "  vec2 astre = vec2((0.63 + (u_souris.x - 0.5) * 0.035) * ratio,",
    "                    -0.055 + u_defilement * 0.46);",
    "  float rayon = 0.108;",
    "  float d = distance(q, astre);",

    /* Le bord du disque est franc — c'est ce qui fait un soleil et non une
       tache lumineuse —, mais pas coupé au rasoir : un demi-pour-cent de
       fondu suffit à éviter l'escalier de pixels. */
    "  float disque = 1.0 - smoothstep(rayon * 0.975, rayon * 1.01, d);",

    /* La brume au ras de l'horizon mange le bas du disque : le soleil sort
       de terre au lieu d'être posé dessus. */
    "  disque *= smoothstep(0.012, 0.075, uv.y);",
    /* Et les nuées le voilent quand elles passent — jamais complètement. */
    "  disque *= 0.62 + 0.38 * (1.0 - clamp(voile * 1.5, 0.0, 1.0));",

    /* Le halo, qui décroît vite : c'est lui qui teinte l'aurore d'orange près
       de l'horizon et la laisse à l'indigo en montant. */
    "  float halo = exp(-max(d - rayon, 0.0) * 6.2);",
    /* La colonne de lumière au-dessus du disque, resserrée en largeur et
       étirée en hauteur — le reflet qui ancre l'astre dans le ciel. */
    "  float colonne = exp(-abs(q.x - astre.x) * 13.0)",
    "                * exp(-max(uv.y - astre.y, 0.0) * 3.4) * 0.5;",
    "  halo = clamp(halo + colonne * (0.55 + lumiere * 0.7), 0.0, 1.0);",

    /* La palette. Trois teintes seulement, celles du carnet : l'indigo des
       noren, un violet de transition, le vermillon du sceau. L'aurore ne
       présente aucune couleur nouvelle — elle anime celles qui existent. */
    "  vec3 nuit     = vec3(0.030, 0.036, 0.078);",
    "  vec3 indigo   = vec3(0.085, 0.130, 0.305);",
    "  vec3 violet   = vec3(0.235, 0.140, 0.330);",
    "  vec3 braise   = vec3(0.680, 0.255, 0.120);",
    /* Le cœur du disque, et le seul endroit chaud du carnet. Pas blanc : un
       soleil blanc est un soleil de midi, et l'on veut l'instant où il passe
       l'horizon. Pas le rouge exact du drapeau non plus — à cette échelle il
       noircit ; celui-ci est le même, remonté en clarté. */
    "  vec3 astral   = vec3(0.960, 0.430, 0.215);",

    /* La composition verticale : la chaleur ne monte jamais haut, elle reste
       au ras de l'horizon. L'exposant 4.2 l'y tient — à 2.6 elle remontait
       jusqu'au milieu du cadre et rosissait tout le ciel. */
    "  float bas = pow(1.0 - uv.y, 4.2);",
    "  vec3 c = mix(nuit, indigo, clamp(lumiere * 1.70, 0.0, 1.0));",
    "  c = mix(c, violet, clamp(lumiere * lumiere * 1.05, 0.0, 0.48));",
    "  c = mix(c, braise, clamp(bas * (0.16 + lumiere * 0.34), 0.0, 0.44));",

    /* La lumière du soleil se pose sur le ciel avant le soleil lui-même : le
       halo d'abord, le disque par-dessus. L'ordre compte — l'inverse donnerait
       un disque noyé dans sa propre lueur. */
    "  c = mix(c, braise, clamp(halo * (0.62 + lumiere * 0.55), 0.0, 0.88));",
    "  c = mix(c, astral, clamp(disque, 0.0, 0.94));",
    /* Un disque d'une seule teinte reste une pastille. Le cœur chauffe vers
       le haut — côté ciel, pas côté horizon —, et c'est ce déséquilibre qui
       le fait lire comme un astre en train de monter. */
    "  float coeur = 1.0 - smoothstep(0.0, rayon, d);",
    "  float versLeHaut = clamp((q.y - astre.y) / rayon * 0.5 + 0.6, 0.0, 1.0);",
    "  c += astral * disque * pow(coeur, 2.2) * versLeHaut * 0.30;",

    /* Le grain. Sur un téléphone, un dégradé aussi sombre se casse en bandes
       visibles ; un bruit d'un demi-pour-cent les efface complètement. */
    "  float grain = hache(gl_FragCoord.xy * 0.7 + t) - 0.5;",
    "  c += grain * 0.022;",

    /* Le ciel s'apaise à mesure qu'on descend, et ce n'est pas un effet : en
       haut il n'y a que la constellation, plus bas il y a du texte à lire.
       Un soleil à pleine puissance derrière « Rien de gardé pour l'instant »
       rend la phrase illisible. Le carnet se lit d'abord, il impressionne
       ensuite — et le petit jour qui monte pendant qu'on avance dans la page
       raconte exactement la même chose. */
    "  c *= 1.0 - u_defilement * 0.26;",
    "  gl_FragColor = vec4(c * u_intensite, 1.0);",
    "}"
  ].join("\n");

  function compiler(gl, type, source) {
    var s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      if (window.console) { console.warn("aurore :", gl.getShaderInfoLog(s)); }
      return null;
    }
    return s;
  }

  /* Pose une aurore dans l'élément donné. Renvoie une commande d'arrêt, ou
     `null` si la machine ne sait pas la dessiner — auquel cas le dégradé CSS
     de l'élément reste en place et fait très bien l'affaire. */
  function poser(hote, options) {
    if (!hote) { return null; }
    options = options || {};

    var toile = document.createElement("canvas");
    toile.className = "aurore";
    toile.setAttribute("aria-hidden", "true");
    hote.insertBefore(toile, hote.firstChild);

    var gl = null;
    try {
      gl = toile.getContext("webgl", { alpha: false, antialias: false,
                                       depth: false, stencil: false,
                                       powerPreference: "low-power" })
        || toile.getContext("experimental-webgl");
    } catch (e) { gl = null; }
    if (!gl) { toile.remove(); return null; }

    var vs = compiler(gl, gl.VERTEX_SHADER, SOMMET);
    var fs = compiler(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vs || !fs) { toile.remove(); return null; }

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { toile.remove(); return null; }
    gl.useProgram(prog);

    // Deux triangles qui couvrent l'écran, posés une fois pour toutes.
    var tampon = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tampon);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, "position");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var uTaille = gl.getUniformLocation(prog, "u_taille");
    var uTemps = gl.getUniformLocation(prog, "u_temps");
    var uIntensite = gl.getUniformLocation(prog, "u_intensite");
    var uSouris = gl.getUniformLocation(prog, "u_souris");
    var uDefilement = gl.getUniformLocation(prog, "u_defilement");
    gl.uniform1f(uIntensite, options.intensite == null ? 1 : options.intensite);

    /* ---------- ce que la main commande ------------------------------------
     *
     * Deux valeurs visées, deux valeurs affichées, et un rattrapage de 6 %
     * par image entre les deux. Sans ce retard, le ciel colle au curseur et
     * saute à chaque cran de molette — on voit la mécanique. Avec, il suit
     * comme une masse suit : en retard, et c'est ce retard qui le rend vivant.
     *
     * Rien de tout cela n'est nécessaire au carnet : un doigt ne survole pas,
     * et sur un téléphone la souris reste au centre toute sa vie. C'est la
     * raison pour laquelle le repos est le centre, et pas un coin.
     */
    var visee = { x: 0.5, y: 0.5, defile: 0 };
    var montre = { x: 0.5, y: 0.5, defile: 0 };

    function surPointeur(ev) {
      var r = hote.getBoundingClientRect();
      if (!r.width || !r.height) { return; }
      visee.x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      visee.y = Math.min(1, Math.max(0, 1 - (ev.clientY - r.top) / r.height));
    }
    /* Le pointeur s'écoute sur la fenêtre, pas sur le canvas : l'aurore est
       derrière tout le contenu et ne reçoit aucun événement — elle porte
       `pointer-events: none`, sans quoi elle avalerait les clics des boutons
       posés dessus. */
    window.addEventListener("pointermove", surPointeur, { passive: true });

    /* Le carnet a quatre panneaux, chacun avec sa zone qui défile, et un seul
       ciel derrière tous. On les écoute toutes : celle qui bouge est celle
       qu'on regarde, et c'est elle qui commande la hauteur du soleil. */
    var zones = options.defile || [];
    if (zones && !zones.length && zones.scrollHeight != null) { zones = [zones]; }
    zones = [].slice.call(zones);

    function surDefilement(ev) {
      var z = ev && ev.currentTarget ? ev.currentTarget : zones[0];
      if (!z) { return; }
      var h = z.scrollHeight - z.clientHeight;
      visee.defile = h > 40 ? Math.min(1, z.scrollTop / h) : 0;
    }
    zones.forEach(function (z) {
      z.addEventListener("scroll", surDefilement, { passive: true });
    });

    function redimensionner() {
      // 1,5 suffit : au-delà, on paie trois fois les pixels d'un dégradé.
      var d = Math.min(window.devicePixelRatio || 1, 1.5);
      var l = Math.max(1, Math.round(hote.clientWidth * d));
      var h = Math.max(1, Math.round(hote.clientHeight * d));
      if (toile.width === l && toile.height === h) { return; }
      toile.width = l; toile.height = h;
      gl.viewport(0, 0, l, h);
      gl.uniform2f(uTaille, l, h);
    }

    var sobre = window.matchMedia &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var debut = performance.now();
    var derniere = 0;
    var image = 0;
    var visible = true;
    var vivant = true;

    function dessiner(maintenant) {
      if (!vivant) { return; }
      image = requestAnimationFrame(dessiner);
      if (!visible) { return; }
      // 30 images par seconde : la moitié du travail, aucune différence à
      // l'œil sur des voiles qui mettent trente secondes à traverser.
      if (maintenant - derniere < 33) { return; }
      derniere = maintenant;
      redimensionner();
      // Le rattrapage. 0,06 par image à 30 images/seconde : un peu moins
      // d'une seconde pour rejoindre une cible, ce qui se lit comme de
      // l'inertie et non comme de la latence.
      montre.x += (visee.x - montre.x) * 0.06;
      montre.y += (visee.y - montre.y) * 0.06;
      montre.defile += (visee.defile - montre.defile) * 0.06;
      gl.uniform1f(uTemps, (maintenant - debut) / 1000);
      gl.uniform2f(uSouris, montre.x, montre.y);
      gl.uniform1f(uDefilement, montre.defile);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    if (sobre) {
      /* Une seule image, prise à un instant choisi pour être composée — et
         sans réponse au pointeur ni au défilement : quelqu'un qui demande
         moins de mouvement ne veut pas d'un fond qui bouge quand il lit. */
      redimensionner();
      gl.uniform1f(uTemps, 18);
      gl.uniform2f(uSouris, 0.5, 0.5);
      gl.uniform1f(uDefilement, 0.35);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      image = requestAnimationFrame(dessiner);
    }

    /* On ne dessine que ce qui est regardé. Deux causes d'arrêt : le ciel qui
       sort de l'écran quand on descend dans la page, et l'onglet qu'on quitte.
       Sans cela, le shader tourne pendant qu'on lit une fiche trois écrans
       plus bas — et la batterie s'en aperçoit avant l'utilisateur. */
    var guetteur = null;
    if (!sobre && window.IntersectionObserver) {
      guetteur = new IntersectionObserver(function (entrees) {
        visible = entrees[0].isIntersecting;
      }, { threshold: 0.01 });
      guetteur.observe(hote);
    }
    function surVisibilite() { visible = !document.hidden; }
    if (!sobre) { document.addEventListener("visibilitychange", surVisibilite); }

    return function arreter() {
      vivant = false;
      cancelAnimationFrame(image);
      if (guetteur) { guetteur.disconnect(); }
      document.removeEventListener("visibilitychange", surVisibilite);
      window.removeEventListener("pointermove", surPointeur);
      zones.forEach(function (z) { z.removeEventListener("scroll", surDefilement); });
      toile.remove();
    };
  }

  window.Aurore = { poser: poser };
})();
