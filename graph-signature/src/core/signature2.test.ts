import { describe, expect, it } from "vitest";
import { computeSignature2 } from "./signature2.ts";
import { computeSignature } from "./signature.ts";

type Matrix = boolean[][];

/*
 * What these tests are about
 * --------------------------
 * Two different properties, which must not be confused:
 *
 * (A) invariance  — isomorphic graphs give the same signature. A failure here
 *     is a bug: the signature depends on the labelling.
 * (B) completeness — same signature implies isomorphic. A failure here is
 *     expected: it is the known ceiling of colour refinement, and the point of
 *     the census is to measure it.
 *
 * The labelled-graph enumeration below tests both at once: every labelling of
 * every graph of order n is fed in, so an invariance bug would show up as far
 * more distinct signatures than isomorphism classes, and a completeness failure
 * as fewer.
 */

// ---------------------------------------------------------------- builders ---

function emptyGraph(n: number): Matrix {
    return Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
}

function addEdges(matrix: Matrix, edges: ReadonlyArray<readonly number[]>): Matrix {
    for (const [a, b] of edges) {
        matrix[a][b] = true;
        matrix[b][a] = true;
    }
    return matrix;
}

function path(n: number): Matrix {
    const edges: Array<[number, number]> = [];
    for (let i = 0; i + 1 < n; i++) edges.push([i, i + 1]);
    return addEdges(emptyGraph(n), edges);
}

function cycle(n: number): Matrix {
    return addEdges(path(n), [[n - 1, 0]]);
}

function complete(n: number): Matrix {
    const edges: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push([i, j]);
    return addEdges(emptyGraph(n), edges);
}

function completeBipartite(a: number, b: number): Matrix {
    const edges: Array<[number, number]> = [];
    for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) edges.push([i, a + j]);
    return addEdges(emptyGraph(a + b), edges);
}

function disjoint(...blocks: readonly Matrix[]): Matrix {
    const matrix = emptyGraph(blocks.reduce((sum, block) => sum + block.length, 0));
    let offset = 0;
    for (const block of blocks) {
        for (let i = 0; i < block.length; i++) {
            for (let j = 0; j < block.length; j++) {
                if (block[i][j]) matrix[offset + i][offset + j] = true;
            }
        }
        offset += block.length;
    }
    return matrix;
}

/** The triangular prism, C3 □ K2 — 3-regular on 6 vertices. */
function prism(): Matrix {
    return addEdges(emptyGraph(6), [
        [0, 1],
        [1, 2],
        [2, 0],
        [3, 4],
        [4, 5],
        [5, 3],
        [0, 3],
        [1, 4],
        [2, 5],
    ]);
}

function minusEdge(matrix: Matrix, a: number, b: number): Matrix {
    const out = matrix.map((row) => [...row]);
    out[a][b] = false;
    out[b][a] = false;
    return out;
}

function complement(matrix: Matrix): Matrix {
    const n = matrix.length;
    const out = emptyGraph(n);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) if (i !== j && !matrix[i][j]) out[i][j] = true;
    }
    return out;
}

// ---------------------------------------------------------------- helpers ---

function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function randomGraph(n: number, seed: number): Matrix {
    const random = mulberry32(seed);
    const matrix = emptyGraph(n);
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (random() < 0.5) {
                matrix[i][j] = true;
                matrix[j][i] = true;
            }
        }
    }
    return matrix;
}

function shuffle(n: number, random: () => number): number[] {
    const permutation = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const swap = permutation[i];
        permutation[i] = permutation[j];
        permutation[j] = swap;
    }
    return permutation;
}

/** Rewrites the graph so that vertex `i` becomes vertex `permutation[i]`. */
function permute(matrix: Matrix, permutation: readonly number[]): Matrix {
    const out = emptyGraph(matrix.length);
    for (let i = 0; i < matrix.length; i++) {
        for (let j = 0; j < matrix.length; j++) {
            if (matrix[i][j]) out[permutation[i]][permutation[j]] = true;
        }
    }
    return out;
}

