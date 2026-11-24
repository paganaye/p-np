import { toGraph6 } from "./graph6.ts";

/**
 * Signature 2 — sorting the vertices, one pass at a time.
 *
 * The goal is a canonical graph6: the same string for every graph isomorphic to
 * this one. Vertices are numbered `1..n` by the current order, and a pass cuts
 * them into **groups** — contiguous ranges of those numbers. The range is the
 * group's identity; a pass refines a group by its position, never by its
 * members' labels.
 *
 * The key of a vertex is its **ball**: everything at distance at most `d`, with
 * the edges inside. Its size is bounded by the graph — at most `n` vertices —
 * and it stops changing once `d` reaches the diameter, so the depth is a
 * property of the graph, not a setting.
 *
 * The key is not the whole ball (deciding whether two balls are isomorphic is a
 * graph isomorphism problem of its own); it is a label-free shadow of it: for
 * every distance ring, how many vertices, their degrees, how many edges inside
 * the ring, and how many back to the previous one. That is already enough to
 * tell a triangle from a square at distance 1 — the triangle's ring has an edge
 * inside it, the square's does not.
 *
 * When the diameter is exhausted and a group still refuses to split, the search
 * **pins** it: each member in turn leaves the group, the whole sort is run
 * again, and the branch giving the smallest graph6 wins. A pin is never a
 * choice, only a comparison.
 *
 * Two groups are never refined: a group of one (frozen), and a group whose
 * members are pairwise **twins** — a swap exchanges them without touching any
 * other edge, so their order cannot change the matrix.
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
    /** The key that produced this group: the shadow of its members' ball. */
    key?: string;
}

export interface PassLog {
    pass: number;
    /** How far the key looked. */
    depth: number;
    /** What this pass did, spelled out for the panel. */
    criterion: string;
    /** The position of the group that was refined. */
    target?: number;
    /** How many vertices that group held before the pass. */
    targetSize?: number;
    /** Set when the pass pinned a vertex instead of splitting on keys. */
    pinned?: number;
    /** False when the keys separated nothing at this depth. */
    split?: boolean;
    /** The groups, in order, after this pass. */
    blocks: Block[];
}

export interface SortState {
    /** Every vertex index, blocks concatenated in order. */
    order: number[];
    /** One entry per pass run so far. */
    log: PassLog[];
    /** Furthest distance there is anything to see: the graph's diameter. */
    maxDepth: number;
}

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
 * Distances from `root`, up to `depth`; `-1` for anything out of reach.
 */
function distancesFrom(
    neighbours: readonly (readonly number[])[],
    root: number,
    depth: number,
): number[] {
    const distance = new Array<number>(neighbours.length).fill(-1);
    distance[root] = 0;

    const queue: number[] = [root];
    for (let head = 0; head < queue.length; head++) {
        const current = queue[head];
        if (distance[current] >= depth) continue;
        for (const next of neighbours[current]) {
            if (distance[next] !== -1) continue;
            distance[next] = distance[current] + 1;
            queue.push(next);
        }
    }

    return distance;
}

export interface RingData {
    /** Sorted group positions of the ring's vertices — the degree is implied. */
    positions: number[];
    /** Edges with both ends in this ring. */
    inside: number;
    /** Edges from this ring back to the previous one. */
    back: number;
}

/**
 * The ball of radius `depth` around `vertex`, cut into rings — ring 0 (the
 * vertex itself) excluded, since its only content is the degree, which the key
 * carries separately.
 *
 * A ring is described by the **sorted positions** of its vertices: a group holds
 * a single degree, so the position of a vertex already says how many neighbours
 * it has. Two counts come on top: edges inside the ring, and edges back to the
 * previous one.
 */
export function ballRings(
    neighbours: readonly (readonly number[])[],
    positions: readonly number[],
    vertex: number,
    depth: number,
): RingData[] {
    const distance = distancesFrom(neighbours, vertex, depth);
    const n = neighbours.length;

    const rings: RingData[] = [];
    for (let ring = 1; ring <= depth; ring++) {
        const members: number[] = [];
        for (let candidate = 0; candidate < n; candidate++) {
            if (distance[candidate] === ring) members.push(candidate);
        }
        if (members.length === 0) break;

        const groups = members.map((member) => positions[member]);
        groups.sort((a, b) => a - b);

        let inside = 0;
        for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
                if (neighbours[members[i]].includes(members[j])) inside += 1;
            }
        }

        let back = 0;
        for (const member of members) {
            for (const other of neighbours[member]) {
                if (distance[other] === ring - 1) back += 1;
            }
        }

        rings.push({ positions: groups, inside, back });
    }

    return rings;
}

function ringText(ring: RingData): string {
    return `${ring.positions.join(".")}|${ring.inside}|${ring.back}`;
}

/** The degree, then one section per ring: the whole ball as a key. */
export function ballKey(
    neighbours: readonly (readonly number[])[],
    positions: readonly number[],
    vertex: number,
    depth: number,
): string {
    const degree = neighbours[vertex].length;
    const rings = ballRings(neighbours, positions, vertex, depth);
    return [String(degree), ...rings.map(ringText)].join(";");
}

