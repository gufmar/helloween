import type { Point, ProjectDocument, SceneDef, ShowState } from '../core/types';
import { drawGhost, ghostAccentAt, sampleGhostPose } from './ghost';
import {
  drawPhantomMask,
  phantomMaskAccentAt,
  samplePhantomMaskPose,
} from './phantom-mask';
import { drawPumpkin, pumpkinAccentAt, samplePumpkinPose } from './pumpkin';
import { drawSpider, sampleSpiderPose, spiderAccentAt } from './spider';
import { drawWitch, sampleWitchPose, witchAccentAt } from './witch';

export function findScene(doc: ProjectDocument, sceneId: string | null | undefined): SceneDef | null {
  if (!sceneId) return null;
  return doc.scenes.find((s) => s.id === sceneId) ?? null;
}

export function activeSceneDef(state: ShowState): SceneDef | null {
  if (!state.scene) return null;
  return findScene(state.project, state.scene.sceneId);
}

export function selectedScenePath(state: ShowState): Point[] {
  const scene = findScene(state.project, state.selectedSceneId);
  return scene?.path ?? [];
}

export function drawActiveScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  def: SceneDef,
  elapsedMs: number,
): void {
  switch (def.figure) {
    case 'ghost': {
      const pose = sampleGhostPose(def.path, elapsedMs, def.durationMs, 'friendly');
      if (pose) drawGhost(ctx, pose);
      break;
    }
    case 'ghostSpooky': {
      const pose = sampleGhostPose(def.path, elapsedMs, def.durationMs, 'spooky');
      if (pose) drawGhost(ctx, pose);
      break;
    }
    case 'spider': {
      const pose = sampleSpiderPose(def.path, elapsedMs, def.durationMs);
      if (pose) drawSpider(ctx, pose);
      break;
    }
    case 'pumpkin': {
      const pose = samplePumpkinPose(def.path, elapsedMs, def.durationMs);
      if (pose) drawPumpkin(ctx, pose);
      break;
    }
    case 'witch': {
      const pose = sampleWitchPose(def.path, elapsedMs, def.durationMs);
      if (pose) drawWitch(ctx, pose);
      break;
    }
    case 'phantomMask': {
      const pose = samplePhantomMaskPose(def.path, elapsedMs, def.durationMs);
      if (pose) drawPhantomMask(ctx, pose);
      break;
    }
  }
}

export function accentTimeMs(def: SceneDef): number {
  switch (def.figure) {
    case 'spider':
      return spiderAccentAt(def.durationMs);
    case 'pumpkin':
      return pumpkinAccentAt(def.durationMs);
    case 'witch':
      return witchAccentAt(def.durationMs);
    case 'phantomMask':
      return phantomMaskAccentAt(def.durationMs);
    default:
      return ghostAccentAt(def.durationMs);
  }
}

export function shouldTriggerAccent(def: SceneDef, prevMs: number, nextMs: number): boolean {
  const at = accentTimeMs(def);
  return prevMs < at && nextMs >= at;
}
