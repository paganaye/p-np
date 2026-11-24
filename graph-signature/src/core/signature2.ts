/**
 * Signature 2 — sorting the vertices, one pass at a time.
 *
 * The goal is a canonical graph6: the same string for every graph isomorphic to
 * this one. The route is a sequence of passes. Each pass sorts the vertices of
 * one group by a key that is built only from numbers and structure — the `A…R`
 * input labels never enter a key, they are only there to read the log.
 *
 * The key is a **walk tree**: from a vertex, follow every path, and mark a branch
 * that comes back to one of its own ancestors with the distance it took. That
 * marker is what makes the key stronger than counting neighbours: a triangle
 * comes back at distance 3, a square at distance 4, so at depth 3 their trees
 * already differ, while any amount of neighbour counting calls them identical.
 *
 * Pass `p` uses depth `p`: pass 1 is the degree, pass 2 one more ring, and so on.
 * A group whose members have not been separated by depth `p` is retried at depth
 * `p + 1`, which is how the triangle and the square finally split.
 *
 * Two escape hatches keep it finite:
 *
 * - **twins.** Vertices that a swap can exchange without touching anything else
 *   are never separable, and their order is harmless — the matrix is the same.
 *   Such a group is marked `twins` and skipped.
 * - **depth budget.** The tree grows like `degree^depth`, so the depth is capped
 *   from the largest degree. Past the cap the sort stops and the page says so.
 */

export interface Block {
    /** 1-based position of the group's first vertex — the group's identity. */
    start: number;
    /** Red degree shared by the members. */
    degree: number;
    /** Vertex indices, in the current order. */
    members: number[];
    /** True when this group came out of the group refined by this pass. */
    fresh?: boolean;
    /** True when every pair of members is interchangeable: their order is free. */
    twins?: boolean;
    /** The key that produced this group: its walk tree, as a string. */
    key?: string;
}

export interface PassLog {
    pass: number;
    /** How many rings the key looked at. */
    depth: number;
    /** What this pass sorted by, spelled out for the panel. */
    criterion: string;
    /** The position of the group that was refined. */
    target?: number;
    /** How many vertices that group held before the pass. */
    targetSize?: number;
    /** False when the refined group did not split at this depth. */
    split?: boolean;
    /** The groups, in order, after this pass. */
    blocks: Block[];
}

export interface SortState {
    /** Every vertex index, blocks concatenated in order. */
    order: number[];
    /** One entry per pass run so far. */
    log: PassLog[];
    /** Deepest key the budget allows. */
    maxDepth: number;
}

/** Walk-tree nodes we are willing to build per vertex, which caps the depth. */
const KEY_BUDGET = 8000;

/** Hard ceiling on the depth, so a sparse graph cannot run away either. */
const DEPTH_CEILING = 6;

function neighboursOf(adjacency: readonly (readonly boolean[])[]): number[][] {
    const n = adjacency.length;
    const neighbours: number[][] = [];
    for (let i = 0; i < n; i++) {
        const row: number[] = [];
        for (let j = 0; j < n; j++) if (adjacency[i][j]) row.push(j);
        neighbours.push(row);
    }
    return neighbours;
}

/**
 * Canonical description of the depth-`depth` walk tree rooted at `vertex`.
 *
 * `path` holds the vertices from the root down to the current one, so a branch
 * that lands on an ancestor is written `^k` — `k` steps up. Everything else is a
 * nested list of children, sorted, which makes the string independent of the
 * input numbering.
 */
export function treeKey(
    neighbours: readonly (readonly number[])[],
    vertex: number,
    depth: number,
    path: number[] = [],
): string {
    if (depth === 0) return ".";

    path.push(vertex);
    const children: string[] = [];

    for (const next of neighbours[vertex]) {
        const seen = path.lastIndexOf(next);
        if (seen >= 0) children.push(`^${path.length - seen}`);
        else children.push(treeKey(neighbours, next, depth - 1, path));
    }

    path.pop();
    children.sort();
    return `(${children.join("")})`;
}

/** Two vertices are interchangeable when swapping them changes no other edge. */
export function areTwins(
    adjacency: readonly (readonly boolean[])[],
    u: number,
    v: number,
): boolean {
    for (let other = 0; other < adjacency.length; other++) {
        if (other === u || other === v) continue;
        if (adjacency[u][other] !== adjacency[v][other]) return false;
    }
    return true;
}

