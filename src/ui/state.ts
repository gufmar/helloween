import type { ProjectDocument, ShowState } from '../core/types';
import { createEmptyProject } from '../core/validation';

export function createInitialShowState(project?: ProjectDocument): ShowState {
  const doc = project ?? createEmptyProject();
  return {
    project: doc,
    calibrationMode: true,
    projectionShowCalibration: false,
    blackout: false,
    showArmed: true,
    volume: 0.4,
    scene: null,
    video: null,
    heldVideoIds: [],
    selectedSceneId: null,
    selectedVideoId: null,
    selectedPolygonId: null,
    selectedPointIndex: null,
    selectedPathPointIndex: null,
    selectedVideoHandle: null,
    editMode: 'polygons',
    gridVisible: true,
  };
}
