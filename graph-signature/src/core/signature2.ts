/**
 * Signature 2 — colour refinement (1-WL) on integer classes.
 *
 * The whole point is that a pass never looks at the `A…R` labels: pass 0
 * splits the vertices by red degree, and each later pass rewrites a class from
 * its old number and the sorted list of its neighbours' class numbers, then
 * renumbers the classes in an order that only compares class numbers. So the
 * result of every pass is the same for any two graphs of the same shape,
 * whatever order their vertices happen to be numbered in.
 *
 * Each pass is recorded in full: for every class, its size and its **views** —
 * the distinct neighbour-class multisets its members have, with how many
 * members have each. That is exactly the information the next pass consumes, so
 * a class with a single view cannot split again. A pass where every class has a
 * single view is the fixed point: the refinement only ever splits, never
 * merges, and is deterministic, so nothing can change afterwards.
 */

export interface ClassView {
    /** How many members of the class share this view. */
    count: number;
    /** Sorted class numbers of the neighbours of one such member. */
    neighbours: number[];
}

export interface ClassFrame {
    /** Number of vertices in the class. */
    size: number;
    /** Distinct views inside the class, sorted by their neighbour list. */
    views: ClassView[];
}

export interface RefinementPass {
    pass: number;
    classes: ClassFrame[];
    /** Absent on pass 0; true when this pass split at least one class. */
    split?: boolean;
}

export interface ClassInfo {
    id: number;
    /** Vertex indices, ascending. */
    members: number[];
}

export interface Signature2Result {
    /** Final classes, in canonical order, with their members. */
    classes: ClassInfo[];
    /** Class number of each vertex, indexed like the adjacency matrix. */
    vector: number[];
    /** Pass 0 (degrees), then one entry per refinement pass. */
    passes: RefinementPass[];
    /** True when a pass changed nothing: the partition is equitable. */
    stable: boolean;
    /** True when every class is a singleton: the refinement went all the way. */
    discrete: boolean;
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
}

/** Groups vertices, already sorted by key then index, into consecutive classes. */
function groupVertices(order: readonly number[], keys: readonly number[][]): ClassInfo[] {
    const classes: ClassInfo[] = [];
    let current: ClassInfo | null = null;
    let currentKey: readonly number[] | null = null;

    for (const vertex of order) {
        const key = keys[vertex];
        if (current === null || currentKey === null || compareKeys(key, currentKey) !== 0) {
            current = { id: classes.length, members: [] };
            classes.push(current);
            currentKey = key;
        }
        current.members.push(vertex);
    }

    return classes;
}

/** Sorted list of the class numbers of each vertex's neighbours. */
function viewKeys(
    neighbours: readonly (readonly number[])[],
    vector: readonly number[],
): number[][] {
    return neighbours.map((row) => row.map((vertex) => vector[vertex]).sort((a, b) => a - b));
}

function framesOf(
    classes: readonly ClassInfo[],
    rest: readonly (readonly number[])[],
): ClassFrame[] {
    return classes.map((cls) => {
        const buckets = new Map<string, ClassView>();
        for (const vertex of cls.members) {
            const neighbours = [...rest[vertex]];
            const key = neighbours.join(",");
            const existing = buckets.get(key);
            if (existing) existing.count += 1;
            else buckets.set(key, { count: 1, neighbours });
        }

        return {
            size: cls.members.length,
            views: [...buckets.values()].sort((a, b) => compareKeys(a.neighbours, b.neighbours)),
        };
    });
}

/**
 * `adjacency[i][j]` is true when the edge i–j is red. Vertices are labelled
 * `A`, `B`, … only at display time; no pass ever uses those labels.
 */
export function computeSignature2(
    adjacency: readonly (readonly boolean[])[],
): Signature2Result {
    const n = adjacency.length;

    const neighbours: number[][] = [];
    for (let i = 0; i < n; i++) {
        const row: number[] = [];
        for (let j = 0; j < n; j++) if (i !== j && adjacency[i][j]) row.push(j);
        neighbours.push(row);
    }

    // Pass 0: the red degree is the initial class, highest degree first.
    const byDegree = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
        const byCount = neighbours[b].length - neighbours[a].length;
        return byCount !== 0 ? byCount : a - b;
    });

    let vector = new Array<number>(n).fill(0);
    let classCount = 1;
    for (let i = 0; i < n; i++) {
        if (i > 0 && neighbours[byDegree[i]].length !== neighbours[byDegree[i - 1]].length) {
            classCount += 1;
        }
        vector[byDegree[i]] = classCount - 1;
    }

    let classes = groupVertices(
        byDegree,
        vector.map((id) => [id]),
    );

    const passes: RefinementPass[] = [
        { pass: 0, classes: framesOf(classes, viewKeys(neighbours, vector)) },
    ];

    let stable = false;

    for (let pass = 1; pass <= n; pass++) {
        const rest = viewKeys(neighbours, vector);
        const keys = rest.map((ids, vertex) => [vector[vertex], ...ids]);

        const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
            const byKey = compareKeys(keys[a], keys[b]);
            return byKey !== 0 ? byKey : a - b;
        });

        classes = groupVertices(order, keys);
        const split = classes.length > classCount;
        classCount = classes.length;

        const next = new Array<number>(n).fill(0);
        for (const cls of classes) {
            for (const vertex of cls.members) next[vertex] = cls.id;
        }
        vector = next;

        passes.push({
            pass,
            classes: framesOf(classes, viewKeys(neighbours, vector)),
            split,
        });
        if (!split) {
            stable = true;
            break;
        }
    }

    return {
        classes,
        vector,
        passes,
        stable,
        discrete: classes.length === n,
    };
}