/** The whole observable result: `passes` only, `vector` is *not* invariant. */
function key(matrix: Matrix): string {
    return JSON.stringify(computeSignature2(matrix).passes);
}

function* labelledGraphs(n: number): Generator<Matrix> {
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);

    const total = 1 << pairs.length;
    for (let mask = 0; mask < total; mask++) {
        const matrix = emptyGraph(n);
        for (let bit = 0; bit < pairs.length; bit++) {
            if (mask & (1 << bit)) {
                const [a, b] = pairs[bit];
                matrix[a][b] = true;
                matrix[b][a] = true;
            }
        }
        yield matrix;
    }
}

function distinctSignatures(n: number): number {
    const seen = new Set<string>();
    for (const matrix of labelledGraphs(n)) seen.add(key(matrix));
    return seen.size;
}

/**
 * The four pairs of non-isomorphic 6-vertex graphs that colour refinement
 * cannot separate. Together they are the whole gap between the 156 isomorphism
 * classes and the 152 distinct signatures.
 *
 * The first two are the regular ones. The last two are the same phenomenon one
 * edge away from regularity: `K3,3 − e` and `prism − e` share the quotient
 * A(2) ↔ B(4), where each A vertex has two neighbours in B and each B vertex
 * has one neighbour in A and two in B. The refinement counts neighbours per
 * class and cannot see *which* ones: in one graph the two B-neighbours of an A
 * vertex are opposite in the induced C4, in the other they are adjacent.
 */
const collidingPairs: Array<[string, Matrix, Matrix]> = [
    ["C6 and two triangles", cycle(6), disjoint(complete(3), complete(3))],
    ["K3,3 and the prism", completeBipartite(3, 3), prism()],
    [
        "K3,3 minus an edge and the prism minus an edge",
        minusEdge(completeBipartite(3, 3), 0, 3),
        minusEdge(prism(), 0, 3),
    ],
    [
        "the complements of those two",
        complement(minusEdge(completeBipartite(3, 3), 0, 3)),
        complement(minusEdge(prism(), 0, 3)),
    ],
];

// ------------------------------------------------------------------ tests ---

describe("enumeration of every labelled graph", () => {
    /*
     * Expected values are the number of graphs up to isomorphism
     * (OEIS A000088): 4, 11, 34, 156 for n = 3, 4, 5, 6.
     *
     * If the signature were label-dependent, every labelling would produce its
     * own key and these numbers would explode. If it collided more than the
     * four known pairs, the n = 6 value would drop below 152.
     */
    it("separates every graph of order 3, 4 and 5", () => {
        expect(distinctSignatures(3)).toBe(4);
        expect(distinctSignatures(4)).toBe(11);
        expect(distinctSignatures(5)).toBe(34);
    });

    it("collides exactly four times at order 6", () => {
        // 156 isomorphism classes, minus the four merging pairs spelled out below.
        expect(distinctSignatures(6)).toBe(152);
    });

    it("accounts for the whole gap with those four pairs", () => {
        const keys = collidingPairs.map(([, a, b]) => {
            expect(key(a)).toBe(key(b));
            return key(a);
        });

        // Four separate merges, not one big pile.
        expect(new Set(keys).size).toBe(collidingPairs.length);
    });
});

describe("invariance under relabelling", () => {
    const shapes: Array<[string, Matrix]> = [
        ["the path P7", path(7)],
        ["the cycle C8", cycle(8)],
        ["the prism", prism()],
        ["K3,3", completeBipartite(3, 3)],
        ["two triangles", disjoint(complete(3), complete(3))],
        ["a random graph on 12 vertices", randomGraph(12, 1)],
        ["a random graph on 16 vertices", randomGraph(16, 2)],
    ];

    for (const [name, matrix] of shapes) {
        it(`does not change for ${name}`, () => {
            const expected = key(matrix);
            const random = mulberry32(2024);
            for (let round = 0; round < 64; round++) {
                const permutation = shuffle(matrix.length, random);
                expect(key(permute(matrix, permutation))).toBe(expected);
            }
        });
    }
});

