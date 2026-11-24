[English](signature-2.md) · **Français**

> **Remplacé.** `Signature 2` est réécrite comme un tri passe par passe dont la
> sortie est censée être un `graph6` canonique, avec un journal sous le graphe.
> Seule la passe 1 existe aujourd'hui. Le texte ci-dessous décrit la version
> précédente, multi-passes ; il sera réécrit quand la nouvelle sera complète.

# Signature 2 — le raffinement de couleurs, une passe à la fois

`Signature 2` est le second panneau de signature de la page. Il répond à la même
question que le premier — *à quoi ressemble ce coloriage, indépendamment de la
façon dont les sommets se trouvent numérotés ?* — mais par une route
complètement différente : **une signature construite une passe à la fois, sans
rien déplier.**

La première signature déplie l'arbre de voisinage jusqu'à ce que chaque sommet
soit distingué, et retombe sur un budget de 30 000 nœuds quand ça n'arrive
jamais. Sur un graphe symétrique, ça n'arrive jamais : `K18` tout rouge dépense
tout le budget et abandonne. `Signature 2` ne déplie jamais, donc elle n'explose
jamais — et, en échange, il lui arrive de s'arrêter tôt, en le disant.

---

## L'idée

> Une passe transforme la partition courante des sommets en une partition plus
> fine. Le résultat d'une passe ne dépend que de la **forme** du graphe rouge :
> deux graphes identiques à un réétiquetage près produisent exactement la même
> passe, donc exactement la même signature.

C'est tout le contrat. Il a deux moitiés, et il faut les garder séparées quand on
teste :

| propriété | énoncé | un échec signifie |
|---|---|---|
| **invariance** | graphes isomorphes → signature identique | un **bug** : la signature dépend de l'étiquetage |
| **complétude** | signature identique → graphes isomorphes | **attendu** : le plafond connu du raffinement de couleurs |

`Signature 2` garantit la première. Elle vise la seconde et ne peut pas toujours
l'atteindre (voir [Le plafond](#le-plafond)).

---

## L'état

L'état de travail est **un entier par sommet** : son *numéro de classe*.

```
sommet    A  B  C  D  E  F  G  H  I
classe    0  0  0  0  0  0  0  0  0      ← K9 tout rouge
```

Rien d'autre n'est conservé. Pas d'arbre, pas de pile, pas de budget. Deux
sommets dans la même classe sont, pour autant que l'algorithme sache, impossibles
à distinguer.

Les numéros de classe sont toujours en **ordre canonique** : ils sont renumérotés
à chaque passe par un ordre qui ne compare que des numéros de classe, jamais les
étiquettes `A…R`. C'est ce qui rend l'enregistrement *label-free*.

---

## Passe 0

La classe initiale est le **degré rouge**, plus haut degré en premier.

```
degrés rouges 8 8 8 8 8 8 8 8 8   →  une classe : [9]
degrés rouges 1 2 2 2 2 2 2 2 1   →  deux classes : [7, 2]
```

Deux sommets de degrés différents ne peuvent jamais être échangés par un
isomorphisme : cette séparation est gratuite et déjà correcte.

---

## Une passe

Pour chaque sommet `v` :

1. `rest(v)` = les numéros de classe de ses voisins rouges, triés par ordre
   croissant ;
2. `key(v)` = `(classe(v), rest(v))` — un petit tableau.

Puis :

