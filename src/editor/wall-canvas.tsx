import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Layer, Line, Stage } from 'react-konva';
import type Konva from 'konva';

import { movePoint, removePoint } from '@/lib/editor/air-walls';
import { isMeaningfulPolygon } from '@/lib/editor/polygon';
import type { AirWall, AirWallVertex, Level } from '@/lib/levels/types';

/**
 * src/editor/wall-canvas.tsx
 * --------------------------------------------------------------------------
 * Konva overlay above the Phaser canvas. Renders air walls + their
 * vertex handles, and owns the click-to-draw UX for new polygons.
 *
 * Why Konva and not Phaser Graphics:
 *   - Built-in drag handles (drag a vertex circle → moves the polygon)
 *   - Cleaner state model for editor UX (Transformer, hit detection)
 *   - Keeps Phaser scene focused on background-only rendering
 *
 * Layout:
 *   Phaser's Scale.CENTER_BOTH places the canvas at the center of
 *   #game-container — it isn't always at top-left, so we measure the
 *   canvas's actual bounding rect and align the Stage to it. Coords in
 *   image pixel space are scaled to display space via `imageToDisplay`.
 */

interface Props {
    level: Level;
    drawing: boolean;
    onLevelChange: (next: Level) => void;
    /** Called when the user closes a draft polygon by clicking near vertex 0. */
    onAirWallDrawn: (points: AirWallVertex[]) => void;
}

const CLOSE_TOLERANCE_PX = 16;
const HANDLE_RADIUS = 4;
const DRAFT_POINT_RADIUS = 5;

const COLORS = {
    tallFill: 'rgba(255, 51, 68, 0.4)',
    tallStroke: '#ff3344',
    shortFill: 'rgba(51, 136, 255, 0.4)',
    shortStroke: '#3388ff',
    draftLine: '#00ffff',
    handleFill: 'rgba(0, 255, 255, 0.55)',
    handleStroke: 'rgba(0, 0, 0, 0.6)',
} as const;

interface StageBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function WallCanvas({ level, drawing, onLevelChange, onAirWallDrawn }: Props) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState<StageBox>({ x: 0, y: 0, width: 0, height: 0 });
    const [draftPoints, setDraftPoints] = useState<AirWallVertex[]>([]);
    const draftPointsRef = useRef<AirWallVertex[]>([]);
    draftPointsRef.current = draftPoints;

    useEffect(() => {
        const wrapper = wrapperRef.current;
        const container = document.getElementById('game-container');
        if (!wrapper || !container) return;

        // Locate the Phaser canvas — direct child of #game-container.
        // Phaser wraps the canvas in a div for its Scale.FIT transform;
        // grabbing any descendant canvas would catch either the Phaser
        // canvas or our own Konva canvas depending on mount order.
        // `:scope > canvas` excludes our portal-wrapped Konva canvas.
        const phaserCanvas = container.querySelector<HTMLCanvasElement>(':scope > canvas');
        if (!phaserCanvas) return;

        const update = () => {
            // Read the canvas's bounding rect AFTER Phaser has applied its
            // CSS transform — that's the on-screen rect we need to match.
            const cRect = phaserCanvas.getBoundingClientRect();
            const wRect = wrapper.getBoundingClientRect();
            setBox({
                x: cRect.left - wRect.left,
                y: cRect.top - wRect.top,
                width: cRect.width,
                height: cRect.height,
            });
        };

        update();
        const ro = new ResizeObserver(update);
        ro.observe(container);
        ro.observe(phaserCanvas);
        return () => ro.disconnect();
    }, []);

    // image → display scale (same math as Phaser Scale.FIT).
    const scale = useMemo(() => {
        if (box.width === 0 || box.height === 0) return 1;
        return Math.min(
            box.width / level.imageSize.width,
            box.height / level.imageSize.height,
        );
    }, [box, level.imageSize]);

    function handleStagePointer(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
        if (!drawing) return;
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;
        const imgX = Math.round(pos.x / scale);
        const imgY = Math.round(pos.y / scale);
        const current = draftPointsRef.current;

        if (current.length >= 3) {
            const [fx, fy] = current[0];
            const dx = imgX - fx;
            const dy = imgY - fy;
            if (dx * dx + dy * dy < CLOSE_TOLERANCE_PX ** 2) {
                if (isMeaningfulPolygon(current)) {
                    onAirWallDrawn(current);
                }
                setDraftPoints([]);
                return;
            }
        }

        const last = current[current.length - 1];
        if (last && last[0] === imgX && last[1] === imgY) return;
        setDraftPoints([...current, [imgX, imgY]]);
    }

    function handleEscape(e: KeyboardEvent) {
        if (e.key === 'Escape') setDraftPoints([]);
    }
    useEffect(() => {
        if (!drawing) return;
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawing]);

    return (
        <div
            ref={wrapperRef}
            className="absolute inset-0 pointer-events-none"
        >
            {box.width > 0 && box.height > 0 && (
                <div
                    className="pointer-events-auto absolute"
                    style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
                >
                    <Stage
                        width={box.width}
                        height={box.height}
                        onClick={handleStagePointer}
                        onTap={handleStagePointer}
                    >
                    <Layer listening={false}>
                        {level.airWalls.map((w) => (
                            <WallShape key={w.id} wall={w} scale={scale} />
                        ))}
                    </Layer>
                    <Layer>
                        {level.airWalls.map((w) => (
                            <VertexHandles
                                key={w.id}
                                wall={w}
                                scale={scale}
                                onMove={(i, x, y) =>
                                    onLevelChange(movePoint(level, w.id, i, x, y))
                                }
                                onRemove={(i) => onLevelChange(removePoint(level, w.id, i))}
                            />
                        ))}
                    </Layer>
                    {drawing && (
                        <Layer listening={false}>
                            {draftPoints.length >= 2 && (
                                <Line
                                    points={draftPoints.flatMap(([x, y]) => [x * scale, y * scale])}
                                    stroke={COLORS.draftLine}
                                    strokeWidth={2}
                                    lineJoin="round"
                                    dash={[6, 4]}
                                />
                            )}
                            {draftPoints.map(([x, y], i) => {
                                // Origin point (vertex 0) is half-size so
                                // the user can tell where to click to close.
                                const radius = i === 0 ? DRAFT_POINT_RADIUS / 2 : DRAFT_POINT_RADIUS;
                                const opacity = i === 0 ? 0.7 : 1;
                                return (
                                    <Circle
                                        key={i}
                                        x={x * scale}
                                        y={y * scale}
                                        radius={radius}
                                        fill={COLORS.draftLine}
                                        opacity={opacity}
                                    />
                                );
                            })}
                        </Layer>
                    )}
                </Stage>
                </div>
            )}
        </div>
    );
}

