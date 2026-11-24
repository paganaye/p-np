/**
 * Signature 2 — sorting the vertices, one pass at a time.
 *
 * The goal is a canonical graph6: the same string for every graph isomorphic to
 * this one. Vertices are numbered `1..n` by the current order, and a pass cuts
 * them into **groups** — contiguous ranges of those numbers. The range is the
 * group's identity; a pass refines a group by its position, never by its
 * members' labels.
 *
 * The key of a vertex is its **walk tree**, in which every node also carries the
 * position of its group:
 *
 * - the ring of neighbours gives the degree, two rings give the neighbourhood of
 *   the neighbourhood, and so on — that is what tells a triangle from a square,
 *   which any neighbour *counting* calls identical;
 * - a branch that comes back to one of its own ancestors is written `^k`, `k`
 *   steps up — that is what records the length of a cycle;
 * - the position of each node is what lets a pinned vertex matter to its
 *   neighbours, instead of being one more indistinguishable leaf.
 *
 * Pass `p` looks `p` rings deep. When that separates nothing, the pass **pins**
 * the first member of the group instead: the vertex becomes a group of one, so
 * the next pass sees it as a position of its own and its neighbours can be told
 * apart.
 *
 * Two things keep it finite:
 *
 * - **twins** — vertices a swap can exchange without touching any other edge —
 *   are never separable, and their order is harmless: the matrix does not change.
 *   Such a group is marked and skipped.
 * - the tree grows like `degree^depth`, so the depth is capped from the largest
 *   degree. Past the cap the sort stops and the page says so.
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
    /** What this pass did, spelled out for the panel. */
    criterion: string;
    /** The position of the group that was refined. */
    target?: number;
    /** How many vertices that group held before the pass. */
    targetSize?: number;
    /** Set when the pass pinned a vertex instead of splitting on keys. */
    pinned?: number;
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

/** Hard ceiling on the depth. */
const DEPTH_CEILING = 8;

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
 * Every node is written `p<position>` followed, when it has children, by them
 * between parentheses. `path` holds the vertices from the root down to the
 * current one, so a branch landing on an ancestor is written `^<steps>@<position>`.
 */
export function treeKey(
    neighbours: readonly (readonly number[])[],
    positions: readonly number[],
    vertex: number,
    depth: number,
    path: number[] = [],
): string {
    const label = `p${positions[vertex]}`;
    if (depth === 0) return label;

    path.push(vertex);
    const children: string[] = [];

    for (const next of neighbours[vertex]) {
        const seen = path.lastIndexOf(next);
        if (seen >= 0) children.push(`^${path.length - seen}@${positions[next]}`);
        else children.push(treeKey(neighbours, positions, next, depth - 1, path));
    }

    path.pop();
    children.sort();
    return `${label}(${children.join("")})`;
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

/** Highest key first: at depth 1 that is the highest degree first. */
function groupByKey(
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
    const nothing = new Array<number>(n).fill(0);

    const keys = new Map<number, string>();
    for (let vertex = 0; vertex < n; vertex++) {
        keys.set(vertex, treeKey(neighbours, nothing, vertex, 1));
    }

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
 * One advance on the first group that is neither a singleton nor a twin set.
 *
 * The key is the walk tree at a depth one ring deeper than the previous pass,
 * with every node carrying its group's position. If that separates nothing, the
 * pass pins the group's first member instead: from then on that vertex is a
 * position of its own, and the next pass can tell its neighbours from the rest.
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

    const n = adjacency.length;
    const positions = new Array<number>(n).fill(0);
    for (const block of previous.blocks) {
        for (const vertex of block.members) positions[vertex] = block.start;
    }

    const neighbours = neighboursOf(adjacency);
    const keys = new Map<number, string>();
    for (const vertex of target.members) {
        keys.set(vertex, treeKey(neighbours, positions, vertex, depth));
    }

    const byKey = groupByKey(keys, target.members);
    const groups: Array<{ key?: string; members: number[] }> = [];
    let pinned: number | undefined;
    let criterion = `walk trees ${depth} rings deep`;

    if (byKey.length > 1) {
        for (const [key, members] of byKey) groups.push({ key, members });
    } else {
        const first = target.members[0];
        pinned = first;
        criterion = "the first vertex, pinned";
        groups.push({ members: [first] });
        groups.push({ key: byKey[0][0], members: target.members.slice(1) });
    }

    const blocks: Block[] = [];
    let position = 1;
    for (const block of previous.blocks) {
        if (block !== target) {
            blocks.push({ ...block, start: position, fresh: false });
            position += block.members.length;
            continue;
        }

        for (const group of groups) {
            blocks.push({
                start: position,
                degree: block.degree,
                members: group.members,
                key: group.key,
                fresh: true,
                twins:
                    group.members.length > 1 ? allTwins(adjacency, group.members) : undefined,
            });
            position += group.members.length;
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
                criterion,
                target: target.start,
                targetSize: target.members.length,
                pinned,
                blocks,
            },
        ],
    };
}
