# Media-Projector

Local facade video projection for Windows (control laptop + HDMI projector).

Focus: **calibration** (wall polygons + excluded windows/balconies) and **video placement** (clips under `media/videos/`, sequence, per-clip speakers), plus a synced projection window. Project JSON import/export (format v2; legacy v1 migrates). Figure path scenes are not in the control UI.

**No** CDN and no cloud APIs at runtime. `npm install` needs internet; after that you can run offline (`vite` or `preview`).

## Start

Requires Node.js 20+ (LTS).

```powershell
cd helloween
npm install
npm run dev
```

Open `http://localhost:5173/` for the **control** view.

Optional:

```powershell
npm test
npm run build
npm run preview
```

## Projection window on the projector

1. Windows: set the projector as an **extended** display (not mirror).
2. In control: **Open projection window** (allow pop-ups for localhost).
3. Drag the new window onto the projector screen.
4. In the projection window: **Start / Unlock audio** (or press Space).
5. If needed: `F11` or Windows fullscreen.
6. Control status should show **Projection: connected**.

Show mode: black background + masked content only, no UI, cursor off.

## Calibration and JSON

1. Turn **Calibration** on (default after start).
2. **+ Wall**: creates a rectangle. Drag corners or use arrow keys (Shift = 8px). Then **Close polygon**.
3. **+ Exclude** the same way for windows/balconies. Close those too.
4. Status above the preview explains when close fails (e.g. too few points).
5. Exclude padding grows exclusions digitally (projector spill on bright surfaces stays physical).
6. Without a closed wall polygon the show stays **black** (calibration helpers only in calibration mode).
7. **Save locally** writes `localStorage`. **Export JSON** downloads a file. **Import JSON** validates first; on error the old project stays.
8. Audio: unlock in control; also unlock in the projection window.

Recalibrate when the projector moves, zoom, keystone/image correction, output format, or logical resolution/aspect changes. This tool does not change projector settings.

Logical surface: **1920×1080**, letterboxed if the window aspect differs (no silent stretch).

## Manual smoke test

1. `npm run dev`, control + projection window on the projector.
2. Unlock audio in both windows; keep volume low.
3. Align wall/exclude polygons to the facade.
4. Close at least one wall and the excludes over windows.
5. Toggle calibration off; use blackout / arm show to verify mask behavior.
6. Export JSON → reload → import → polygons must match.
7. Close control: projection goes black after a short timeout.

Digital black masks content; projector spill on bright surfaces remains.

## Architecture (short)

| Part | Role |
|------|------|
| `src/core` | Project format, validation, coords, mask, history |
| `src/render` | Shared compositor for preview and projector |
| `src/sync` | `BroadcastChannel` between windows |
| `src/audio` | Quiet placeholder tones |
| `index.html` / `projection.html` | Control / show |

Scene render modules remain in the tree for later show work; the control UI covers calibration and video clips (no scene/path editor).

## Media

Large local video files under `media/videos/` are **not** meant for git. Keep clips locally; see `media/videos/README.md`.

## Commit note

Sign commits locally; agents do not commit here.