export interface CompareRing {
    ring: number;
    left: string;
    right: string;
    equal: boolean;
    /** First position where the two rings disagree, when they do. */
    firstPosition?: { left: number; right: number };
}

export interface CompareResult {
    equal: boolean;
    /** First ring where the two balls differ, or null when they never do. */
    firstDifference: number | null;
    rings: CompareRing[];
}

/**
 * Compares two vertices level by level: the degree first, then ring by ring.
 * Because the positions are sorted, the first position where two rings disagree
 * is also the earliest group — the one settled first.
 */
export function compareNodes(
    adjacency: readonly (readonly boolean[])[],
    positions: readonly number[],
    a: number,
    b: number,
    depth: number,
): CompareResult {
    const neighbours = neighboursOf(adjacency);

    const rings: CompareRing[] = [];
    let firstDifference: number | null = null;

    const degreeA = neighbours[a].length;
    const degreeB = neighbours[b].length;
    rings.push({
        ring: 0,
        left: String(degreeA),
        right: String(degreeB),
        equal: degreeA === degreeB,
    });
    if (degreeA !== degreeB) firstDifference = 0;

    const left = ballRings(neighbours, positions, a, depth);
    const right = ballRings(neighbours, positions, b, depth);

    const count = Math.max(left.length, right.length);
    for (let index = 0; index < count; index++) {
        const ring = index + 1;
        const l = left[index];
        const r = right[index];

        if (l === undefined || r === undefined) {
            rings.push({
                ring,
                left: l === undefined ? "—" : ringText(l),
                right: r === undefined ? "—" : ringText(r),
                equal: false,
            });
            if (firstDifference === null) firstDifference = ring;
            continue;
        }

        let disagreement: { left: number; right: number } | undefined;
        const length = Math.max(l.positions.length, r.positions.length);
        for (let position = 0; position < length; position++) {
            const lp = l.positions[position];
            const rp = r.positions[position];
            if (lp !== rp) {
                if (lp !== undefined && rp !== undefined) disagreement = { left: lp, right: rp };
                break;
            }
        }

        const equal =
            disagreement === undefined &&
            l.positions.length === r.positions.length &&
            l.inside === r.inside &&
            l.back === r.back;

        rings.push({
            ring,
            left: ringText(l),
            right: ringText(r),
            equal,
            firstPosition: disagreement,
        });
        if (!equal && firstDifference === null) firstDifference = ring;
    }

    return { equal: firstDifference === null, firstDifference, rings };
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

function allTwins(
    adjacency: readonly (readonly boolean[])[],
    members: readonly number[],
): boolean {
    for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
            if (!areTwins(adjacency, members[i], members[j])) return false;
        }
    }
    return true;
}

/**
 * The furthest useful depth: the largest finite distance in the graph. Beyond
 * it a ball is the whole connected component and cannot grow, so the depth is a
 * property of the graph rather than a setting.
 */
export function diameter(adjacency: readonly (readonly boolean[])[]): number {
    const neighbours = neighboursOf(adjacency);
    let furthest = 0;

    for (let vertex = 0; vertex < adjacency.length; vertex++) {
        const distance = distancesFrom(neighbours, vertex, adjacency.length);
        for (const value of distance) if (value > furthest) furthest = value;
    }

    return Math.max(1, furthest);
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

    const keys = new Map<number, string>();
    const nothing = new Array<number>(n).fill(0);
    for (let vertex = 0; vertex < n; vertex++) {
        keys.set(vertex, ballKey(neighbours, nothing, vertex, 0));
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
        maxDepth: diameter(adjacency),
        log: [{ pass: 1, depth: 0, criterion: "the red degree", blocks }],
    };
}

/**
 * One advance on the first group that is neither a singleton nor a twin set,
 * keyed by the ball one ring further out. Once the diameter is reached the
 * state is returned untouched — the search above then pins a member.
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

    const depth = previous.depth + 1;
    if (depth > state.maxDepth) return state;

    const neighbours = neighboursOf(adjacency);
    const positions = new Array<number>(adjacency.length).fill(0);
    for (const block of previous.blocks) {
        for (const vertex of block.members) positions[vertex] = block.start;
    }

    const keys = new Map<number, string>();
    for (const vertex of target.members) {
        keys.set(vertex, ballKey(neighbours, positions, vertex, depth));
    }

    const byKey = groupByKey(keys, target.members);

    if (byKey.length === 1) {
        return {
            order: state.order,
            maxDepth: state.maxDepth,
            log: [
                ...state.log,
                {
                    pass: previous.pass + 1,
                    depth,
                    criterion: `rings ${depth} — nothing separated`,
                    target: target.start,
                    targetSize: target.members.length,
                    split: false,
                    blocks: previous.blocks.map((block) => ({ ...block, fresh: false })),
                },
            ],
        };
    }

    const blocks: Block[] = [];
    let position = 1;
    for (const block of previous.blocks) {
        if (block !== target) {
            blocks.push({ ...block, start: position, fresh: false });
            position += block.members.length;
            continue;
        }

        for (const [key, members] of byKey) {
            blocks.push({
                start: position,
                degree: block.degree,
                members,
                key,
                fresh: true,
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
                criterion: `rings ${depth}`,
                target: target.start,
                targetSize: target.members.length,
                split: true,
                blocks,
            },
        ],
    };
}

/**
 * Pins one vertex of a group: it leaves the group and becomes a group of one.
 * The depth resets, so the next passes can see it as a position of its own.
 */