interface WallShapeProps {
    wall: AirWall;
    scale: number;
}

function WallShape({ wall, scale }: WallShapeProps) {
    const flat = useMemo(
        () => wall.points.flatMap(([x, y]) => [x * scale, y * scale]),
        [wall.points, scale],
    );
    const fill = wall.kind === 'tall' ? COLORS.tallFill : COLORS.shortFill;
    const stroke = wall.kind === 'tall' ? COLORS.tallStroke : COLORS.shortStroke;
    const strokeWidth = wall.kind === 'tall' ? 2 : 3;
    return (
        <Line
            points={flat}
            closed
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            opacity={0.9}
            lineJoin="round"
        />
    );
}

interface VertexHandlesProps {
    wall: AirWall;
    scale: number;
    onMove: (index: number, x: number, y: number) => void;
    onRemove: (index: number) => void;
}

function VertexHandles({ wall, scale, onMove, onRemove }: VertexHandlesProps) {
    return (
        <>
            {wall.points.map(([x, y], i) => (
                <VertexHandle
                    key={`${wall.id}-${i}`}
                    index={i}
                    imgX={x}
                    imgY={y}
                    scale={scale}
                    onMove={onMove}
                    onDoubleClick={() => onRemove(i)}
                />
            ))}
        </>
    );
}

interface VertexHandleProps {
    index: number;
    imgX: number;
    imgY: number;
    scale: number;
    onMove: (index: number, x: number, y: number) => void;
    onDoubleClick: () => void;
}

function VertexHandle({ index, imgX, imgY, scale, onMove, onDoubleClick }: VertexHandleProps) {
    return (
        <Circle
            x={imgX * scale}
            y={imgY * scale}
            radius={HANDLE_RADIUS}
            fill={COLORS.handleFill}
            stroke={COLORS.handleStroke}
            strokeWidth={1}
            draggable
            onDragMove={(e) => {
                onMove(index, e.target.x() / scale, e.target.y() / scale);
            }}
            onDblClick={onDoubleClick}
            onDblTap={onDoubleClick}
        />
    );
}