describe("the known limits, as a positive control", () => {
    for (const [name, a, b] of collidingPairs) {
        it(`cannot tell apart ${name}`, () => {
            expect(key(a)).toBe(key(b));
        });
    }

    it("still separates graphs that are not locally identical", () => {
        expect(key(cycle(6))).not.toBe(key(path(6)));
        expect(key(complete(9))).not.toBe(key(emptyGraph(9)));
        expect(key(path(5))).not.toBe(key(cycle(5)));
    });

    it("complement maps the first pair onto the second", () => {
        expect(key(complement(cycle(6)))).toBe(key(prism()));
        expect(key(complement(disjoint(complete(3), complete(3))))).toBe(
            key(completeBipartite(3, 3)),
        );
    });
});

describe("the shape of the record", () => {
    it("reduces K9 to one class in one pass", () => {
        const result = computeSignature2(complete(9));

        expect(result.classes).toHaveLength(1);
        expect(result.stable).toBe(true);
        expect(result.passes).toHaveLength(2);

        const settled = result.passes[1];
        expect(settled.split).toBe(false);
        expect(settled.classes).toHaveLength(1);
        expect(settled.classes[0].size).toBe(9);
        expect(settled.classes[0].views).toHaveLength(1);
        expect(settled.classes[0].views[0].count).toBe(9);
        expect(settled.classes[0].views[0].neighbours).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it("peels P9 in four passes", () => {
        const result = computeSignature2(path(9));

        expect(result.classes).toHaveLength(5);
        expect(result.passes).toHaveLength(5);
        expect(result.passes[4].split).toBe(false);
        expect(result.passes[4].classes.map((cls) => cls.size)).toEqual([1, 2, 2, 2, 2]);
    });

    it("keeps the views consistent with the class sizes", () => {
        const shapes = [
            path(6),
            cycle(7),
            prism(),
            complete(5),
            emptyGraph(5),
            randomGraph(10, 3),
        ];

        for (const matrix of shapes) {
            const result = computeSignature2(matrix);
            for (const pass of result.passes) {
                for (const cls of pass.classes) {
                    const covered = cls.views.reduce((sum, view) => sum + view.count, 0);
                    expect(covered).toBe(cls.size);
                }
            }

            // A pass that split nothing is a fixed point: every class has one view.
            const last = result.passes[result.passes.length - 1];
            if (last.split === false) {
                for (const cls of last.classes) expect(cls.views).toHaveLength(1);
            }
        }
    });

    it("is deterministic", () => {
        const matrix = randomGraph(11, 7);
        expect(key(matrix)).toBe(key(matrix));
        expect(computeSignature2(matrix).vector).toEqual(computeSignature2(matrix).vector);
    });
});

describe("cross-check against the tree signature", () => {
    it("stops where the tree signature explodes", () => {
        const matrix = complete(18);

        expect(computeSignature(matrix).capped).toBe(true);
        const refined = computeSignature2(matrix);
        expect(refined.stable).toBe(true);
        expect(refined.classes).toHaveLength(1);
    });

    /*
     * The tree unravelling is at least as strong as the refinement, so a graph
     * the tree fully resolves must also be fully resolved by the refinement.
     * The converse is not expected to hold.
     */
    it("a discrete tree implies a discrete refinement", () => {
        for (let seed = 1; seed <= 8; seed++) {
            const matrix = randomGraph(10, seed);
            const tree = computeSignature(matrix);
            if (tree.capped) continue;
            if (!tree.nodes.every((node) => node.finalIndex !== null)) continue;

            expect(computeSignature2(matrix).discrete).toBe(true);
        }
    });
});
