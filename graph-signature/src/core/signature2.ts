/**
 * Signature 2 — sorting the vertices, one pass at a time.
 *
 * The goal is a canonical graph6: the same string for every graph isomorphic to
 * this one. The route is a sequence of passes. Each pass sorts the vertices by a
 * key built only from numbers — the `A…R` input labels never enter a key, they
 * are for reading the log.
 *
 * The order is **never** re-sorted as a whole. A pass works inside the blocks of
 * the previous one: the key starts with the vertex's current block, so the
 * children of a block stay contiguous, in its slot, and can never cross a
 * neighbouring block. A pass therefore subdivides the order in place.
 *
 * Pass 1 sorts by red degree, highest first, and cuts the vertices into groups.
 * A group of one is frozen: no later pass can move it across another group. The
 * groups of two or more are tied, and only those get refined later.
 *
 * Pass 2 is not implemented yet — this module stops after pass 1 on purpose.
 */

export interface Block {
    /**
     * 1-based position of the group's first vertex in the current order. This is
     * the group's identity: positions run 1..n, a tied group spans several of
     * them, a frozen group is a single one. Later passes refine a group by its
     * position, never by its members' labels.
     */
    start: number;
    /** The key shared by the block's members — the red degree, for pass 1. */
    degree: number;
    /** Vertex indices, in the current order. */
    members: number[];
}

export interface PassLog {
    pass: number;
    /** What this pass sorted by, spelled out for the panel. */
    criterion: string;
    /**
     * The groups, in order. A group of one is *frozen* — nothing can ever move
     * that vertex across another group. A group of two or more is *tied*, and
     * only groups like that have anything left to refine.
     */
    blocks: Block[];
}

export interface SortState {
    /** Every vertex index, blocks concatenated in order. */
    order: number[];
    /** One entry per pass run so far. */
    log: PassLog[];
}

/**
 * `adjacency[i][j]` is true when the edge i–j is red. The vertex indices are the
 * input numbering; the log prints them as `A`, `B`, … but nothing below uses
 * those letters.
 */
export function firstPass(adjacency: readonly (readonly boolean[])[]): SortState {
    const n = adjacency.length;

    const degree = adjacency.map((row) => row.reduce((sum, red) => sum + (red ? 1 : 0), 0));

    // Highest degree first. Ties keep the input order: that choice is arbitrary,
    // and it is exactly what keeps the graph6 provisional until the group is
    // resolved. It does not affect the group profile, only the order inside.
    const order = Array.from({ length: n }, (_, vertex) => vertex).sort(
        (a, b) => degree[b] - degree[a] || a - b,
    );

    const blocks: Block[] = [];
    let position = 1;
    for (const vertex of order) {
        const last = blocks[blocks.length - 1];
        if (last !== undefined && last.degree === degree[vertex]) {
            last.members.push(vertex);
        } else {
            blocks.push({ start: position, degree: degree[vertex], members: [vertex] });
        }
        position += 1;
    }

    return {
        order,
        log: [
            {
                pass: 1,
                criterion: "red degree, highest first",
                blocks,
            },
        ],
    };
}
