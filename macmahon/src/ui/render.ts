/** Rendu SVG des pièces et des plateaux. */
import { COLOR_HEX, ORI } from "../core/pieces.ts";

const TRIANGLES = [
    "M0 0 L100 0 L50 50 Z", // nord
    "M100 0 L100 100 L50 50 Z", // est
    "M100 100 L0 100 L50 50 Z", // sud
    "M0 100 L0 0 L50 50 Z", // ouest
];

const INK = "#191712";

export function edgesOf(code: number): number[] {
    const b = code * 4;
    return [ORI[b], ORI[b + 1], ORI[b + 2], ORI[b + 3]];
}

export function pieceSvg(edges: readonly number[], strokeWidth = 1.4): string {
    let paths = "";
    for (let i = 0; i < 4; i++) {
        paths += `<path d="${TRIANGLES[i]}" fill="${COLOR_HEX[edges[i]]}"/>`;
    }
    return (
        `<svg viewBox="0 0 100 100" role="img" aria-hidden="true" shape-rendering="crispEdges">` +
        `<g stroke="${INK}" stroke-width="${strokeWidth}" stroke-linejoin="miter">${paths}</g>` +
        `<rect x="0.7" y="0.7" width="98.6" height="98.6" fill="none" stroke="${INK}" stroke-width="1.4"/>` +
        `</svg>`
    );
}

/** Plateau complet à partir d'une liste de codes (pièce * 4 + orientation). */
export function boardSvg(codes: readonly number[], width: number, strokeWidth = 1.1): string {
    let html = "";
    for (const code of codes) {
        html += pieceSvg(edgesOf(code), strokeWidth);
    }
    return `<div class="board__grid" style="grid-template-columns:repeat(${width},1fr)">${html}</div>`;
}

/** Plateau à partir de quadruplets d'arêtes déjà orientés. */
export function boardSvgFromEdges(
    edges: readonly (readonly number[])[],
    width: number,
    strokeWidth = 1.1,
): string {
    let html = "";
    for (const e of edges) html += pieceSvg(e, strokeWidth);
    return `<div class="board__grid" style="grid-template-columns:repeat(${width},1fr)">${html}</div>`;
}
