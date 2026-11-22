/**
 * Une solution de référence du 6 x 4, décodée de l'illustration Wikipédia
 * (« MacMahon Squares », fichier MacMahon_Squares_solution.png).
 *
 * L'original a un pourtour bleu ; on a permuté les couleurs pour que le
 * pourtour soit rouge, comme dans l'énoncé. Chaque quadruplet est (N, E, S, W)
 * avec 0 = rouge, 1 = blanc, 2 = bleu.
 */
export const REFERENCE_GRID: readonly (readonly number[])[] = [
    [0, 1, 1, 0], [0, 1, 2, 1], [0, 2, 1, 1], [0, 0, 2, 2], [0, 0, 0, 0], [0, 0, 1, 0],
    [1, 1, 2, 0], [2, 1, 1, 1], [1, 2, 2, 1], [2, 2, 2, 2], [0, 0, 0, 2], [1, 0, 1, 0],
    [2, 1, 2, 0], [1, 1, 1, 1], [2, 1, 2, 1], [2, 2, 2, 1], [0, 2, 0, 2], [1, 0, 2, 2],
    [2, 1, 0, 0], [1, 1, 0, 1], [2, 2, 0, 1], [2, 2, 0, 2], [0, 1, 0, 2], [2, 0, 0, 1],
];
