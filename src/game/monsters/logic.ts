/**
 * src/game/monsters/logic.ts
 * --------------------------------------------------------------------------
 * Pure helpers for monster AI + spatial queries. No Phaser / Matter side
 * effects — monster.ts wires these into its per-frame tick.
 */

export type MonsterAIState = 'chase' | 'attack';

/** Euclidean distance between two points. */
export function distBetween(
    a: { x: number; y: number },
    b: { x: number; y: number },
): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Unit vector pointing from `from` toward `to`. Returns zero vector when
 * the points coincide (caller should check distance first or treat zero
 * as "no movement").
 */
export function dirTo(
    from: { x: number; y: number },
    to: { x: number; y: number },
): { x: number; y: number } {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return { x: 0, y: 0 };
    return { x: dx / len, y: dy / len };
}

/**
 * Decide the monster's AI state from distance + attack range.
 * `attack` only fires when the player is within range; otherwise `chase`.
 */
export function decideAIState(dist: number, attackRange: number): MonsterAIState {
    return dist <= attackRange ? 'attack' : 'chase';
}

/** Velocity for chasing the player at a given move speed. */
export function chaseVelocity(
    dirToPlayer: { x: number; y: number },
    moveSpeed: number,
): { vx: number; vy: number } {
    return {
        vx: dirToPlayer.x * moveSpeed,
        vy: dirToPlayer.y * moveSpeed,
    };
}

/**
 * Grid-based Pathfinding Service using pure TypeScript A* (Zero extra npm dependencies).
 * Rasterizes polygon air-walls into a low-resolution grid for fast A* queries.
 */
export interface PathGridPoint {
    x: number;
    y: number;
}

interface AStarNode {
    x: number;
    y: number;
    g: number;
    h: number;
    f: number;
    parent: AStarNode | null;
}

export class PathfindingService {
    private readonly gridWidth: number;
    private readonly gridHeight: number;
    private readonly cellSize: number;
    private readonly grid: number[][]; // 0: walkable, 1: blocked

    constructor(
        levelSize: { width: number; height: number },
        airWalls: readonly { points: readonly [number, number][] }[],
        cellSize = 24,
    ) {
        this.cellSize = cellSize;
        this.gridWidth = Math.ceil(levelSize.width / cellSize);
        this.gridHeight = Math.ceil(levelSize.height / cellSize);

        // Initialize empty walkable grid
        this.grid = Array.from({ length: this.gridHeight }, () =>
            Array(this.gridWidth).fill(0),
        );

        // Rasterize air-wall polygons onto grid with boundary padding
        this.rasterizeAirWalls(airWalls);
    }

    /** Convert world coordinates (pixels) to grid coordinates. */
    worldToGrid(pos: { x: number; y: number }): PathGridPoint {
        return {
            x: Math.max(0, Math.min(this.gridWidth - 1, Math.floor(pos.x / this.cellSize))),
            y: Math.max(0, Math.min(this.gridHeight - 1, Math.floor(pos.y / this.cellSize))),
        };
    }

    /** Convert grid coordinates back to world coordinates (cell center). */
    gridToWorld(gridPos: PathGridPoint): { x: number; y: number } {
        return {
            x: gridPos.x * this.cellSize + this.cellSize / 2,
            y: gridPos.y * this.cellSize + this.cellSize / 2,
        };
    }

