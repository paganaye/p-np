import { describe, expect, it } from "vitest";
import {
    advance,
    areTwins,
    ballKey,
    compareNodes,
    diameter,
    firstPass,
    SearchTooLargeError,
    solve,
} from "./signature2.ts";
import type { SortState } from "./signature2.ts";

type Matrix = boolean[][];

/*
 * The signature is a sort whose key is a **walk tree**: from a vertex, follow
 * every path and mark a branch that comes back to one of its ancestors, with the
 * distance it took. These tests pin down that this really is stronger than
 * counting neighbours — the triangle and the square are the case that fails any
 * neighbour counting and yet must be separated.
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

function permute(matrix: Matrix, permutation: readonly number[]): Matrix {
    const out = emptyGraph(matrix.length);
    for (let i = 0; i < matrix.length; i++) {
        for (let j = 0; j < matrix.length; j++) {
            if (matrix[i][j]) out[permutation[i]][permutation[j]] = true;
        }
    }
    return out;
}

function runAll(matrix: Matrix): SortState {
    let state = firstPass(matrix);
    for (let pass = 0; pass < 60; pass++) {
        const next = advance(state, matrix);
        if (next === state) break;
        state = next;
    }
    return state;
}

function groupOf(state: SortState, vertex: number): number {
    const last = state.log[state.log.length - 1];
    for (const block of last.blocks) if (block.members.includes(vertex)) return block.start;
    return -1;
}

/** Position, degree and size of every group after the last pass. */
function profileOf(state: SortState): string {
    return state.log[state.log.length - 1].blocks
        .map((block) => `${block.start}:${block.degree}:${block.members.length}`)
        .join(" ");
}

function neighboursOf(matrix: Matrix): number[][] {
    return matrix.map((row) => row.flatMap((red, index) => (red ? [index] : [])));
}

// ------------------------------------------------------------------ tests ---

describe("the ball", () => {
    const noPositions = (n: number) => new Array<number>(n).fill(0);

    it("is the degree at radius 0", () => {
        const p5 = neighboursOf(path(5));
        expect(ballKey(p5, noPositions(5), 0, 0)).toBe("1");
        expect(ballKey(p5, noPositions(5), 2, 0)).toBe("2");
    });

    it("separates a triangle from a square at radius 1", () => {
        const triangle = neighboursOf(cycle(3));
        const square = neighboursOf(cycle(4));

        // The triangle's first ring has an edge inside it, the square's does not.
        expect(ballKey(triangle, noPositions(3), 0, 1)).toBe("2;0.0|1|2");
        expect(ballKey(square, noPositions(4), 0, 1)).toBe("2;0.0|0|2");
    });

    it("carries the group positions, so a pin can matter", () => {
        const p5 = neighboursOf(path(5));
        const positions = [0, 1, 1, 1, 0];
        expect(ballKey(p5, positions, 1, 1)).toContain("0.1");
        expect(ballKey(p5, positions, 2, 1)).toContain("1.1");
    });

    it("grows with the radius, and stops at the diameter", () => {
        const square = neighboursOf(cycle(4));
        expect(ballKey(square, noPositions(4), 0, 2)).toBe(ballKey(square, noPositions(4), 0, 3));
    });
});

describe("the diameter", () => {
    it("is the furthest finite distance", () => {
        expect(diameter(complete(5))).toBe(1);
        expect(diameter(cycle(8))).toBe(4);
        expect(diameter(path(5))).toBe(4);
    });

    it("is never below one, so a pass always has somewhere to look", () => {
        expect(diameter(emptyGraph(6))).toBe(1);
    });
});

describe("twins", () => {
    it("finds none between two vertices of different neighbourhoods", () => {
        const p5 = path(5);
        expect(areTwins(p5, 1, 2)).toBe(false);
    });

    it("finds the opposite vertices of a square", () => {
        const square = cycle(4);
        expect(areTwins(square, 0, 2)).toBe(true);
        expect(areTwins(square, 0, 1)).toBe(false);
    });

    it("marks a complete graph as one twin group", () => {
        const block = firstPass(complete(9)).log[0].blocks[0];
        expect(block.members).toHaveLength(9);
        expect(block.twins).toBe(true);
    });
});