export function pinVertex(
    state: SortState,
    adjacency: readonly (readonly boolean[])[],
    vertex: number,
): SortState {
    const previous = state.log[state.log.length - 1];
    const target = previous.blocks.find((block) => block.members.includes(vertex));
    if (target === undefined || target.members.length < 2) return state;

    const rest = target.members.filter((member) => member !== vertex);

    const blocks: Block[] = [];
    let position = 1;
    for (const block of previous.blocks) {
        if (block !== target) {
            blocks.push({ ...block, start: position, fresh: false });
            position += block.members.length;
            continue;
        }

        blocks.push({ start: position, degree: block.degree, members: [vertex], fresh: true });
        position += 1;

        blocks.push({
            start: position,
            degree: block.degree,
            members: rest,
            fresh: true,
            twins: rest.length > 1 ? allTwins(adjacency, rest) : undefined,
        });
        position += rest.length;
    }

    return {
        order: blocks.flatMap((block) => block.members),
        maxDepth: state.maxDepth,
        log: [
            ...state.log,
            {
                pass: previous.pass + 1,
                depth: 0,
                criterion: "out of rings",
                target: target.start,
                targetSize: target.members.length,
                pinned: vertex,
                split: true,
                blocks,
            },
        ],
    };
}

export interface SearchResult {
    /** The log and the order of the branch that gave the smallest string. */
    state: SortState;
    /** The canonical graph6 of that branch. */
    key: string;
    /** How many branches the search had to visit — the cost measure. */
    branches: number;
}

/**
 * Thrown when the search explores more branches than it is willing to. There is
 * no silent truncation: a graph that is too hard says so.
 */
export class SearchTooLargeError extends Error {
    constructor(readonly branches: number) {
        super(`the search explored ${branches} branches without settling`);
        this.name = "SearchTooLargeError";
    }
}

/** How many branches the search may explore before it gives up. */
const BRANCH_LIMIT = 1000;

function refine(
    state: SortState,
    adjacency: readonly (readonly boolean[])[],
): SortState {
    let current = state;
    for (;;) {
        const next = advance(current, adjacency);
        if (next === current) return current;
        current = next;
    }
}

/** The graph6 of the current order — the string two graphs are compared by. */
function orderedString(
    adjacency: readonly (readonly boolean[])[],
    order: readonly number[],
): string {
    const n = order.length;
    const reordered: boolean[][] = [];
    for (let row = 0; row < n; row++) {
        const line: boolean[] = [];
        for (let column = 0; column < n; column++) {
            line.push(adjacency[order[row]][order[column]]);
        }
        reordered.push(line);
    }
    return toGraph6(reordered);
}

function search(
    state: SortState,
    adjacency: readonly (readonly boolean[])[],
    budget: { left: number; used: number },
): { state: SortState; key: string } {
    if (budget.left <= 0) throw new SearchTooLargeError(BRANCH_LIMIT);
    budget.left -= 1;
    budget.used += 1;

    const refined = refine(state, adjacency);
    const last = refined.log[refined.log.length - 1];
    const target = last.blocks.find(
        (block) => block.members.length > 1 && block.twins !== true,
    );

    // Nothing left to refine: this branch is a leaf, its string is a candidate.
    if (target === undefined) {
        return { state: refined, key: orderedString(adjacency, refined.order) };
    }

    // The group resists every distance: try each member, keep the smallest.
    let best: { state: SortState; key: string } | null = null;
    for (const vertex of target.members) {
        const candidate = search(pinVertex(refined, adjacency, vertex), adjacency, budget);
        if (best === null || candidate.key < best.key) best = candidate;
    }

    return best as SearchResult;
}

/**
 * The signature: refine as far as the balls allow, then branch on every group
 * that refuses to split, and keep the smallest graph6 over all the branches.
 *
 * Throws `SearchTooLargeError` when the branching gets out of hand. Refusing
 * loudly is better than freezing the page.
 */
export function solve(adjacency: readonly (readonly boolean[])[]): SearchResult {
    const budget = { left: BRANCH_LIMIT, used: 0 };
    const result = search(firstPass(adjacency), adjacency, budget);
    return { ...result, branches: budget.used };
}

/** The sort without any branching — what the page shows when the search gives up. */
export function partialSort(adjacency: readonly (readonly boolean[])[]): SortState {
    return refine(firstPass(adjacency), adjacency);
}
