import { describe, expect, it } from "vitest";
import { solve } from "./signature2.ts";
import { toGraph6 } from "./graph6.ts";

/**
 * The cost of the signature is the number of branches the search visits, which
 * is deterministic — no wall clock, so the answer is the same on every machine.
 * This test enumerates every labelled graph of order 6 and reports the one that
 * costs the most.
 */
function* labelledGraphs(n: number): Generator<boolean[][]> {
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);

    for (let mask = 0; mask < 1 << pairs.length; mask++) {
        const matrix = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
        for (let bit = 0; bit < pairs.length; bit++) {
            if ((mask & (1 << bit)) !== 0) {
                const [a, b] = pairs[bit];
                matrix[a][b] = true;
                matrix[b][a] = true;
            }
        }
        yield matrix;
    }
}

describe("the worst graph of order 6", () => {
    it("finds the colouring that costs the most branches", () => {
        let worst = { branches: 0, graph6: "" };
        let count = 0;

        for (const matrix of labelledGraphs(6)) {
            count += 1;
            const result = solve(matrix);
            if (result.branches > worst.branches) {
                worst = { branches: result.branches, graph6: toGraph6(matrix) };
            }
        }

        console.log(`order 6: ${count} labelled graphs, worst = ${worst.branches} branches, ${worst.graph6}`);

        expect(count).toBe(32768);
        // 6! is the absolute ceiling for a search that pins one vertex at a time.
        expect(worst.branches).toBeLessThanOrEqual(720);
        expect(worst.branches).toBeGreaterThan(1);
    });
});
