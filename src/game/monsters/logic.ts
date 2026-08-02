/**
 * src/game/monsters/logic.ts
 * --------------------------------------------------------------------------
 * Pure helpers for monster AI + spatial queries. No Phaser / Matter side
 * effects — monster.ts wires these into its per-frame tick.
 */

// easystarjs is a CommonJS module; vitest's ESM loader doesn't always
// expose named exports for CJS packages, so default-import and pull
// off the .js class. Vite handles the same shape via its own CJS
// interop at build time.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import EasyStarPkg from 'easystarjs';
const EasyStarCtor = (EasyStarPkg as unknown as { js: new () => EasyStarInstance }).js;

export type MonsterAIState = 'chase' | 'attack';

/** Subset of easystar.js API we use. Kept local to avoid leaking the
 *  CommonJS interop type into module consumers. */
interface EasyStarInstance {
    enableSync(): void;
    enableDiagonals(): void;
    disableCornerCutting(): void;
    setGrid(grid: number[][]): void;
    setAcceptableTiles(tiles: number[] | number): void;
    setTileCost(tileType: number, cost: number): void;
    findPath(
        sx: number,
        sy: number,
        ex: number,
        ey: number,
        cb: (path: { x: number; y: number }[]) => void,
    ): number;
    /** Drive the queued path calculation forward. Required even in
     *  sync mode — findPath alone queues but never iterates. */
    calculate(): void;
}

/** Euclidean distance between two points. */
export function distBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
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

export class PathfindingService {
    private readonly gridWidth: number;
    private readonly gridHeight: number;
    private readonly cellSize: number;
    /** Wall-only grid (1 = wall, 0 = walkable). The 1-cell safety buffer
     *  used to live here as value 2; it has been removed in favour of
     *  per-monster inflation in findPath() — a buffer zone that's
     *  merely "expensive" is still passable, which is exactly why
     *  monster bodies clipped walls. Inflation makes the buffer
     *  outright blocked for monsters whose body half-extent doesn't
     *  fit. */
    private readonly grid: number[][];
    /** Cached inflated easystar instances, keyed by inflation cell count.
     *  Same inflation → same derived grid → reuse. Each entry already
     *  has its grid + acceptableTiles + tileCost configured. */
    private readonly inflatedEasystars: Map<number, EasyStarInstance> = new Map();

    constructor(
        levelSize: { width: number; height: number },
        airWalls: readonly { points: readonly [number, number][] }[],
        cellSize = 16,
    ) {
        this.cellSize = cellSize;
        this.gridWidth = Math.ceil(levelSize.width / cellSize);
        this.gridHeight = Math.ceil(levelSize.height / cellSize);

        // Initialize empty walkable grid
        this.grid = Array.from({ length: this.gridHeight }, () => Array(this.gridWidth).fill(0));

        // Rasterize air-wall polygons onto grid. Only walls (1) are
        // marked — body-aware inflation is applied per-monster at
        // findPath() time.
        this.rasterizeAirWalls(airWalls);
    }

    /**
     * Build (or fetch from cache) an easystar instance whose grid has
     * every wall cell expanded outward by `inflation` cells in all 8
     * directions. A cell inside that expanded zone is treated as a
     * wall — so the resulting path can only traverse cells where the
     * monster's body rectangle actually fits.
     *
     * `inflation` is in cells; the caller converts from world units.
     * Cached so we don't re-derive the grid every frame.
     */
    private getEasystarForInflation(inflation: number): EasyStarInstance {
        const cached = this.inflatedEasystars.get(inflation);
        if (cached) return cached;
        const derived = this.inflateGrid(Math.max(1, inflation));
        const es = new EasyStarCtor();
        es.enableSync();
        es.enableDiagonals();
        es.disableCornerCutting();
        es.setGrid(derived);
        es.setAcceptableTiles([0]);
        this.inflatedEasystars.set(inflation, es);
        return es;
    }

