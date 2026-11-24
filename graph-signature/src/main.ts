import { computeSignature } from "./core/signature.ts";
import { firstPass } from "./core/signature2.ts";
import { fromGraph6, toGraph6 } from "./core/graph6.ts";
import type { SignatureResult } from "./core/signature.ts";
import type { SortState } from "./core/signature2.ts";
import { GraphView } from "./ui/graphView.ts";

const MIN_NODES = 3;
const MAX_NODES = 18;

let n = MAX_NODES;
let adjacency: boolean[][] = [];
let view: GraphView | null = null;

const host = document.getElementById("graph");
const slider = document.getElementById("node-count") as HTMLInputElement | null;
const number = document.getElementById("node-number") as HTMLInputElement | null;

function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function emptyMatrix(size: number): boolean[][] {
    return Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
}

function randomColouring(size: number, seed: number): boolean[][] {
    const random = mulberry32(seed);
    const matrix = emptyMatrix(size);
    for (let i = 0; i < size; i++) {
        for (let j = i + 1; j < size; j++) {
            const red = random() < 0.5;
            matrix[i][j] = red;
            matrix[j][i] = red;
        }
    }
    return matrix;
}

function uniformColouring(size: number, red: boolean): boolean[][] {
    const matrix = emptyMatrix(size);
    for (let i = 0; i < size; i++) {
        for (let j = i + 1; j < size; j++) {
            matrix[i][j] = red;
            matrix[j][i] = red;
        }
    }
    return matrix;
}

function text(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

/** The signature is rendered as JSON; above this many characters it is cut. */
const JSON_LIMIT = 24_000;

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Wraps keys, strings and numbers of an already escaped JSON text into spans. */
function highlightJson(json: string): string {
    return escapeHtml(json).replace(
        /("(?:[^"\\]|\\.)*")(\s*:)?|\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g,
        (match: string, key?: string, colon?: string, num?: string) => {
            if (key !== undefined) {
                const cls = colon ? "json-key" : "json-string";
                return `<span class="${cls}">${key}</span>${colon ?? ""}`;
            }
            return num === undefined ? match : `<span class="json-number">${num}</span>`;
        },
    );
}

function renderPanel(result: SignatureResult): void {
    const totalEdges = (n * (n - 1)) / 2;
    let red = 0;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) if (adjacency[i][j]) red += 1;
    }

    text("graph6", toGraph6(adjacency));
    text("red-count", String(red));
    text("blue-count", String(totalEdges - red));
    text("order", result.order.join(" "));
    text(
        "status",
        result.capped
            ? "expansion budget exhausted — the colouring is too symmetric"
            : `${result.expansions} expansions`,
    );

    const body = document.getElementById("nodes-body");
    if (body) {
        body.innerHTML = [...result.nodes]
            .sort(
                (a, b) =>
                    (a.finalIndex ?? Number.MAX_SAFE_INTEGER) -
                    (b.finalIndex ?? Number.MAX_SAFE_INTEGER),
            )
            .map(
                (node) =>
                    `<tr><td>${node.label}</td><td>${node.degree}</td>` +
                    `<td>${node.finalIndex ?? "—"}</td><td>${node.resolutionStep ?? "—"}</td></tr>`,
            )
            .join("");
    }

    const sig = document.getElementById("sig");
    if (sig) {
        if (result.capped) {
            sig.textContent = "— (the signature exploded: the colouring is too symmetric)";
            text("sig-count", "");
        } else {
            const length = renderJson("sig", result.entries);
            text(
                "sig-count",
                `${result.entries.length} entries${length > JSON_LIMIT ? " · truncated" : ""}`,
            );
        }
    }
}

function renderJson(id: string, value: unknown): number {
    const element = document.getElementById(id);
    const json = JSON.stringify(value, null, 2);
    if (element) {
        let shown = json;
        if (json.length > JSON_LIMIT) {
            const cut = json.lastIndexOf("\n", JSON_LIMIT);
            shown = `${json.slice(0, cut > 0 ? cut : JSON_LIMIT)}\n… (truncated)`;
        }
        element.innerHTML = highlightJson(shown);
    }
    return json.length;
}

function label(index: number): string {
    return String.fromCharCode(65 + index);
}