describe("the sort", () => {
    it("orders by degree first", () => {
        const state = firstPass(path(5));
        expect(state.order).toEqual([1, 2, 3, 0, 4]);
        expect(state.log[0].blocks.map((block) => block.degree)).toEqual([2, 1]);
    });

    it("splits P5's middle group at the first ring", () => {
        const matrix = path(5);
        const pass = advance(firstPass(matrix), matrix).log[1];

        expect(pass.target).toBe(1);
        expect(pass.pinned).toBeUndefined();
        expect(pass.blocks.map((block) => block.members)).toEqual([[1, 3], [2], [0, 4]]);
    });

    /*
     * K4 with a pendant on two of its vertices: connected, not multipartite, so no
     * production fires and the search has to pin. The pendant vertices keep the
     * degrees apart, but not the four vertices of the K4.
     */
    it("pins every member of a hopeless group and keeps the smallest string", () => {
        const matrix = addEdges(emptyGraph(6), [
            [0, 1],
            [0, 2],
            [0, 3],
            [1, 2],
            [1, 3],
            [2, 3],
            [0, 4],
            [1, 5],
        ]);

        const result = solve(matrix);
        expect(result.state.log.some((pass) => pass.pinned !== undefined)).toBe(true);

        const last = result.state.log[result.state.log.length - 1];
        expect(
            last.blocks.every((block) => block.members.length === 1 || block.twins === true),
        ).toBe(true);
    });

    /*
     * The crown K9,9 minus a perfect matching: bipartite, twin-free, transitive.
     * Every vertex has exactly one non-neighbour on the other side, and those
     * pairs are the matching — so the two sides and the pairing are read off, and
     * the only choice left (which side comes first) is settled by comparing the
     * two candidate strings.
     */
    it("reads a crown from its bipartition", () => {
        const n = 9;
        const edges: Array<[number, number]> = [];
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) if (j !== i) edges.push([i, n + j]);
        }

        const matrix = addEdges(emptyGraph(2 * n), edges);
        const result = solve(matrix);
        expect(result.branches).toBe(1);

        const last = result.state.log[result.state.log.length - 1];
        expect(last.criterion).toBe("crown");
        expect(last.blocks.length).toBe(n);
        expect(last.blocks.every((block) => block.settled === true)).toBe(true);

        const random = mulberry32(11);
        for (let round = 0; round < 5; round++) {
            const permuted = permute(matrix, shuffle(matrix.length, random));
            expect(solve(permuted).key).toBe(result.key);
        }
    });

    /*
     * K10 minus a perfect matching is complete multipartite with five parts of
     * two. The parts are the answer, so the production reads them and stops: one
     * branch, no pinning, no comparison.
     */
    it("reads a complete multipartite graph from its parts", () => {
        const edges: Array<[number, number]> = [];
        for (let i = 0; i < 10; i++) {
            for (let j = i + 1; j < 10; j++) {
                if (j - i !== 5) edges.push([i, j]);
            }
        }

        const result = solve(addEdges(emptyGraph(10), edges));
        expect(result.branches).toBe(1);

        const last = result.state.log[result.state.log.length - 1];
        expect(last.criterion).toBe("multipartite");
        expect(last.blocks.map((block) => block.members.length)).toEqual([2, 2, 2, 2, 2]);
        expect(last.blocks.every((block) => block.twins === true)).toBe(true);
    });

    /*
     * Five disjoint edges: every ball is an edge, so the search alone would try
     * 10x8x6x4x2 branches. Splitting into components turns it into one cheap
     * solve per component, and identical components are literally identical.
     */
    it("solves a disjoint union component by component", () => {
        const matrix = addEdges(emptyGraph(10), [
            [0, 1],
            [2, 3],
            [4, 5],
            [6, 7],
            [8, 9],
        ]);

        const result = solve(matrix);
        expect(result.components).toBe(5);
        expect(result.branches).toBeLessThan(20);

        const last = result.state.log[result.state.log.length - 1];
        expect(last.blocks.length).toBe(5);
        expect(last.blocks.every((block) => block.twins === true)).toBe(true);
    });

    it("gives the same string for every relabelling of two edges", () => {
        const matrix = addEdges(emptyGraph(18), [
            [0, 1],
            [2, 3],
        ]);

        const expected = solve(matrix).key;
        const random = mulberry32(5);

        for (let round = 0; round < 10; round++) {
            const permuted = permute(matrix, shuffle(matrix.length, random));
            expect(solve(permuted).key).toBe(expected);
        }
    });

    /*
     * A square and a triangle with **no vertex in common**: all seven vertices
     * have degree 2, so depth 2 sees a single group. Depth 3 is what separates
     * them — the triangle's tree shows a ^3 return, the square's does not.
     */
    it("separates a disjoint square from a disjoint triangle", () => {
        const matrix = addEdges(emptyGraph(18), [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 0],
            [4, 5],
            [5, 6],
            [6, 4],
        ]);

        const state = runAll(matrix);

        expect(groupOf(state, 0)).not.toBe(groupOf(state, 4));
    });

    /*
     * The figure: a square A-B-C-D and a triangle D-E-F sharing the vertex D,
     * plus twelve isolated vertices.
     *
     *   degrees   D = 4, others 2, isolated 0
     *   pass 2    B separates (it is the only one of the five not next to D)
     *   pass 3    the square's A, C separate from the triangle's E, F
     *   left      {A, C} and {E, F} are twins, the isolated are twins
     *
     * No pin is needed anywhere: everything is settled by the keys.
     */
    it("sorts a square and a triangle sharing a vertex, with no pin", () => {
        const matrix = addEdges(emptyGraph(18), [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 0],
            [3, 4],
            [4, 5],
            [5, 3],
        ]);

        const state = runAll(matrix);
        const blocks = state.log[state.log.length - 1].blocks;
        const groups = blocks
            .map((block) => [...block.members].sort((a, b) => a - b).join(","))
            .sort();

        expect(state.log.some((pass) => pass.pinned !== undefined)).toBe(false);
        expect(groups).toEqual(["0,2", "1", "3", "4,5", "6,7,8,9,10,11,12,13,14,15,16,17"]);
        expect(blocks.filter((block) => block.members.length === 1)).toHaveLength(2);
        expect(blocks.filter((block) => block.twins === true)).toHaveLength(3);
    });

    it("separates the triangle from the square", () => {
        const matrix = disjoint(cycle(3), cycle(4), emptyGraph(11));
        const state = runAll(matrix);

        expect(groupOf(state, 0)).not.toBe(groupOf(state, 3));
        expect(state.log.length).toBeGreaterThanOrEqual(3);
    });

    it("keeps the profile invariant under relabelling when nothing was pinned", () => {
        const shapes = [path(6), randomGraph(10, 3), randomGraph(12, 5)];

        for (const matrix of shapes) {
            const state = runAll(matrix);
            if (state.log.some((pass) => pass.pinned !== undefined)) continue;

            const expected = profileOf(state);
            const random = mulberry32(11);

            for (let round = 0; round < 12; round++) {
                const permuted = permute(matrix, shuffle(matrix.length, random));
                expect(profileOf(runAll(permuted))).toBe(expected);
            }
        }
    });
});

