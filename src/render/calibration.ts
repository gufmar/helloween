import { expandPolygon, polygonCentroid } from '../core/mask';
import type { Point, ProjectDocument, ShowState } from '../core/types';
import { findVideoClip, videoCorners } from '../core/videos';
import { findScene } from './scene-playback';

export function drawCalibrationOverlay(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  state: ShowState,
): void {
  const {
    project,
    selectedPolygonId,
    selectedPointIndex,
    selectedPathPointIndex,
    selectedSceneId,
    selectedVideoId,
    selectedVideoHandle,
    editMode,
    gridVisible,
  } = state;
  const { logicalWidth: w, logicalHeight: h } = project.meta;

  if (gridVisible) {
    drawGrid(ctx, w, h);
  }

  for (const poly of project.polygons) {
    const selected = poly.id === selectedPolygonId;
    drawPolygon(ctx, poly.points, poly.closed, poly.kind, selected, project.meta.excludePadding);
    if (poly.points.length > 0) {
      const c = polygonCentroid(poly.points);
      ctx.save();
      ctx.fillStyle = selected ? '#ffe08a' : '#d7dde8';
      ctx.font = '14px Segoe UI, sans-serif';
      ctx.fillText(poly.name, c.x + 6, c.y);
      ctx.restore();
    }
    poly.points.forEach((p, i) => {
      const pointSelected = selected && selectedPointIndex === i && editMode === 'polygons';
      drawHandle(ctx, p, pointSelected, i + 1);
    });
  }

  const scene = findScene(project, selectedSceneId);
  if (scene && scene.path.length > 0) {
    const active = editMode === 'scenePath';
    ctx.save();
    ctx.strokeStyle = active ? '#7ad0ff' : 'rgba(122, 208, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(scene.path[0].x, scene.path[0].y);
    for (let i = 1; i < scene.path.length; i++) {
      ctx.lineTo(scene.path[i].x, scene.path[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = active ? '#7ad0ff' : 'rgba(122, 208, 255, 0.7)';
    ctx.font = '13px Segoe UI, sans-serif';
    ctx.fillText(scene.name, scene.path[0].x + 10, scene.path[0].y - 10);
    scene.path.forEach((p, i) => {
      const sel = active && selectedPathPointIndex === i;
      drawHandle(ctx, p, sel, i + 1, '#7ad0ff');
    });
    ctx.restore();
  }

  const video = findVideoClip(project, selectedVideoId);
  if (video) {
    const active = editMode === 'videoRect';
    ctx.save();
    ctx.strokeStyle = active ? '#e0a0ff' : 'rgba(224, 160, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash(active ? [] : [6, 5]);
    ctx.strokeRect(video.x, video.y, video.width, video.height);
    ctx.setLineDash([]);
    ctx.fillStyle = active ? '#e0a0ff' : 'rgba(224, 160, 255, 0.75)';
    ctx.font = '13px Segoe UI, sans-serif';
    ctx.fillText(video.name, video.x + 8, video.y - 8);
    if (active) {
      videoCorners(video).forEach((p, i) => {
        drawHandle(ctx, p, selectedVideoHandle === i, i + 1, '#e0a0ff');
      });
    }
    ctx.restore();
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const step = 100;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Crosshair center + numbered control points
  const controls: Point[] = [
    { x: 0, y: 0 },
    { x: w / 2, y: 0 },
    { x: w, y: 0 },
    { x: 0, y: h / 2 },
    { x: w / 2, y: h / 2 },
    { x: w, y: h / 2 },
    { x: 0, y: h },
    { x: w / 2, y: h },
    { x: w, y: h },
  ];
  controls.forEach((p, i) => {
    ctx.fillStyle = 'rgba(255, 200, 80, 0.9)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '12px Segoe UI, sans-serif';
    ctx.fillText(String(i + 1), p.x + 8, p.y - 8);
  });
  ctx.restore();
}

function drawPolygon(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: Point[],
  closed: boolean,
  kind: 'wall' | 'exclude',
  selected: boolean,
  excludePadding: number,
): void {
  if (points.length === 0) return;
  ctx.save();
  const stroke =
    kind === 'wall'
      ? selected
        ? '#6dffb0'
        : 'rgba(109, 255, 176, 0.7)'
      : selected
        ? '#ff7a7a'
        : 'rgba(255, 122, 122, 0.75)';
  const fill =
    kind === 'wall'
      ? selected
        ? 'rgba(109, 255, 176, 0.18)'
        : 'rgba(109, 255, 176, 0.08)'
      : selected
        ? 'rgba(255, 122, 122, 0.28)'
        : 'rgba(255, 122, 122, 0.16)';

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  if (closed) ctx.closePath();
  if (closed) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = selected ? 3 : 2;
  ctx.stroke();

  if (kind === 'exclude' && closed && excludePadding > 0) {
    const expanded = expandPolygon(points, excludePadding);
    ctx.beginPath();
    ctx.moveTo(expanded[0].x, expanded[0].y);
    for (let i = 1; i < expanded.length; i++) ctx.lineTo(expanded[i].x, expanded[i].y);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255, 160, 80, 0.55)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

function drawHandle(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  p: Point,
  selected: boolean,
  label: number,
  color = '#ffe08a',
): void {
  ctx.save();
  ctx.fillStyle = selected ? '#ffffff' : color;
  ctx.strokeStyle = selected ? '#ffcc33' : '#222';
  ctx.lineWidth = selected ? 3 : 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, selected ? 8 : 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.font = '11px Segoe UI, sans-serif';
  ctx.fillText(String(label), p.x + 9, p.y - 9);
  ctx.restore();
}

export function drawLogicalFrameBorder(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  doc: ProjectDocument,
): void {
  const { logicalWidth: w, logicalHeight: h } = doc.meta;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.restore();
}
