/**
 * Canonical graph signatures — a TypeScript port of `graph_signature_v2.py`
 * (Ramsey work, graph canonicalisation).
 *
 * Every node starts with its degree. Signatures are sorted by degree
 * (descending), then resolution step, loop length, final index; ambiguous
 * nodes are expanded (their neighbourhood is added, cycles detected) until
 * every node gets a unique final index.
 */

export interface NodeInfo {
    label: string;
    degree: number;
    finalIndex: number | null;
    resolutionStep: number | null;
}

/**
 * One node of a signature tree, ready to be shown as JSON.
 * Keys are emitted in this order: `nc`, `fi`, `rs`, `ll`, `n`.
 * Only the fields that carry information are present — a settled node that
 * never needed expanding is just `{ "nc": 3 }`.
 */
export interface SigNode {
    nc: number;
    fi?: number;
    rs?: number;
    ll?: number;
    n?: SigNode[];
}

export interface SignatureResult {
    nodes: NodeInfo[];
    /** Labels sorted by final index. */
    order: string[];
    /** The nested signatures as a tree, one entry per node in canonical order. */
    entries: SigNode[];
    /** True if the expansion budget was exhausted (the graph is too symmetric). */
    capped: boolean;
    expansions: number;
}

const MAX_SIGNATURES = 30_000;

class GNode {
    finalIndex: number | null = null;
    resolutionStep: number | null = null;
    readonly neighbours: GNode[] = [];

    constructor(
        readonly label: string,
        readonly degree: number,
    ) {}
}

class Sig {
    neighbours: Sig[] | null = null;
    readonly parents: Sig | null;
    readonly loopLength: number | null;

    constructor(
        readonly node: GNode,
        parent: Sig | null = null,
        loopLength: number | null = null,
    ) {
        this.parents = parent;
        this.loopLength = loopLength;
    }

    get degree(): number {
        return this.node.degree;
    }

    get finalIndex(): number | null {
        return this.node.finalIndex;
    }

    get resolutionStep(): number | null {
        return this.node.resolutionStep;
    }

    get isExpanded(): boolean {
        return this.neighbours !== null;
    }

    /** The signature of this node as a plain object, keys in reading order. */
    tree(): SigNode {
        const node: SigNode = { nc: this.degree };
        if (this.finalIndex !== null) node.fi = this.finalIndex;
        if (this.resolutionStep !== null) node.rs = this.resolutionStep;
        if (this.loopLength !== null) node.ll = this.loopLength;
        if (this.isExpanded && this.neighbours) node.n = this.neighbours.map((n) => n.tree());
        return node;
    }
}

function noneLast(a: number | null, b: number | null): number {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a < b ? -1 : 1;
}

function compareSigs(a: Sig, b: Sig): number {
    const byDegree = b.degree - a.degree;
    if (byDegree !== 0) return byDegree;

    const byStep = noneLast(a.resolutionStep, b.resolutionStep);
    if (byStep !== 0) return byStep;

    const byLoop = noneLast(a.loopLength, b.loopLength);
    if (byLoop !== 0) return byLoop;

    const byIndex = noneLast(a.finalIndex, b.finalIndex);
    if (byIndex !== 0) return byIndex;

    const aExpanded = a.neighbours !== null;
    const bExpanded = b.neighbours !== null;
    if (aExpanded !== bExpanded) return aExpanded ? -1 : 1;

    if (aExpanded && bExpanded && a.neighbours && b.neighbours) {
        for (let i = 0; i < a.neighbours.length; i++) {
            const result = compareSigs(a.neighbours[i], b.neighbours[i]);
            if (result !== 0) return result;
        }
    }

    return 0;
}

class Engine {
    private readonly nodes: GNode[] = [];
    private readonly sigs: Sig[] = [];
    private budget = MAX_SIGNATURES;
    expansions = 0;
    capped = false;

