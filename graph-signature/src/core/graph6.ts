/**
 * graph6 — the standard compact encoding for simple graphs (McKay).
 *
 * Format for n ≤ 62: one header byte (n + 63), then the upper triangle of the
 * adjacency matrix **column by column** — for each j, the rows i < j — packed six
 * bits per byte (each byte + 63). Row by row is the classic mistake: it round-trips
 * against itself, so nothing looks broken until the string leaves the page.
 * Here the encoded graph is the **red** one; blue is its complement.
 */

export function toGraph6(adjacency: readonly (readonly boolean[])[]): string {
    const n = adjacency.length;
    let bits = "";
    for (let j = 1; j < n; j++) {
        for (let i = 0; i < j; i++) bits += adjacency[i][j] ? "1" : "0";
    }

    let out = String.fromCharCode(n + 63);
    for (let i = 0; i < bits.length; i += 6) {
        const chunk = bits.slice(i, i + 6).padEnd(6, "0");
        out += String.fromCharCode(parseInt(chunk, 2) + 63);
    }
    return out;
}

/** Returns null when the string is not a valid graph6 of 0..62 vertices. */
export function fromGraph6(text: string): boolean[][] | null {
    const value = text.trim();
    if (value.length === 0) return null;

    const first = value.charCodeAt(0) - 63;
    if (first < 0 || first > 62 || value.length < 1) return null;

    const n = first;
    const adjacency = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));

    let position = 1;
    let buffer = 0;
    let bitsLeft = 0;

    for (let j = 1; j < n; j++) {
        for (let i = 0; i < j; i++) {
            if (bitsLeft === 0) {
                if (position >= value.length) return null;
                const code = value.charCodeAt(position++) - 63;
                if (code < 0 || code > 63) return null;
                buffer = code;
                bitsLeft = 6;
            }
            bitsLeft -= 1;
            const bit = (buffer >> bitsLeft) & 1;
            adjacency[i][j] = bit === 1;
            adjacency[j][i] = bit === 1;
        }
    }

    return adjacency;
}
