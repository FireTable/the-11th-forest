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
        cellSize = 16,
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

    /** Helper for single raycast check on grid. */
    private checkSingleRay(start: { x: number; y: number }, end: { x: number; y: number }): boolean {
        const p1 = this.worldToGrid(start);
        const p2 = this.worldToGrid(end);

        let x0 = p1.x;
        let y0 = p1.y;
        const x1 = p2.x;
        const y1 = p2.y;

        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            const gx = Math.max(0, Math.min(this.gridWidth - 1, x0));
            const gy = Math.max(0, Math.min(this.gridHeight - 1, y0));
            if (this.grid[gy][gx] === 1) return false;

            if (x0 === x1 && y0 === y1) break;

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
        }
        return true;
    }

    /** Check line-of-sight raycast between two world positions with body corridor clearance. */
    hasLineOfSight(start: { x: number; y: number }, end: { x: number; y: number }, bodyRadius = 10): boolean {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return true;

        // Check center ray
        if (!this.checkSingleRay(start, end)) return false;

        if (bodyRadius <= 0) return true;

        // Normal perpendicular vector for offset parallel rays
        const nx = (-dy / len) * bodyRadius;
        const ny = (dx / len) * bodyRadius;

        // Check left and right parallel rays
        const leftStart = { x: start.x + nx, y: start.y + ny };
        const leftEnd = { x: end.x + nx, y: end.y + ny };
        if (!this.checkSingleRay(leftStart, leftEnd)) return false;

        const rightStart = { x: start.x - nx, y: start.y - ny };
        const rightEnd = { x: end.x - nx, y: end.y - ny };
        if (!this.checkSingleRay(rightStart, rightEnd)) return false;

        return true;
    }

    /** Smooths raw A* path by skipping intermediate waypoints using line-of-sight raycasts. */
    private smoothPath(rawPath: { x: number; y: number }[]): { x: number; y: number }[] {
        if (rawPath.length <= 2) return rawPath;

        const smoothed: { x: number; y: number }[] = [rawPath[0]];
        let curr = 0;

        while (curr < rawPath.length - 1) {
            let next = rawPath.length - 1;
            // Look ahead for the farthest reachable waypoint with clear line of sight
            while (next > curr + 1) {
                if (this.hasLineOfSight(rawPath[curr], rawPath[next])) {
                    break;
                }
                next--;
            }
            smoothed.push(rawPath[next]);
            curr = next;
        }

        return smoothed;
    }

    /** Synchronous pure A* pathfinding with string-pulling smoothing. Returns world positions or null. */
    findPath(
        start: { x: number; y: number },
        end: { x: number; y: number },
    ): { x: number; y: number }[] | null {
        const startG = this.worldToGrid(start);
        const endG = this.worldToGrid(end);

        if (startG.x === endG.x && startG.y === endG.y) {
            return [end];
        }

        // Fast path: direct line of sight bypasses grid search completely
        if (this.hasLineOfSight(start, end)) {
            return [start, end];
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
                const worldPoints = rawPath.map((p) => this.gridToWorld(p));
                return this.smoothPath(worldPoints);
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

                // Prevent diagonal corner cutting into walls
                if (n.x !== 0 && n.y !== 0) {
                    if (this.grid[current.y][nx] === 1 || this.grid[ny][current.x] === 1) {
                        continue;
                    }
                }

                if (closedSet.has(getKey(nx, ny))) continue;

                const stepCost = this.grid[ny][nx] === 2 ? n.cost * 2.5 : n.cost;
                const gScore = current.g + stepCost;
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
        const half = this.cellSize / 2;
        const offsets = [
            { x: 0, y: 0 },
            { x: -half * 0.7, y: -half * 0.7 },
            { x: half * 0.7, y: -half * 0.7 },
            { x: -half * 0.7, y: half * 0.7 },
            { x: half * 0.7, y: half * 0.7 },
        ];

        // 1. Mark solid walls (value 1)
        for (let gy = 0; gy < this.gridHeight; gy++) {
            const worldY = gy * this.cellSize + half;
            for (let gx = 0; gx < this.gridWidth; gx++) {
                const worldX = gx * this.cellSize + half;
                let isBlocked = false;
                for (const wall of airWalls) {
                    if (wall.points.length < 3) continue;
                    for (const off of offsets) {
                        if (this.pointInPolygon(worldX + off.x, worldY + off.y, wall.points)) {
                            isBlocked = true;
                            break;
                        }
                    }
                    if (isBlocked) break;
                }
                if (isBlocked) {
                    this.grid[gy][gx] = 1;
                }
            }
        }

        // 2. Mark 1-cell safety buffer zone around solid walls (value 2)
        for (let gy = 0; gy < this.gridHeight; gy++) {
            for (let gx = 0; gx < this.gridWidth; gx++) {
                if (this.grid[gy][gx] === 1) continue;

                let isNearWall = false;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const ny = gy + dy;
                        const nx = gx + dx;
                        if (ny >= 0 && ny < this.gridHeight && nx >= 0 && nx < this.gridWidth) {
                            if (this.grid[ny][nx] === 1) {
                                isNearWall = true;
                                break;
                            }
                        }
                    }
                    if (isNearWall) break;
                }

                if (isNearWall) {
                    this.grid[gy][gx] = 2; // Buffer zone (16px)
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

/**
 * Calculate separation (repulsion) vector to prevent monsters from stacking or blocking each other.
 */
export function calcSeparationForce<M extends { dead: boolean; body: { position: { x: number; y: number } } }>(
    current: M,
    allMonsters: readonly M[],
    radius = 32,
    maxForce = 1.0,
): { x: number; y: number } {
    if (current.dead) return { x: 0, y: 0 };
    const myPos = current.body.position;
    let pushX = 0;
    let pushY = 0;
    let count = 0;

    for (const other of allMonsters) {
        if (other === current || other.dead) continue;
        const otherPos = other.body.position;
        const dx = myPos.x - otherPos.x;
        const dy = myPos.y - otherPos.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0 && dist < radius) {
            const factor = 1 - dist / radius;
            pushX += (dx / dist) * factor;
            pushY += (dy / dist) * factor;
            count++;
        }
    }

    if (count === 0) return { x: 0, y: 0 };

    const len = Math.hypot(pushX, pushY);
    if (len === 0) return { x: 0, y: 0 };

    const scale = Math.min(len, 1) * maxForce;
    return {
        x: (pushX / len) * scale,
        y: (pushY / len) * scale,
    };
}

/**
 * Calculate surround slot position around player for a monster index to avoid single-file bottlenecks.
 */
export function getSurroundOffset(monsterIndex: number, totalMonsters: number, radius = 28): { x: number; y: number } {
    if (totalMonsters <= 1) return { x: 0, y: 0 };
    const angle = (monsterIndex / totalMonsters) * Math.PI * 2;
    return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
    };
}

/**
 * Look-ahead target interpolation along a waypoint path for smooth curve steering (Pure Pursuit).
 */
export function getPathLookAheadPoint(
    currentPos: { x: number; y: number },
    path: readonly { x: number; y: number }[],
    currentIdx: number,
    lookAheadDist = 12,
    checkLoS?: (p1: { x: number; y: number }, p2: { x: number; y: number }) => boolean,
): { target: { x: number; y: number }; nextIdx: number } {
    if (!path || path.length === 0) return { target: currentPos, nextIdx: currentIdx };
    if (currentIdx >= path.length) return { target: path[path.length - 1], nextIdx: path.length - 1 };

    let idx = currentIdx;
    while (idx < path.length - 1 && distBetween(currentPos, path[idx]) < 12) {
        idx++;
    }

    const currWp = path[idx];
    const distToWp = distBetween(currentPos, currWp);

    if (distToWp >= lookAheadDist || idx >= path.length - 1) {
        return { target: currWp, nextIdx: idx };
    }

    const nextWp = path[idx + 1];
    const segDir = dirTo(currWp, nextWp);
    const remain = lookAheadDist - distToWp;
    const candidate = {
        x: currWp.x + segDir.x * remain,
        y: currWp.y + segDir.y * remain,
    };

    if (checkLoS && !checkLoS(currentPos, candidate)) {
        return { target: currWp, nextIdx: idx };
    }

    return {
        target: candidate,
        nextIdx: idx,
    };
}