3. trier les sommets par `key`, les égalités étant départagées par l'indice du
   sommet (cet ordre ne touche qu'à l'ordre *à l'intérieur* d'une classe, jamais à
   l'ordre des classes) ;
4. chaque plage maximale de clés égales devient une classe ;
5. renuméroter les classes `0, 1, 2, …` dans l'ordre du tri des clés.

Autrement dit : deux sommets restent ensemble exactement tant qu'ils avaient la
même classe **et** le même multiensemble de numéros de classe parmi leurs
voisins.

### Pourquoi ça ne peut que séparer — et jamais réordonner

Chaque nouvelle classe est un sous-ensemble d'une ancienne, donc la partition ne
peut que s'affiner. Elle ne peut jamais fusionner deux sommets qu'une passe
précédente avait séparés. C'est cette monotonie qui rend la règle d'arrêt
ci-dessous rigoureuse.

Il y a une seconde propriété, plus forte : **l'ordre est conservé**. La clé d'une
passe commence par le numéro de classe courant du sommet, donc tous les enfants
d'une classe `c` se trient de façon contiguë, à l'intérieur du créneau de la
classe `c`, et ne peuvent jamais atterrir de l'autre côté d'une classe voisine.
D'où :

> si `x` se trie avant `y` à la passe `k`, alors `x` se trie avant `y` à toutes
> les passes suivantes.

Le raffinement est donc une **subdivision sur place** de la liste ordonnée, pas un
nouveau tri :

```
passe 1   F < B = C = D < A = E
passe 2   F < (B C D raffinés) < (A E raffinés)
passe 3   F < ...              < ...
```

Deux conséquences :

- **un sommet scellé est terminé.** Une classe de taille 1 ne peut plus se scinder,
  donc son sommet n'a plus jamais besoin d'être raffiné. Il ne reste dans l'état
  que comme *valeur* : le numéro de classe que lisent ses voisins.
- **seuls les blocs encore liés demandent du travail.** Une passe n'a à raffiner
  que les blocs de taille ≥ 2.

La première classe est un cas à part : rien ne peut jamais s'insérer devant elle.
Si elle est un singleton à la passe 1, son sommet est premier pour de bon — son
label final `A` est connu dès la passe 1.

Une mise en garde sur les labels. La propriété fige l'**ordre**, pas les
**numéros de position**. Si un bloc *devant* un sommet scellé se scinde, tout ce
qui le suit glisse. Dans `C4 ∪ P4 ∪ {isolé}`, le sommet isolé est dernier à la
passe 1 et le reste à la fin, mais son label passe de `C` à `D` quand `[6, 2, 1]`
devient `[4, 2, 2, 1]`. Son ordre est définitif, sa lettre non — seule la
classe `0` a les deux.

Une implémentation qui veut des noms stables peut donc numéroter les classes par
leur **chemin de scission** (`0`, `2`, `2.0`, `2.1`) plutôt que par leur rang : le
label d'un sommet scellé est alors fixé pour de bon, et la position devient une
valeur calculée à l'affichage.

---

## Quand ça s'arrête

La boucle s'arrête dès qu'une passe laisse la partition **inchangée** :

> si une passe ne sépare rien, aucune passe ultérieure ne le fera.

Ce n'est pas une heuristique. La passe est une fonction déterministe de la
partition, la partition ne peut que s'affiner, et il n'existe qu'un nombre fini
de partitions de `n` sommets. Une passe qui ne change rien est donc un **point
fixe**, et il est définitif. L'enregistrement le dit avec `"split": false`.

À ce moment-là la partition est dite **équitable** : à l'intérieur d'une classe,
tous les membres ont le même nombre de voisins dans chaque classe. Il ne reste
plus rien à voir pour le raffinement.

Si la partition atteint `n` classes — un sommet par classe — elle est **discrète** :
le raffinement a distingué chaque sommet.

---

## L'enregistrement

Le panneau affiche un seul document JSON :

```json
{
  "stable": true,
  "passes": [
    {
      "pass": 0,
      "classes": [
        { "size": 7, "views": [{ "count": 5, "neighbours": [0, 0] },
                               { "count": 2, "neighbours": [0, 1] }] },
        { "size": 2, "views": [{ "count": 2, "neighbours": [0] }] }
      ]
    },
    {
      "pass": 4,
      "classes": [
        { "size": 1, "views": [{ "count": 1, "neighbours": [1, 1] }] },
        { "size": 2, "views": [{ "count": 2, "neighbours": [0, 2] }] },
        { "size": 2, "views": [{ "count": 2, "neighbours": [1, 3] }] },
        { "size": 2, "views": [{ "count": 2, "neighbours": [2, 4] }] },
        { "size": 2, "views": [{ "count": 2, "neighbours": [3] }] }
      ],
      "split": false
    }
  ]
}
```

### Les champs

| champ | où | signification |
|---|---|---|
| `stable` | racine | `true` quand la dernière passe n'a rien changé — le point fixe est atteint |
| `passes` | racine | la passe `0` (les degrés), puis une entrée par passe de raffinement |
| `pass` | passe | le numéro de la passe ; `0` est la séparation initiale par degré rouge |
| `classes` | passe | la partition à la fin de cette passe, dans l'ordre canonique des classes |
| `size` | classe | combien de sommets la classe contient |
| `views` | classe | les situations de voisinage distinctes à l'intérieur de la classe |
| `count` | vue | combien de membres de la classe ont cette situation |
| `neighbours` | vue | les numéros de classe triés des voisins rouges d'un tel membre |
| `split` | passe | absent sur la passe `0` ; `true` si cette passe a séparé quelque chose |

### Comment lire les `views`

Une `vue` est ce que voit un membre de la classe, exprimé en numéros de classe.
Sa longueur est le **degré** : `[1, 1]` est un sommet de degré 2 dont les deux
voisins sont dans la classe 1 ; `[3]` est un sommet de degré 1 dont l'unique
voisin siège dans la classe 3.

Les `views` d'une classe sont exactement l'information que consomme la passe
**suivante** :

- **une seule vue** → tous les membres ont la même situation de voisinage, la
  classe ne peut plus se séparer ;
- **plusieurs vues** → la classe se séparera à la passe suivante, une
  sous-classe par vue.

Donc `"split": false` est exactement la même affirmation que *« chaque classe de
cette passe n'a qu'une seule vue »*. Les vues sont enregistrées à chaque passe
parce qu'elles portent plus que les tailles : deux graphes peuvent avoir les
mêmes tailles de classe passe après passe et relier ces classes différemment.

Le champ `count` est aussi un détecteur de symétrie : `{"count": 9, ...}` dans une
classe de `size: 9` dit que les neuf membres sont dans la même situation.

---

## Exemples travaillés

### `K9` tout rouge — une classe, une passe

```json
{ "stable": true,
  "passes": [
    { "pass": 0, "classes": [ { "size": 9, "views": [ { "count": 9, "neighbours": [0,0,0,0,0,0,0,0] } ] } ] },
    { "pass": 1, "split": false, "classes": [ { "size": 9, "views": [ { "count": 9, "neighbours": [0,0,0,0,0,0,0,0] } ] } ] } ] }
```

Une classe, neuf sommets, chacun avec huit voisins — tous dans la classe 0. La
passe 1 produit la même chose, donc la partition est équitable et la boucle
s'arrête.

Lecture : **chaque sommet ressemble exactement à tous les autres ; le raffinement
ne les distinguera jamais.** C'est un résultat, pas un échec.

### `P9`, le chemin à neuf sommets — quatre passes

```
passe 0   [7, 2]        degrés 2 et 1
passe 1   [5, 2, 2]     les extrémités se séparent, puis leurs voisins
passe 2   [3, 2, 2, 2]
passe 3   [1, 2, 2, 2, 2]   le sommet du milieu est seul
passe 4   [1, 2, 2, 2, 2]   split: false → point fixe
```

Chaque passe pèle une couche. Les tailles sont montrées pour l'intuition ;
l'enregistrement porte les vues complètes, qui sont ce qui déclenche réellement
la séparation.

---

## Le plafond

Le raffinement de couleurs, c'est l'algorithme **Weisfeiler–Leman de dimension
1**. Ses limites sont connues et ne sont pas un défaut de ce panneau :

- tout graphe `d`-régulier se ressemble depuis chacun de ses sommets, donc le
  raffinement s'achève sur une classe unique et ne dit rien de plus ;
- les plus petits contre-exemples sont `C6` contre `2×C3` (2-réguliers) et `K3,3`
  contre le prisme triangulaire (3-réguliers), tous à six sommets ;
- à une arête de la régularité, `K3,3 − e` et `prisme − e` se confondent aussi :
  ils partagent le quotient `A(2) ↔ B(4)`, et le raffinement ne voit pas si les
  deux voisins `B` d'un sommet `A` sont opposés ou adjacents dans le `C4` induit.
  Leurs compléments forment une quatrième paire ;
- en conséquence, `Signature 2` sépare tous les graphes d'ordre ≤ 5 et se
  confond exactement quatre fois à l'ordre 6 — 156 classes d'isomorphisme,
  152 signatures. C'est ce que mesure la suite de tests, paire par paire.

`Signature 2` ne produit pas non plus d'**étiquetage canonique** : quand la
partition s'achève sur une classe unique, il n'y a aucun ordre à en tirer. Donner
un ordre canonique dans ce cas demande l'*individualisation* — fixer un sommet,
raffiner à nouveau, récurser, et garder le certificat lexicographiquement
meilleur — c'est ce que font nauty, traces et bliss, avec l'élagage par
automorphismes pour garder l'arbre de recherche petit.

Entre les deux extrêmes, `Signature 2` est le juste milieu honnête : elle ne ment
jamais, elle ne tombe jamais en panne de budget, et elle dit exactement jusqu'où
le raffinement est allé.

---

## Coût

Par passe : lire les voisins, trier leurs numéros de classe, trier `n` clés —
`O(n + m log deg)` avec `m` le nombre d'arêtes rouges. Le nombre de passes est au
plus `n`, et en pratique une poignée : la partition s'affine strictement à chaque
passe non finale, donc il peut y en avoir au plus `n − 1`.

Sur 18 sommets, c'est de l'ordre de la microseconde, et rien dans l'algorithme ne
peut grossir : l'état, c'est `n` entiers.

---

## Ce que ça ne donne pas

- **aucune correspondance de sommets** — deux sommets globalement symétriques
  restent ensemble, par définition ;
- **aucun ordre canonique** dans les cas ambigus ;
- **aucune garantie de complétude** — `C6` et `2×C3` partagent une signature, et
  c'est le cas de toutes les paires de graphes `d`-réguliers ;
- **aucune information de cycle** — le `ll` (longueur de boucle) de la première
  signature n'a pas d'équivalent ici, puisqu'il n'y a pas d'arbre où boucler.
  L'information qu'il portait — *cette arête revient sur un ancêtre* — est déjà
  impliquée par le fait qu'un voisin siège dans la classe d'un ancêtre.