function allTwins(adjacency: readonly (readonly boolean[])[], members: readonly number[]): boolean {
    for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
            if (!areTwins(adjacency, members[i], members[j])) return false;
        }
    }
    return true;
}

/** Deepest key the walk-tree budget allows for this graph. */
export function depthBudget(adjacency: readonly (readonly boolean[])[]): number {
    let largest = 0;
    for (const row of adjacency) {
        let degree = 0;
        for (const red of row) if (red) degree += 1;
        if (degree > largest) largest = degree;
    }

    const branching = Math.max(2, largest);
    const affordable = Math.floor(Math.log(KEY_BUDGET) / Math.log(branching));
    return Math.max(1, Math.min(DEPTH_CEILING, affordable));
}

function groupByKey(
    adjacency: readonly (readonly boolean[])[],
    keys: ReadonlyMap<number, string>,
    vertices: readonly number[],
): Array<[string, number[]]> {
    const buckets = new Map<string, number[]>();
    for (const vertex of vertices) {
        const key = keys.get(vertex) as string;
        const bucket = buckets.get(key);
        if (bucket === undefined) buckets.set(key, [vertex]);
        else bucket.push(vertex);
    }

    // Highest key first: at depth 1 that is the highest degree first.
    return [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
}

/**
 * `adjacency[i][j]` is true when the edge i–j is red. Vertex indices are the
 * input numbering; the log prints them as `A`, `B`, … but nothing below uses
 * those letters.
 */
export function firstPass(adjacency: readonly (readonly boolean[])[]): SortState {
    const n = adjacency.length;
    const neighbours = neighboursOf(adjacency);

    const keys = new Map<number, string>();
    for (let vertex = 0; vertex < n; vertex++) keys.set(vertex, treeKey(neighbours, vertex, 1));

    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
        const ka = keys.get(a) as string;
        const kb = keys.get(b) as string;
        if (ka !== kb) return ka < kb ? 1 : -1;
        return a - b;
    });

    const blocks: Block[] = [];
    let position = 1;
    for (const vertex of order) {
        const key = keys.get(vertex) as string;
        const last = blocks[blocks.length - 1];
        if (last !== undefined && last.key === key) last.members.push(vertex);
        else
            blocks.push({
                start: position,
                degree: neighbours[vertex].length,
                members: [vertex],
                key,
            });
        position += 1;
    }

    for (const block of blocks) {
        if (block.members.length > 1) block.twins = allTwins(adjacency, block.members);
    }

    return {
        order,
        maxDepth: depthBudget(adjacency),
        log: [{ pass: 1, depth: 1, criterion: "the red degree", blocks }],
    };
}

/**
 * One advance: refine the first group that is neither a singleton nor a twin
 * set, using walk trees one ring deeper than the previous pass.
 *
 * The children keep the parent's slot, so the order is subdivided in place and
 * never re-sorted across groups.
 */
export function advance(
    state: SortState,
    adjacency: readonly (readonly boolean[])[],
): SortState {
    const previous = state.log[state.log.length - 1];
    const target = previous.blocks.find(
        (block) => block.members.length > 1 && block.twins !== true,
    );
    if (target === undefined) return state;

    const depth = previous.pass + 1;
    if (depth > state.maxDepth) return state;

    const neighbours = neighboursOf(adjacency);
    const keys = new Map<number, string>();
    for (const vertex of target.members) keys.set(vertex, treeKey(neighbours, vertex, depth));

    const children = groupByKey(adjacency, keys, target.members);
    const split = children.length > 1;

    const blocks: Block[] = [];
    let position = 1;
    for (const block of previous.blocks) {
        if (block !== target) {
            blocks.push({ ...block, start: position, fresh: false });
            position += block.members.length;
            continue;
        }

        for (const [key, members] of children) {
            blocks.push({
                start: position,
                degree: block.degree,
                members,
                key,
                fresh: split,
                twins: members.length > 1 ? allTwins(adjacency, members) : undefined,
            });
            position += members.length;
        }
    }

    return {
        order: blocks.flatMap((block) => block.members),
        maxDepth: state.maxDepth,
        log: [
            ...state.log,
            {
                pass: previous.pass + 1,
                depth,
                criterion: `walk trees ${depth} rings deep`,
                target: target.start,
                targetSize: target.members.length,
                split,
                blocks,
            },
        ],
    };
}
