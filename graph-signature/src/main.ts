import { SearchTooLargeError, compareNodes, partialSort, solve } from "./core/signature2.ts";
import { fromGraph6, toGraph6 } from "./core/graph6.ts";
import type { Block, PassLog, SearchResult, SortState } from "./core/signature2.ts";
import { GraphView } from "./ui/graphView.ts";

const MIN_NODES = 3;
const MAX_NODES = 18;

let n = MAX_NODES;
let adjacency: boolean[][] = [];
let view: GraphView | null = null;
let currentState: SortState | null = null;

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

/**
 * The same graph with its vertices renumbered. No edge is added or removed, so
 * the canonical graph6 must not move — only the input-order one does.
 */
function relabelled(matrix: boolean[][]): boolean[][] {
    const size = matrix.length;
    const permutation = Array.from({ length: size }, (_, i) => i);
    for (let i = size - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const swap = permutation[i];
        permutation[i] = permutation[j];
        permutation[j] = swap;
    }

    const out = emptyMatrix(size);
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) out[permutation[i]][permutation[j]] = matrix[i][j];
    }
    return out;
}

function text(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

const STORAGE_KEY = "graph-signature:graph6";

/** The graph6 left by the previous visit, if it is still valid for this page. */
function savedGraph(): boolean[][] | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return null;

        const matrix = fromGraph6(raw);
        if (matrix === null) return null;
        if (matrix.length < MIN_NODES || matrix.length > MAX_NODES) return null;
        return matrix;
    } catch {
        return null;
    }
}

/** Storage is a convenience, never a requirement: ignore any failure. */
function remember(): void {
    try {
        localStorage.setItem(STORAGE_KEY, toGraph6(adjacency));
    } catch {
        // private mode, quota, disabled storage — the page works without it
    }
}

function label(index: number): string {
    return String.fromCharCode(65 + index);
}

/** The graph re-indexed in the given order, ready for graph6. */
function reordered(adjacency: boolean[][], order: readonly number[]): boolean[][] {
    return order.map((i) => order.map((j) => adjacency[i][j]));
}

function blockRow(block: Block): string {
    const start = block.start;
    const end = start + block.members.length - 1;
    const range = start === end ? `#${start}` : `#${start}–#${end}`;
    const state =
        block.members.length === 1 ? "frozen" : block.twins === true ? "twins" : "tied";
    const full = block.key ?? "";
    const short = full === "" ? "—" : shortKey(full);

    return (
        `<div class="s2-row${block.fresh ? " s2-row--fresh" : ""}">` +
        `<span class="s2-rank">${range}</span>` +
        `<span class="s2-degree">deg ${block.degree}</span>` +
        `<span class="s2-members">${block.members
            .map(label)
            .join(" ")}</span>` +
        `<span class="s2-key" title="${full}">${short}</span>` +
        `<span class="s2-state s2-state--${state}">${state}</span>` +
        `</div>`
    );
}

/** What a pass did to the group it worked on: one line per new group, then the order. */
function outcomeOf(pass: PassLog): string {
    if (pass.target === undefined) return "";
    if (pass.split === false) {
        return `<p class="s2-pass-note">→ nothing moved at ring ${pass.depth}, going one ring out</p>`;
    }

    const fresh = pass.blocks.filter((block) => block.fresh);

    const rows = fresh
        .map((block) => {
            const end = block.start + block.members.length - 1;
            const range = block.start === end ? `#${block.start}` : `#${block.start}–#${end}`;
            const key = block.key === undefined ? "" : ` ${shortKey(block.key)}`;
            return `<div class="s2-outcome-row">${range} ${block.members
                .map(label)
                .join(" ")}${key}</div>`;
        })
        .join("");

    const order = fresh.map((block) => block.members.map(label).join("+")).join(" < ");

    return `<div class="s2-outcome">${rows}<div class="s2-outcome-order">${order}</div></div>`;
}

/** Keys are ring summaries; the panel only shows the head of the string. */
function shortKey(key: string): string {
    return key.length <= 22 ? key : `${key.slice(0, 21)}…`;
}

