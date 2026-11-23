/** SVG rendering of a complete graph on a circle, with click-to-toggle edges. */

const SIZE = 640;
const RADIUS = 252;
const CENTER = SIZE / 2;
const NODE_RADIUS = 13;
const HIT_DISTANCE = 11;

const RED = "#c0392b";
const BLUE = "#2f6f8f";

interface Point {
    x: number;
    y: number;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    let t = lengthSquared === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return Math.hypot(p.x - projX, p.y - projY);
}

export class GraphView {
    private readonly svg: SVGSVGElement;
    private readonly positions: Point[] = [];
    private readonly lines = new Map<string, SVGLineElement>();
    private highlighted: SVGLineElement | null = null;

    constructor(
        host: HTMLElement,
        private readonly n: number,
        private readonly onToggle: (i: number, j: number) => void,
    ) {
        host.innerHTML = "";
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
        this.svg.setAttribute("class", "graph");
        host.appendChild(this.svg);

        for (let i = 0; i < n; i++) {
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
            this.positions.push({
                x: CENTER + RADIUS * Math.cos(angle),
                y: CENTER + RADIUS * Math.sin(angle),
            });
        }

        this.svg.addEventListener("click", (event) => this.handleClick(event));
        this.svg.addEventListener("mousemove", (event) => this.handleMove(event));
        this.svg.addEventListener("mouseleave", () => this.clearHighlight());
    }

    render(adjacency: readonly (readonly boolean[])[]): void {
        this.svg.innerHTML = "";
        this.lines.clear();
        this.highlighted = null;

        for (let i = 0; i < this.n; i++) {
            for (let j = i + 1; j < this.n; j++) {
                const a = this.positions[i];
                const b = this.positions[j];
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", String(a.x));
                line.setAttribute("y1", String(a.y));
                line.setAttribute("x2", String(b.x));
                line.setAttribute("y2", String(b.y));
                line.setAttribute("stroke", adjacency[i][j] ? RED : BLUE);
                line.setAttribute("stroke-width", "2");
                line.setAttribute("stroke-linecap", "round");
                line.setAttribute("opacity", "0.85");
                this.svg.appendChild(line);
                this.lines.set(`${i}-${j}`, line);
            }
        }

        for (let i = 0; i < this.n; i++) {
            const p = this.positions[i];
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", String(p.x));
            circle.setAttribute("cy", String(p.y));
            circle.setAttribute("r", String(NODE_RADIUS));
            circle.setAttribute("fill", "#f4efe6");
            circle.setAttribute("stroke", "#191712");
            circle.setAttribute("stroke-width", "1.5");
            this.svg.appendChild(circle);

            const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
            label.setAttribute("x", String(p.x));
            label.setAttribute("y", String(p.y + 4));
            label.setAttribute("text-anchor", "middle");
            label.setAttribute("font-family", "ui-monospace, monospace");
            label.setAttribute("font-size", "12");
            label.setAttribute("fill", "#191712");
            label.textContent = String.fromCharCode(65 + i);
            this.svg.appendChild(label);
        }
    }

    private pointFrom(event: MouseEvent): Point {
        const rect = this.svg.getBoundingClientRect();
        return {
            x: ((event.clientX - rect.left) / rect.width) * SIZE,
            y: ((event.clientY - rect.top) / rect.height) * SIZE,
        };
    }

    private nearestEdge(point: Point): { i: number; j: number; distance: number } | null {
        let best: { i: number; j: number; distance: number } | null = null;
        for (let i = 0; i < this.n; i++) {
            for (let j = i + 1; j < this.n; j++) {
                const distance = distanceToSegment(point, this.positions[i], this.positions[j]);
                if (!best || distance < best.distance) best = { i, j, distance };
            }
        }
        return best;
    }

    private handleClick(event: MouseEvent): void {
        const nearest = this.nearestEdge(this.pointFrom(event));
        if (nearest && nearest.distance <= HIT_DISTANCE) {
            this.onToggle(nearest.i, nearest.j);
        }
    }

    private handleMove(event: MouseEvent): void {
        const nearest = this.nearestEdge(this.pointFrom(event));
        const target =
            nearest && nearest.distance <= HIT_DISTANCE
                ? this.lines.get(`${nearest.i}-${nearest.j}`) ?? null
                : null;

        if (target === this.highlighted) return;
        this.clearHighlight();
        if (target) {
            target.setAttribute("stroke-width", "5");
            target.setAttribute("opacity", "1");
            this.highlighted = target;
        }
    }

    private clearHighlight(): void {
        if (!this.highlighted) return;
        this.highlighted.setAttribute("stroke-width", "2");
        this.highlighted.setAttribute("opacity", "0.85");
        this.highlighted = null;
    }
}