    constructor(adjacency: readonly (readonly boolean[])[]) {
        const n = adjacency.length;
        for (let i = 0; i < n; i++) {
            const label = String.fromCharCode(65 + i);
            const degree = adjacency[i].reduce((sum, value) => sum + (value ? 1 : 0), 0);
            this.nodes.push(new GNode(label, degree));
        }
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i !== j && adjacency[i][j]) this.nodes[i].neighbours.push(this.nodes[j]);
            }
        }
        for (const node of this.nodes) this.sigs.push(new Sig(node));
    }

    private allFinalized(): boolean {
        return this.nodes.every((node) => node.finalIndex !== null);
    }

    private processPass(passNumber: number): boolean {
        this.sigs.sort(compareSigs);
        let progress = false;

        for (let i = 0; i < this.sigs.length; i++) {
            const sig = this.sigs[i];
            if (sig.finalIndex !== null) continue;

            const uniqueFromPrev = i === 0 || compareSigs(sig, this.sigs[i - 1]) !== 0;
            const uniqueFromNext =
                i === this.sigs.length - 1 || compareSigs(sig, this.sigs[i + 1]) !== 0;

            if (uniqueFromPrev && uniqueFromNext) {
                sig.node.finalIndex = i;
                sig.node.resolutionStep = passNumber;
                progress = true;
            }
        }

        return progress;
    }

    private expandSignatureNode(sig: Sig): boolean {
        if (sig.finalIndex !== null || sig.isExpanded || sig.loopLength !== null) return false;

        const children: Sig[] = [];
        for (const neighbour of sig.node.neighbours) {
            let loopLength: number | null = null;
            let parent: Sig | null = sig;
            let distance = 1;

            while (parent) {
                if (parent.node.label === neighbour.label) {
                    loopLength = distance;
                    break;
                }
                parent = parent.parents;
                distance += 1;
            }

            if (--this.budget <= 0) {
                this.capped = true;
                return false;
            }
            this.expansions += 1;

            children.push(new Sig(neighbour, sig, loopLength));
        }

        children.sort(compareSigs);
        sig.neighbours = children;
        return true;
    }

    private expandNode(sig: Sig): boolean {
        if (sig.loopLength !== null || sig.finalIndex !== null) return false;

        let expanded = false;
        if (sig.isExpanded && sig.neighbours) {
            for (const child of sig.neighbours) {
                if (this.expandNode(child)) expanded = true;
                if (this.capped) return expanded;
            }
        } else {
            this.expandSignatureNode(sig);
            expanded = true;
        }

        if (expanded && sig.neighbours) sig.neighbours.sort(compareSigs);
        return expanded;
    }

    private expandAmbiguousNodes(): boolean {
        let any = false;
        for (const sig of [...this.sigs]) {
            if (sig.finalIndex !== null) continue;
            if (this.expandNode(sig)) any = true;
            if (this.capped) break;
        }
        if (any) this.sigs.sort(compareSigs);
        return any;
    }

    compute(): void {
        const maxPasses = this.nodes.length * 2 + 5;
        let pass = 1;

        while (pass <= maxPasses && !this.allFinalized() && !this.capped) {
            const progress = this.processPass(pass);
            if (!progress && !this.expandAmbiguousNodes()) break;
            pass += 1;
        }

        this.sigs.sort(compareSigs);
    }

    result(): SignatureResult {
        const nodes: NodeInfo[] = this.nodes.map((node) => ({
            label: node.label,
            degree: node.degree,
            finalIndex: node.finalIndex,
            resolutionStep: node.resolutionStep,
        }));

        const order = [...nodes]
            .sort((a, b) => {
                if (a.finalIndex === null && b.finalIndex === null) return a.label < b.label ? -1 : 1;
                if (a.finalIndex === null) return 1;
                if (b.finalIndex === null) return -1;
                return a.finalIndex - b.finalIndex;
            })
            .map((node) => node.label);

        return {
            nodes,
            order,
            entries: this.capped ? [] : this.sigs.map((sig) => sig.tree()),
            capped: this.capped,
            expansions: this.expansions,
        };
    }
}

/** `adjacency[i][j]` is true when the edge i–j is red. */
export function computeSignature(adjacency: readonly (readonly boolean[])[]): SignatureResult {
    const engine = new Engine(adjacency);
    engine.compute();
    return engine.result();
}