    /** Synchronous pure A* pathfinding. Returns array of world positions or null. */
    findPath(
        start: { x: number; y: number },
        end: { x: number; y: number },
    ): { x: number; y: number }[] | null {
        const startG = this.worldToGrid(start);
        const endG = this.worldToGrid(end);

        if (startG.x === endG.x && startG.y === endG.y) {
            return [end];
        }

        const openList: AStarNode[] = [];
        const closedSet = new Set<string>();

        const getKey = (x: number, y: number) => `${x},${y}`;
        const heuristic = (x1: number, y1: number, x2: number, y2: number) =>
            Math.hypot(x2 - x1, y2 - y1);

        const startNode: AStarNode = {
            x: startG.x,
            y: startG.y,
            g: 0,
            h: heuristic(startG.x, startG.y, endG.x, endG.y),
            f: 0,
            parent: null,
        };
        startNode.f = startNode.g + startNode.h;
        openList.push(startNode);

        // Directions: 8-way movement (orthogonals + diagonals)
        const neighbors = [
            { x: 0, y: -1, cost: 1 },
            { x: 1, y: 0, cost: 1 },
            { x: 0, y: 1, cost: 1 },
            { x: -1, y: 0, cost: 1 },
            { x: 1, y: -1, cost: 1.414 },
            { x: 1, y: 1, cost: 1.414 },
            { x: -1, y: 1, cost: 1.414 },
            { x: -1, y: -1, cost: 1.414 },
        ];

        let maxSteps = 1500;

        while (openList.length > 0 && maxSteps-- > 0) {
            // Pick lowest f node
            let currentIdx = 0;
            for (let i = 1; i < openList.length; i++) {
                if (openList[i].f < openList[currentIdx].f) {
                    currentIdx = i;
                }
            }

            const current = openList[currentIdx];

            if (current.x === endG.x && current.y === endG.y) {
                // Reconstruct path
                const rawPath: PathGridPoint[] = [];
                let curr: AStarNode | null = current;
                while (curr) {
                    rawPath.unshift({ x: curr.x, y: curr.y });
                    curr = curr.parent;
                }
                return rawPath.map((p) => this.gridToWorld(p));
            }

            openList.splice(currentIdx, 1);
            closedSet.add(getKey(current.x, current.y));

            for (const n of neighbors) {
                const nx = current.x + n.x;
                const ny = current.y + n.y;

                if (
                    nx < 0 ||
                    nx >= this.gridWidth ||
                    ny < 0 ||
                    ny >= this.gridHeight ||
                    this.grid[ny][nx] === 1
                ) {
                    continue;
                }

                if (closedSet.has(getKey(nx, ny))) continue;

                const gScore = current.g + n.cost;
                let neighborNode = openList.find((node) => node.x === nx && node.y === ny);

                if (!neighborNode) {
                    neighborNode = {
                        x: nx,
                        y: ny,
                        g: gScore,
                        h: heuristic(nx, ny, endG.x, endG.y),
                        f: 0,
                        parent: current,
                    };
                    neighborNode.f = neighborNode.g + neighborNode.h;
                    openList.push(neighborNode);
                } else if (gScore < neighborNode.g) {
                    neighborNode.g = gScore;
                    neighborNode.f = neighborNode.g + neighborNode.h;
                    neighborNode.parent = current;
                }
            }
        }

        return null;
    }

    /** Simple Point-in-Polygon check (Ray casting). */
    private pointInPolygon(px: number, py: number, poly: readonly [number, number][]): boolean {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0], yi = poly[i][1];
            const xj = poly[j][0], yj = poly[j][1];
            const intersect =
                yi > py !== yj > py &&
                px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
            if (intersect) inside = !inside;
        }
        return inside;
    }

    private rasterizeAirWalls(airWalls: readonly { points: readonly [number, number][] }[]): void {
        for (let gy = 0; gy < this.gridHeight; gy++) {
            const worldY = gy * this.cellSize + this.cellSize / 2;
            for (let gx = 0; gx < this.gridWidth; gx++) {
                const worldX = gx * this.cellSize + this.cellSize / 2;
                for (const wall of airWalls) {
                    if (wall.points.length >= 3 && this.pointInPolygon(worldX, worldY, wall.points)) {
                        this.grid[gy][gx] = 1;
                        break;
                    }
                }
            }
        }
    }
}

/**
 * Find the alive monster closest to a reference point within `maxDist`.
 * Caller pre-filters by kind if needed (e.g. melee-only for contact damage).
 * Pure: returns null if nothing matches.
 */
export function pickClosestMonster<M extends { dead: boolean; body: { position: { x: number; y: number } } }>(
    point: { x: number; y: number },
    monsters: readonly M[],
    maxDist: number,
): M | null {
    let best: M | null = null;
    let bestDistSq = maxDist * maxDist;
    for (const m of monsters) {
        if (m.dead) continue;
        const mp = m.body.position;
        const dx = point.x - mp.x;
        const dy = point.y - mp.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDistSq) {
            bestDistSq = d2;
            best = m;
        }
    }
    return best;
}