    /** Return grid where wall cells and body-inflation margin are marked as wall (1). */
    private inflateGrid(radius: number): number[][] {
        const out: number[][] = Array.from({ length: this.gridHeight }, (_, gy) =>
            Array.from({ length: this.gridWidth }, (_, gx) => {
                if (this.grid[gy][gx] === 1) return 1;
                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const ny = gy + dy;
                        const nx = gx + dx;
                        if (
                            ny < 0 ||
                            ny >= this.gridHeight ||
                            nx < 0 ||
                            nx >= this.gridWidth
                        )
                            continue;
                        if (this.grid[ny][nx] === 1) return 1;
                    }
                }
                return 0;
            }),
        );
        return out;
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
    private checkSingleRay(
        start: { x: number; y: number },
        end: { x: number; y: number },
    ): boolean {
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
    hasLineOfSight(
        start: { x: number; y: number },
        end: { x: number; y: number },
        bodyRadius = 10,
    ): boolean {
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
    private smoothPath(
        rawPath: { x: number; y: number }[],
        bodyRadius = 18,
    ): { x: number; y: number }[] {
        if (rawPath.length <= 2) return rawPath;

        const smoothed: { x: number; y: number }[] = [rawPath[0]];
        let curr = 0;

        while (curr < rawPath.length - 1) {
            let next = rawPath.length - 1;
            while (next > curr + 1) {
                if (this.hasLineOfSight(rawPath[curr], rawPath[next], bodyRadius)) {
                    break;
                }
                next--;
            }
            smoothed.push(rawPath[next]);
            curr = next;
        }

        return smoothed;
    }

    /**
     * Pick a unit-vector direction that the monster can actually travel
     * along without immediately running into a wall. Used by the
     * stuck-recovery escape impulse.
     *
     * Strategy: probe 8 directions in order — first opposite to the
     * nearest cardinal of `targetAway` (so the monster steps AWAY from
     * the target on the assumption it overshot into a corner), then
     * sweep clockwise from there. Return the first candidate whose
     * 32-px probe point has a clear LoS from `from`.
     *
     * Pure: no side effects. Returns null if every direction is
     * blocked (deep dead-end — caller should fall back to a different
     * recovery path).
     */
    pickEscapeDirection(
        from: { x: number; y: number },
        targetAway?: { x: number; y: number },
    ): { x: number; y: number } | null {
        // Previous version raycast-probed 32 px in 8 directions. That
        // failed on tight corners: cellSize is 16 px, monsters are
        // 32-40 px wide, and the ray would land inside the monster's
        // own body or in the next cell which is often a wall. Result:
        // every direction rejected → null → fallback to the old
        // constant angle → still ramming the wall.
        //
        // New approach: ask the GRID which of the 8 neighbours of the
        // monster's current cell are walkable (grid !== 1). Pick the
        // walkable neighbour that points MOST away from targetAway.
        // This is a purely grid-level query — no raycast, no probe
        // distance — so it succeeds as long as the monster has any
        // open neighbour at all (which is always true outside a
        // physical dead-end).
        const g = this.worldToGrid(from);
        const myCell = this.grid[g.y]?.[g.x];
        // If the monster's own cell is solid (shouldn't happen but
        // defends against a future refactor that lets A* spawn inside
        // walls), bail out — caller falls back to the constant angle.
        if (myCell === undefined || myCell === 1) return null;

        // Bias order: start at the direction opposite targetAway,
        // sweep clockwise. Same idea as before — pick the neighbour
        // that heads "out of the corner" first.
        const baseAngle = targetAway
            ? Math.atan2(targetAway.y - from.y, targetAway.x - from.x) + Math.PI
            : 0;

        let best: { x: number; y: number } | null = null;
        let bestScore = -Infinity;

        for (let k = 0; k < 8; k++) {
            const ang = baseAngle + (k / 8) * Math.PI * 2;
            // Round to nearest of {-1, 0, 1} — explicit so the round
            // never lands on ±2 when cos/sin drift past 0.5 in the
            // wrong direction.
            const stepX = Math.max(-1, Math.min(1, Math.round(Math.cos(ang))));
            const stepY = Math.max(-1, Math.min(1, Math.round(Math.sin(ang))));
            const nx = g.x + stepX;
            const ny = g.y + stepY;
            if (nx < 0 || nx >= this.gridWidth) continue;
            if (ny < 0 || ny >= this.gridHeight) continue;
            const cell = this.grid[ny][nx];
            if (cell === 1) continue; // solid wall

            // Score: how much this direction points away from
            // targetAway. Higher = better. Using (1 - alignment)
            // means cells directly opposite the target score ~2,
            // perpendicular score ~1, toward-target score ~0.
            const dirX = Math.cos(ang);
            const dirY = Math.sin(ang);
            let score = 1;
            if (targetAway) {
                const tx = targetAway.x - from.x;
                const ty = targetAway.y - from.y;
                const tlen = Math.hypot(tx, ty);
                if (tlen > 0) {
                    const alignment = (dirX * tx + dirY * ty) / tlen;
                    score = 1 - alignment; // [-1..2]
                }
            }
            if (score > bestScore) {
                bestScore = score;
                best = { x: dirX, y: dirY };
            }
        }
        return best;
    }

    /**
     * Skip leading waypoints that sit in the 1-cell buffer zone
     * (grid === 2). The first chase step heading along the A* path
     * shouldn't be a buffer-zone waypoint hugging the wall — that's
     * exactly what makes a monster grind along a wall edge. Pure:
     * returns the new index, clamped to the last waypoint.
     */
    skipBufferZoneWaypoints(path: readonly { x: number; y: number }[], startIdx: number): number {
        if (!path || path.length === 0) return 0;
        return Math.max(0, Math.min(path.length - 1, startIdx));
    }

    /**
     * A* pathfinding with body-aware inflation. Returns world positions or null.
     *
     * @param start       World position. Use the monster foot (body centre +
     *                    halfH) so waypoints clear walls.
     * @param end         World position.
     * @param bodyHalfW   Monster body half-width in world units.
     * @param bodyHalfH   Monster body half-height in world units.
     * @param safety      Multiplier on body extents (1.3 = 30% padding).
     */
    findPath(
        start: { x: number; y: number },
        end: { x: number; y: number },
        bodyHalfW = 0,
        bodyHalfH = 0,
        _safety = 1.0,
    ): { x: number; y: number }[] | null {
        // Set inflation = 0 for 100% flush wall alignment (green body box touches wall edge)
        const result = this.findPathWithInflation(start, end, bodyHalfW, bodyHalfH, 0);
        if (result !== null) return result;
        return [start, end];
    }

    /** Inner findPath with a fixed inflation. Returns null when A*
     *  can't reach — caller decides whether to retry with smaller
     *  inflation. */
    private findPathWithInflation(
        start: { x: number; y: number },
        end: { x: number; y: number },
        bodyHalfW: number,
        bodyHalfH: number,
        inflation: number,
    ): { x: number; y: number }[] | null {
        // Snap start/end onto the inflated grid so a monster spawned
        // flush against a wall still gets a valid path.
        const startG = this.snapToWalkable(this.worldToGrid(start), inflation);
        const endG = this.snapToWalkable(this.worldToGrid(end), inflation);

        if (startG.x === endG.x && startG.y === endG.y) {
            return [end];
        }

        const es = this.getEasystarForInflation(inflation);
        let result: { x: number; y: number }[] | null = null;
        let found = false;
        es.findPath(
            startG.x,
            startG.y,
            endG.x,
            endG.y,
            (path: { x: number; y: number }[]) => {
                if (!path || path.length === 0) return;
                const worldPoints = path.map((p) => this.gridToWorldFlush(p, bodyHalfW, bodyHalfH));
                worldPoints[0] = start;
                const bodyRadius = Math.max(bodyHalfW, bodyHalfH);
                result = this.smoothPath(worldPoints, bodyRadius);
                found = true;
            },
        );
        es.calculate();
        return found ? result : null;
    }

    /** Convert grid cell to world coordinate adjusted flush to adjacent wall edges (zero gap, zero overlap). */
    private gridToWorldFlush(
        gridPos: PathGridPoint,
        bodyHalfW: number,
        bodyHalfH: number,
    ): { x: number; y: number } {
        let x = gridPos.x * this.cellSize + this.cellSize / 2;
        let y = gridPos.y * this.cellSize + this.cellSize / 2;

        if (bodyHalfW <= 0 && bodyHalfH <= 0) return { x, y };

        // Align X flush with right wall
        if (this.grid[gridPos.y]?.[gridPos.x + 1] === 1) {
            x = (gridPos.x + 1) * this.cellSize - bodyHalfW;
        }
        // Align X flush with left wall
        else if (this.grid[gridPos.y]?.[gridPos.x - 1] === 1) {
            x = gridPos.x * this.cellSize + bodyHalfW;
        }

        // Align Y flush with bottom wall
        if (this.grid[gridPos.y + 1]?.[gridPos.x] === 1) {
            y = (gridPos.y + 1) * this.cellSize - bodyHalfH;
        }
        // Align Y flush with top wall
        else if (this.grid[gridPos.y - 1]?.[gridPos.x] === 1) {
            y = gridPos.y * this.cellSize + bodyHalfH;
        }

        return { x, y };
    }



    /** If a grid cell sits on an inflated wall, walk outward to the nearest
     *  non-wall cell in the same inflation's grid. Prevents null results
     *  when the endpoint or start is on a wall. */
    private snapToWalkable(
        start: PathGridPoint,
        inflation: number,
        maxRadius = 2,
    ): PathGridPoint {
        const inflated = this.inflateGrid(inflation);
        const w = inflated[0]?.length ?? 0;
        const h = inflated.length;
        if (start.x >= 0 && start.x < w && start.y >= 0 && start.y < h) {
            if (inflated[start.y][start.x] === 0) return start;
        }
        // Spiral outward up to maxRadius cells to find a walkable cell.
        // Capped so a monster spawned flush against a wall doesn't get
        // its A* start teleported across the map — the first waypoint
        // would then be several cells away from the actual body and
        // the gap looks like a glitch.
        const cap = Math.min(maxRadius, Math.max(w, h));
        for (let r = 1; r <= cap; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                    const nx = start.x + dx;
                    const ny = start.y + dy;
                    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                    if (inflated[ny][nx] === 0) return { x: nx, y: ny };
                }
            }
        }
        // No walkable cell within maxRadius — return the original
        // start (may be on a wall). A* will likely fail, then the
        // outer fallback retries with smaller inflation.
        return start;
    }



    /** Simple Point-in-Polygon check (Ray casting). */
    private pointInPolygon(px: number, py: number, poly: readonly [number, number][]): boolean {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0],
                yi = poly[i][1];
            const xj = poly[j][0],
                yj = poly[j][1];
            const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
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
export function pickClosestMonster<
    M extends { dead: boolean; body: { position: { x: number; y: number } } },
>(point: { x: number; y: number }, monsters: readonly M[], maxDist: number): M | null {
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
export function calcSeparationForce<
    M extends { dead: boolean; body: { position: { x: number; y: number } } },
>(current: M, allMonsters: readonly M[], radius = 32, maxForce = 1.0): { x: number; y: number } {
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
export function getSurroundOffset(
    monsterIndex: number,
    totalMonsters: number,
    radius = 28,
): { x: number; y: number } {
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
    if (currentIdx >= path.length)
        return { target: path[path.length - 1], nextIdx: path.length - 1 };

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