function renderSignature(result: SearchResult, failure: string | null): void {
    const state = result.state;
    const last = state.log[state.log.length - 1];
    const groups = last.blocks.length;
    const frozen = last.blocks.filter((block) => block.members.length === 1).length;
    const twins = last.blocks.filter(
        (block) => block.members.length > 1 && block.twins === true,
    ).length;
    const tied = groups - frozen - twins;
    const ambiguous = tied;

    let red = 0;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) if (adjacency[i][j]) red += 1;
    }
    text("red-count", String(red));
    text("blue-count", String((n * (n - 1)) / 2 - red));

    text(
        "status",
        `${state.log.length} ${state.log.length === 1 ? "pass" : "passes"} · ${groups} ${
            groups === 1 ? "group" : "groups"
        } · ${frozen} frozen · ${twins} twins · ${tied} tied · ${state.maxDepth} rings${
            failure === null ? "" : " · gave up"
        }`,
    );

    text("order", state.order.map(label).join(" "));

    text("graph6-before", toGraph6(adjacency));
    text("graph6-after", failure === null ? toGraph6(reordered(adjacency, state.order)) : "—");

    const note = document.getElementById("graph6-note");
    if (note) {
        const canonical = failure === null && ambiguous === 0;
        note.className = canonical ? "mt-2 stat" : "mt-2 text-[11.5px] text-accent";
        note.textContent =
            failure !== null
                ? `gave up — ${failure}. The sort is shown as far as it got, but the canonical string does not exist for this graph here.`
                : canonical
                  ? "canonical — every group is a single vertex or a set of twins, and the pinned branches were compared, so this string is the same for every graph isomorphic to this one"
                  : `provisional — ${ambiguous} ${
                        ambiguous === 1 ? "group still has" : "groups still have"
                    } an arbitrary order inside, so this string moves with the labelling`;
    }

    const log = document.getElementById("s2-log");
    if (log) {
        log.innerHTML = state.log
            .map((pass) => {
                const detail =
                    pass.pinned !== undefined
                        ? `out of rings — pin ${label(pass.pinned)} out of #${pass.target ?? "?"}`
                        : pass.depth === 0
                          ? "the red degree"
                          : pass.split === false
                            ? `rings ${pass.depth} — nothing separated`
                            : `rings ${pass.depth} — refine #${pass.target}${
                                  pass.targetSize !== undefined && pass.targetSize > 1
                                      ? `–#${(pass.target ?? 0) + pass.targetSize - 1}`
                                      : ""
                              }`;

                return (
                    `<div class="s2-pass">` +
                    `<h3 class="s2-pass-title">Pass ${pass.pass}</h3>` +
                    `<p class="s2-pass-head">${detail}</p>` +
                    outcomeOf(pass) +
                    `<div class="s2-rows">${pass.blocks.map(blockRow).join("")}</div>` +
                    `</div>`
                );
            })
            .join("");
    }

    renderMatrices(state);
    renderEdges(state);
}

/**
 * One adjacency matrix, in the given order. The axes are always labelled by
 * **position** (`A…R`), because that is what the order means; the tooltip gives
 * the input letter sitting at that position.
 */
function renderMatrixInto(id: string, order: readonly number[]): void {
    const host = document.getElementById(id);
    if (!host) return;

    const size = order.length;
    host.style.gridTemplateColumns = `auto repeat(${size}, minmax(0, 1fr))`;

    let cells = `<span class="m-head"></span>`;
    for (let column = 0; column < size; column++) {
        cells += `<span class="m-head">${label(column)}</span>`;
    }

    for (let row = 0; row < size; row++) {
        cells += `<span class="m-head">${label(row)}</span>`;
        for (let column = 0; column < size; column++) {
            if (row === column) {
                cells += `<span class="m-cell m-cell--self"></span>`;
                continue;
            }

            const red = adjacency[order[row]][order[column]];
            const description = `${label(row)} (${label(order[row])}) ↔ ${label(column)} (${label(
                order[column],
            )}) — ${red ? "red" : "blue"}`;

            cells +=
                `<span class="m-cell${red ? " m-cell--red" : ""}"` +
                ` data-u="${order[row]}" data-v="${order[column]}"` +
                ` title="${description}"></span>`;
        }
    }

    host.innerHTML = cells;
}

/** Both views of the same graph: as numbered, and as sorted. */
function renderMatrices(state: SortState): void {
    const identity = Array.from({ length: adjacency.length }, (_, i) => i);
    renderMatrixInto("matrix-input", identity);
    renderMatrixInto("matrix-canonical", state.order);
}

/** The red edges, as an adjacency list in canonical order, positions 1…n. */
function renderEdges(state: SortState): void {
    const order = state.order;
    const lines: string[] = [];
    let count = 0;

    for (let row = 0; row < order.length; row++) {
        const targets: string[] = [];
        for (let column = row + 1; column < order.length; column++) {
            if (adjacency[order[row]][order[column]]) {
                targets.push(String(column + 1));
                count += 1;
            }
        }
        lines.push(`${String(row + 1).padStart(2, "0")} → ${targets.join(" ")}`);
    }

    text("edge-count", `${count} red edges · ${(order.length * (order.length - 1)) / 2 - count} blue`);
    text("edges", lines.join("\n"));
}


const compareA = document.getElementById("compare-a") as HTMLSelectElement | null;
const compareB = document.getElementById("compare-b") as HTMLSelectElement | null;

/** Fills the two selectors, defaulting to the first pair of a tied group. */
function fillCompareOptions(state: SortState): void {
    if (!compareA || !compareB) return;

    const last = state.log[state.log.length - 1];
    const tied = last.blocks.find((block) => block.members.length > 1 && block.twins !== true);
    const pair = tied?.members.slice(0, 2) ?? [0, 1];

    const options = Array.from(
        { length: adjacency.length },
        (_, index) => `<option value="${index}">${label(index)}</option>`,
    ).join("");

    const previousA = compareA.value;
    const previousB = compareB.value;

    compareA.innerHTML = options;
    compareB.innerHTML = options;

    compareA.value = previousA !== "" && Number(previousA) < adjacency.length ? previousA : String(pair[0] ?? 0);
    compareB.value = previousB !== "" && Number(previousB) < adjacency.length ? previousB : String(pair[1] ?? 1);
}

/** Compares the two chosen nodes ring by ring and prints the trace. */
function renderComparison(): void {
    const host = document.getElementById("compare-trace");
    if (!host || currentState === null || !compareA || !compareB) return;

    const a = Number(compareA.value);
    const b = Number(compareB.value);

    if (a === b) {
        host.innerHTML = `<p class="stat">Pick two different nodes.</p>`;
        return;
    }

    const positions = new Array<number>(adjacency.length).fill(0);
    for (const block of currentState.log[currentState.log.length - 1].blocks) {
        for (const member of block.members) positions[member] = block.start;
    }

    const result = compareNodes(adjacency, positions, a, b, currentState.maxDepth);

    const first = result.rings.find((ring) => !ring.equal);
    const where =
        first?.firstPosition === undefined
            ? ""
            : ` (position #${first.firstPosition.left} vs #${first.firstPosition.right})`;

    const verdict = result.equal
        ? `equal down to ring ${result.rings.length - 1} — nothing separates ${label(a)} from ${label(b)} at this depth`
        : `differ at ring ${result.firstDifference}${where}`;

    const rows = result.rings
        .map(
            (ring) =>
                `<div class="cmp-row${ring.equal ? "" : " cmp-row--diff"}">` +
                `<span class="cmp-ring">ring ${ring.ring}</span>` +
                `<code>${label(a)} ${ring.left}</code>` +
                `<code>${label(b)} ${ring.right}</code>` +
                `<span class="cmp-mark">${ring.equal ? "=" : "≠"}</span>` +
                `</div>`,
        )
        .join("");

    host.innerHTML = `<p class="cmp-verdict">${verdict}</p>${rows}`;
}

function refresh(): void {
    view?.render(adjacency);
    remember();

    try {
        const result = solve(adjacency);
        currentState = result.state;
        renderSignature(result, null);
    } catch (error) {
        const message =
            error instanceof SearchTooLargeError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : "the search gave up";
        currentState = partialSort(adjacency);
        renderSignature({ state: currentState, key: "", branches: 0 }, message);
    }

    if (currentState !== null) {
        fillCompareOptions(currentState);
        renderComparison();
    }
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
    const restored = savedGraph();
    if (restored !== null) {
        n = restored.length;
        adjacency = restored;
        rebuildView();
    } else {
        setNodeCount(MAX_NODES);
    }

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
    compareA?.addEventListener("change", () => renderComparison());
    compareB?.addEventListener("change", () => renderComparison());

    document.getElementById("shuffle-labels")?.addEventListener("click", () => {
        adjacency = relabelled(adjacency);
        refresh();
    });

    // One delegated listener, because the matrices are rebuilt on every refresh.
    for (const id of ["matrix-input", "matrix-canonical"]) {
        document.getElementById(id)?.addEventListener("click", (event) => {
            const cell = (event.target as HTMLElement).closest("[data-u]");
            if (!(cell instanceof HTMLElement)) return;

            const u = Number(cell.dataset.u);
            const v = Number(cell.dataset.v);
            if (!Number.isInteger(u) || !Number.isInteger(v) || u === v) return;

            toggle(u, v);
        });
    }

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