/** The graph re-indexed in the given order, ready for graph6. */
function reordered(adjacency: boolean[][], order: readonly number[]): boolean[][] {
    return order.map((i) => order.map((j) => adjacency[i][j]));
}

function renderSortLog(state: SortState): void {
    const entry = state.log[state.log.length - 1];
    const groups = entry.blocks.length;
    const frozen = entry.blocks.filter((block) => block.members.length === 1).length;
    const tied = groups - frozen;

    text(
        "s2-status",
        `pass ${entry.pass} · ${groups} ${groups === 1 ? "group" : "groups"} · ${frozen} frozen · ${tied} tied`,
    );

    const log = document.getElementById("s2-log");
    if (log) {
        log.innerHTML = entry.blocks
            .map((block) => {
                const start = block.start;
                const end = start + block.members.length - 1;
                const range = start === end ? `#${start}` : `#${start}–#${end}`;
                const isFrozen = block.members.length === 1;
                const members = block.members.map(label).join(" ");

                return (
                    `<div class="s2-row">` +
                    `<span class="s2-rank">${range}</span>` +
                    `<span class="s2-degree">deg ${block.degree}</span>` +
                    `<span class="s2-members">${members}</span>` +
                    `<span class="s2-state s2-state--${isFrozen ? "frozen" : "tied"}">${
                        isFrozen ? "frozen" : "tied"
                    }</span>` +
                    `</div>`
                );
            })
            .join("");
    }

    const graph6 = document.getElementById("s2-graph6");
    if (graph6) {
        graph6.textContent =
            `graph6 in this order: ${toGraph6(reordered(adjacency, state.order))}` +
            " (provisional — the tied blocks keep their input order, so this string is not canonical yet)";
    }
}

function refresh(): void {
    view?.render(adjacency);
    renderPanel(computeSignature(adjacency));
    renderSortLog(firstPass(adjacency));
}

function toggle(i: number, j: number): void {
    adjacency[i][j] = !adjacency[i][j];
    adjacency[j][i] = adjacency[i][j];
    refresh();
}

function rebuildView(): void {
    if (slider) slider.value = String(n);
    if (number) number.value = String(n);
    text("graph-size", String(n));

    if (host) {
        host.innerHTML = "";
        view = new GraphView(host, n, toggle);
    }

    refresh();
}

function setNodeCount(value: number): void {
    const clamped = Math.min(
        MAX_NODES,
        Math.max(MIN_NODES, Math.round(Number.isFinite(value) ? value : MIN_NODES)),
    );
    n = clamped;
    adjacency = randomColouring(n, 7);
    rebuildView();
}

if (host) {
    setNodeCount(MAX_NODES);

    slider?.addEventListener("input", () => setNodeCount(Number(slider.value)));
    number?.addEventListener("change", () => setNodeCount(Number(number.value)));

    document.getElementById("regenerate")?.addEventListener("click", () => {
        adjacency = randomColouring(n, (Math.random() * 1_000_000_000) | 0);
        refresh();
    });
    document.getElementById("all-red")?.addEventListener("click", () => {
        adjacency = uniformColouring(n, true);
        refresh();
    });
    document.getElementById("all-blue")?.addEventListener("click", () => {
        adjacency = uniformColouring(n, false);
        refresh();
    });

    const graph6Input = document.getElementById("graph6-input") as HTMLInputElement | null;
    const graph6Error = document.getElementById("graph6-error");

    const load = (): void => {
        if (!graph6Input) return;
        const matrix = fromGraph6(graph6Input.value);
        if (!matrix) {
            if (graph6Error) graph6Error.textContent = "Not a valid graph6 string.";
            return;
        }
        if (matrix.length < MIN_NODES || matrix.length > MAX_NODES) {
            if (graph6Error) {
                graph6Error.textContent = `graph6 has ${matrix.length} vertices; this page handles ${MIN_NODES}–${MAX_NODES}.`;
            }
            return;
        }
        if (graph6Error) graph6Error.textContent = "";
        n = matrix.length;
        adjacency = matrix;
        rebuildView();
    };

    document.getElementById("graph6-load")?.addEventListener("click", load);
    graph6Input?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") load();
    });
}
