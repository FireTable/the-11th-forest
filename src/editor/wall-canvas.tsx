import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Layer, Line, Stage } from 'react-konva';
import type Konva from 'konva';

import { movePoint, moveWallPolygon, removePoint } from '@/lib/editor/air-walls';
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
    active?: boolean;
    onLevelChange: (next: Level) => void;
    /** Called when the user closes a draft polygon by clicking near vertex 0. */
    onAirWallDrawn: (points: AirWallVertex[]) => void;
}

const CLOSE_TOLERANCE_PX = 16;
const HANDLE_RADIUS = 4;
const DRAFT_POINT_RADIUS = 5;

const COLORS = {
    tallFill: 'rgba(255, 51, 68, 0.2)',
    tallStroke: 'rgba(255, 51, 68, 0.5)',
    shortFill: 'rgba(51, 136, 255, 0.2)',
    shortStroke: 'rgba(51, 136, 255, 0.5)',
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

export function WallCanvas({
    level,
    drawing,
    active = true,
    onLevelChange,
    onAirWallDrawn,
}: Props) {
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
        return Math.min(box.width / level.imageSize.width, box.height / level.imageSize.height);
    }, [box, level.imageSize]);

    function handleStagePointer(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
        if (!drawing) return;
        // Stage coordinates are relative to the Stage element (0..box.width/height).
        const stage = e.target.getStage();
        const pos = stage?.getPointerPosition();
        if (!pos) return;

        // Convert display px → image px
        const imgX = Math.round(pos.x / scale);
        const imgY = Math.round(pos.y / scale);

        const currentDraft = draftPointsRef.current;
        if (currentDraft.length >= 3) {
            // Check for close-polygon click near vertex 0
            const [x0, y0] = currentDraft[0];
            const d = Math.hypot(pos.x - x0 * scale, pos.y - y0 * scale);
            if (d <= CLOSE_TOLERANCE_PX) {
                // Done! Commit and reset draft state
                if (isMeaningfulPolygon(currentDraft)) {
                    onAirWallDrawn(currentDraft);
                }
                setDraftPoints([]);
                return;
            }
        }

        // Prevent duplicate consecutive points
        const last = currentDraft[currentDraft.length - 1];
        if (last && last[0] === imgX && last[1] === imgY) return;

        setDraftPoints([...currentDraft, [imgX, imgY]]);
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

    const [selectedWallId, setSelectedWallId] = useState<string | null>(null);

    return (
        <div ref={wrapperRef} className="absolute inset-0 pointer-events-none">
            {box.width > 0 && box.height > 0 && (
                <div
                    className={`absolute ${active ? 'pointer-events-auto' : 'pointer-events-none'}`}
                    style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
                >
                    <Stage
                        width={box.width}
                        height={box.height}
                        onClick={(e) => {
                            // Clear selected wall if clicking empty stage space
                            if (e.target === e.target.getStage()) {
                                setSelectedWallId(null);
                            }
                            handleStagePointer(e);
                        }}
                        onTap={(e) => {
                            if (e.target === e.target.getStage()) {
                                setSelectedWallId(null);
                            }
                            handleStagePointer(e);
                        }}
                    >
                        <Layer listening={active}>
                            {level.airWalls.map((w) => {
                                const isSelected = selectedWallId === w.id;
                                const canDrag = active && !drawing;
                                return (
                                    <Group
                                        key={w.id}
                                        draggable={canDrag}
                                        onClick={(e) => {
                                            e.cancelBubble = true;
                                            setSelectedWallId(w.id);
                                        }}
                                        onTap={(e) => {
                                            e.cancelBubble = true;
                                            setSelectedWallId(w.id);
                                        }}
                                        onDragEnd={(e) => {
                                            const node = e.target;
                                            // Only handle dragEnd if the event target is this Group
                                            if (node.nodeType === 'Group') {
                                                const dx = Math.round(node.x() / scale);
                                                const dy = Math.round(node.y() / scale);
                                                node.x(0);
                                                node.y(0);
                                                if (dx !== 0 || dy !== 0) {
                                                    onLevelChange(
                                                        moveWallPolygon(level, w.id, dx, dy),
                                                    );
                                                }
                                            }
                                        }}
                                    >
                                        <WallShape wall={w} scale={scale} isSelected={isSelected} />
                                        {active && (
                                            <VertexHandles
                                                wall={w}
                                                scale={scale}
                                                onMove={(i, x, y) =>
                                                    onLevelChange(movePoint(level, w.id, i, x, y))
                                                }
                                                onRemove={(i) =>
                                                    onLevelChange(removePoint(level, w.id, i))
                                                }
                                            />
                                        )}
                                    </Group>
                                );
                            })}
                        </Layer>
                        {drawing && (
                            <Layer listening={false}>
                                {draftPoints.length >= 2 && (
                                    <Line
                                        points={draftPoints.flatMap(([x, y]) => [
                                            x * scale,
                                            y * scale,
                                        ])}
                                        stroke={COLORS.draftLine}
                                        strokeWidth={2}
                                        lineJoin="round"
                                        dash={[6, 4]}
                                    />
                                )}
                                {draftPoints.map(([x, y], i) => {
                                    // Origin point (vertex 0) is half-size so
                                    // the user can tell where to click to close.
                                    const radius =
                                        i === 0 ? DRAFT_POINT_RADIUS / 2 : DRAFT_POINT_RADIUS;
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
    isSelected: boolean;
}

function WallShape({ wall, scale, isSelected }: WallShapeProps) {
    const flat = useMemo(
        () => wall.points.flatMap(([x, y]) => [x * scale, y * scale]),
        [wall.points, scale],
    );
    const fill = wall.kind === 'tall' ? COLORS.tallFill : COLORS.shortFill;
    const stroke = isSelected
        ? '#00ffff'
        : wall.kind === 'tall'
          ? COLORS.tallStroke
          : COLORS.shortStroke;
    const strokeWidth = isSelected ? 3 : wall.kind === 'tall' ? 2 : 3;

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