describe("the depth", () => {
    it("comes from the graph, not from a setting", () => {
        // A ball stops growing at the diameter, so the depth is bounded by the
        // graph itself: nothing to tune, nothing to exceed.
        expect(firstPass(cycle(8)).maxDepth).toBe(4);
        expect(firstPass(complete(18)).maxDepth).toBe(1);
    });
});

describe("giving up", () => {
    it("throws instead of freezing when the branching explodes", () => {
        // The same graph as above, with a budget of two branches: the point is not
        // that some graph is hard, but that the search refuses instead of freezing
        // when it is allowed to run out.
        const matrix = addEdges(emptyGraph(6), [
            [0, 1],
            [0, 2],
            [0, 3],
            [1, 2],
            [1, 3],
            [2, 3],
            [0, 4],
            [1, 5],
        ]);

        expect(() => solve(matrix, 2)).toThrow(SearchTooLargeError);
    });
});

describe("comparing two nodes", () => {
    it("walks the rings and says where they first differ", () => {
        const p5 = path(5);
        const positions = [0, 0, 0, 0, 0];

        // 1 and 3 are symmetric, so every ring agrees.
        const same = compareNodes(p5, positions, 1, 3, 4);
        expect(same.equal).toBe(true);
        expect(same.firstDifference).toBeNull();

        // 1 and 2 already differ on the first ring.
        const differ = compareNodes(p5, positions, 1, 2, 4);
        expect(differ.equal).toBe(false);
        expect(differ.firstDifference).toBe(2);
    });

    it("uses the current partition, so a pinned node counts", () => {
        // Two disjoint edges: in an undifferentiated partition the two "other
        // ends" look exactly alike. Once vertex 0 is pinned on its own, the
        // vertex next to it stops looking like the vertex next to 3.
        const matrix = addEdges(emptyGraph(4), [
            [0, 1],
            [2, 3],
        ]);

        const free = compareNodes(matrix, [0, 0, 0, 0], 1, 2, 3);
        expect(free.equal).toBe(true);

        const pinned = compareNodes(matrix, [1, 2, 2, 2], 1, 2, 3);
        expect(pinned.equal).toBe(false);
        expect(pinned.firstDifference).toBe(1);
    });
});
