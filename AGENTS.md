# AGENTS.md

## Règle n°1 — on n'exécute rien

Dans ce dépôt, **on écrit du code, on ne lance pas de programmes**.

- Pas de `npm run dev`, `npm run build`, `node …`, `pnpm …`, pas de script de test.
- Pas de benchmark, pas de mesure, pas de simulation lancée « pour voir ».
- Pas de serveur, pas de navigateur headless, pas de capture d'écran.
- L'exécution et la vérification sont la responsabilité de l'utilisateur.

## Règle n°2 — pas de calculs longs

- Aucune commande dont la durée est inconnue, ou supérieure à quelques secondes.
- Si une valeur n'est pas connue ou calculable trivialement, on écrit qu'elle est inconnue.
  On ne lance pas une mesure qui prendrait des minutes ou des heures.
- Un chiffre affiché dans le code doit être exact et sourcé, ou clairement étiqueté
  comme estimation.

## Règle n°3 — en cas de doute

On demande à l'utilisateur. On ne lance rien « en attendant ».
