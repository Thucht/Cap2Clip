# Fix Windows dual-4K capture across the virtual desktop

## Goal
After `PrintScreen`, cover every attached Windows monitor, allow one continuous selection to cross monitor boundaries, and keep preview/annotation/export pixel-accurate on two 4K displays, including mixed DPI and negative monitor coordinates.

## Current context / assumptions

- Confirmed product requirement: **all monitors are active after `PrintScreen`, and one selection may cross a monitor boundary**.
- The current implementation intentionally captures only the monitor under the cursor:
  - `src-tauri/src/capture.rs:21-46` calls `Screen::from_point(cursor)` and returns one PNG.
  - `src/App.tsx:143-173` fits the single `main` window to that monitor and renders one `CaptureOverlay`.
- The existing mixed-DPI implementation is valuable and must not be replaced with guessed offsets:
  - `src-tauri/src/settings.rs:350-425` reports the physical monitor/window geometry Windows actually applied.
  - `src/geometry.ts:85-124` derives scale/offset from measured geometry and live viewport size.
  - `src/components/CaptureOverlay.tsx:75-126` refreshes mapping after `WM_DPICHANGED` / WebView resize.
- `screenshots = 0.8.10` already exposes `Screen::all()`, and each `Screen` provides stable display metadata (`id`, desktop `x/y`, logical `width/height`, `scale_factor`). On Windows, its `capture()` output is physical size `width * scale_factor` by `height * scale_factor`.
- A single transparent Tauri window spanning a mixed-DPI virtual desktop is not a reliable coordinate surface: one WebView/window has one current DPI context, while different portions of that window would need different CSS-to-physical scales. The implementation therefore uses **one overlay window per monitor**, plus one Rust-owned global selection session.
- This plan does **not** add persisted monitor indices, polling with `setInterval`, equal-width monitor assumptions, or hard-coded `2%` offsets. Monitor IDs/rectangles come from native APIs every capture session.
- Scope is Windows multi-monitor region capture. Existing single-monitor and non-Windows behavior must remain working. The existing `fullscreen-capture` shortcut semantics (copy monitor under cursor) stay unchanged unless the product owner separately changes them.

## Architecture / proposed approach

At capture start, Rust enumerates and captures all monitors while every overlay window is hidden, returning one frame per monitor with both logical desktop bounds and physical image dimensions. Rust creates/reuses one transparent frameless overlay window for each monitor, fits each window in **logical desktop coordinates**, then returns the actual physical client geometry so the current mixed-DPI mapping remains valid per window.

Each overlay renders only its monitor-local frame, but pointer activity is converted to global **logical virtual-desktop coordinates** and sent to a Rust session coordinator. The coordinator normalizes/clamps the selection and broadcasts it to all overlays; each overlay renders the intersection with its own monitor. On mouse release, Rust crops the intersecting physical pixels from every monitor frame, composites them into one PNG, and that single composite becomes the existing annotation/export surface.

## Data contracts to settle before UI work

Use these names and meanings consistently in Rust and TypeScript:

```rust
#[derive(Debug, Clone, Serialize)]
pub struct MonitorCapture {
    pub monitor_id: u32,
    pub logical_x: i32,
    pub logical_y: i32,
    pub logical_width: u32,
    pub logical_height: u32,
    pub physical_width: u32,
    pub physical_height: u32,
    pub scale_factor: f64,
    pub image_data: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct GlobalSelection {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CaptureSession {
    pub session_id: u64,
    pub virtual_x: i32,
    pub virtual_y: i32,
    pub virtual_width: u32,
    pub virtual_height: u32,
    pub monitors: Vec<MonitorCapture>,
}
```

Frontend equivalents belong in `src/capture-session.ts`, not `App.tsx`, so the capture protocol can be unit-tested without React.

Events/commands:

- Existing OS hotkey/tray event remains `region-capture` and means “start one virtual-desktop session.”
- Rust → overlay event `capture-session-ready` carries the full `CaptureSession`; every overlay selects its own `MonitorCapture` by `monitor_id` from the URL query.
- Overlay → Rust command `update_global_selection(session_id, selection)` is called on pointer down/move/up; Rust ignores stale session IDs and emits `global-selection-updated` to every capture overlay.
- Overlay → Rust command `finalize_global_selection(session_id, selection)` returns one `CaptureResult` PNG composited from all intersected monitors and emits `capture-session-finished` so non-owner overlays can hide.
- Existing `copy_image_to_clipboard`, save commands, annotation tools, and `SelectionGeometry` remain monitor-local after finalization because the composite is opened in the owner overlay as a normal local image.

## Step-by-step tasks

### 1. Record a deterministic topology fixture and make the old plan explicitly obsolete

**Files**

- Create `src/capture-session.test.ts`.
- Keep the old plan for history; do not implement `.hermes/plans/2025-01-20_143000-fix-windows-multi-monitor-dpi.md`.

**Test fixture**

Use an asymmetric topology so accidental “two equal side-by-side screens” math cannot pass:

```ts
export const MIXED_DPI_TOPOLOGY = [
  {
    monitor_id: 10,
    logical_x: -2560,
    logical_y: 160,
    logical_width: 2560,
    logical_height: 1440,
    physical_width: 3840,
    physical_height: 2160,
    scale_factor: 1.5,
    image_data: "data:image/png;base64,left",
  },
  {
    monitor_id: 20,
    logical_x: 0,
    logical_y: 0,
    logical_width: 1920,
    logical_height: 1080,
    physical_width: 3840,
    physical_height: 2160,
    scale_factor: 2,
    image_data: "data:image/png;base64,right",
  },
] as const;
```

Add RED tests for pure helpers that do not exist yet:

```ts
import { describe, expect, it } from "vitest";
import {
  globalPointFromLocal,
  intersectGlobalSelection,
  normalizeSelection,
} from "./capture-session";

it("converts a point on a negative-origin monitor to global logical coordinates", () => {
  expect(globalPointFromLocal({ x: 2500, y: 100 }, MIXED_DPI_TOPOLOGY[0])).toEqual({ x: -60, y: 260 });
});

it("splits a cross-boundary selection into monitor-local intersections", () => {
  const selection = { x: -100, y: 200, width: 300, height: 400 };
  expect(intersectGlobalSelection(selection, MIXED_DPI_TOPOLOGY[0])).toEqual({ x: 2460, y: 40, width: 100, height: 400 });
  expect(intersectGlobalSelection(selection, MIXED_DPI_TOPOLOGY[1])).toEqual({ x: 0, y: 200, width: 200, height: 400 });
});

it("normalizes reverse drags", () => {
  expect(normalizeSelection({ x: 200, y: 600 }, { x: -100, y: 200 })).toEqual({
    x: -100,
    y: 200,
    width: 300,
    height: 400,
  });
});
```

**RED command**

```bash
npm test -- src/capture-session.test.ts
```

Expected: Vitest fails because `./capture-session` and its helpers do not exist.

**Minimal implementation**

Create `src/capture-session.ts` with the Rust-matching interfaces and pure helpers:

```ts
export interface Point { x: number; y: number }
export interface SelectionGeometry { x: number; y: number; width: number; height: number }
export interface MonitorCapture {
  monitor_id: number;
  logical_x: number;
  logical_y: number;
  logical_width: number;
  logical_height: number;
  physical_width: number;
  physical_height: number;
  scale_factor: number;
  image_data: string;
}

export function normalizeSelection(start: Point, end: Point): SelectionGeometry {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function globalPointFromLocal(point: Point, monitor: MonitorCapture): Point {
  return { x: monitor.logical_x + point.x, y: monitor.logical_y + point.y };
}

export function intersectGlobalSelection(
  selection: SelectionGeometry,
  monitor: MonitorCapture,
): SelectionGeometry | null {
  const left = Math.max(selection.x, monitor.logical_x);
  const top = Math.max(selection.y, monitor.logical_y);
  const right = Math.min(selection.x + selection.width, monitor.logical_x + monitor.logical_width);
  const bottom = Math.min(selection.y + selection.height, monitor.logical_y + monitor.logical_height);
  if (right <= left || bottom <= top) return null;
  return { x: left - monitor.logical_x, y: top - monitor.logical_y, width: right - left, height: bottom - top };
}
```

**GREEN command**

```bash
npm test -- src/capture-session.test.ts
```

Expected: 3 tests pass.

**Commit**

```bash
git add src/capture-session.ts src/capture-session.test.ts
git commit -m "test: define virtual desktop capture geometry"
```

### 2. Add Rust crop/composition math with tests before capture plumbing

**Files**

- Add private geometry/composition helpers and `#[cfg(test)]` tests in `src-tauri/src/capture.rs`.
- If the helpers make `capture.rs` unwieldy, extract only the pure types/math to `src-tauri/src/capture_session.rs` and add `mod capture_session;` in `src-tauri/src/main.rs`.

**Required pure types**

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
struct LogicalRect { x: f64, y: f64, width: f64, height: f64 }

#[derive(Debug, Clone, Copy, PartialEq)]
struct PhysicalCrop { src_x: u32, src_y: u32, width: u32, height: u32, dst_x: u32, dst_y: u32 }
```

Add RED tests for:

1. selection wholly inside one 200%-scaled monitor;
2. a selection crossing from the negative-origin 150% monitor to the 200% monitor;
3. reverse-drag normalization;
4. no-intersection monitor;
5. physical crop clamping at the monitor edge;
6. output canvas dimensions and destination offsets for the cross-monitor selection.

The conversion formula must be explicit:

```rust
src_x = round((intersection_left - monitor.logical_x) * monitor.scale_factor)
src_y = round((intersection_top - monitor.logical_y) * monitor.scale_factor)
```

Use floor for the source start and ceil for the source end so fractional-DPI boundaries never drop a row/column. The final composite uses one target scale:

```rust
output_scale = max(scale_factor of every intersected monitor)
```

Each crop is resampled to `logical_intersection_size * output_scale` before compositing. This preserves a rectangular output for a selection crossing 150% and 200% monitors; concatenating native crops without resampling would produce incompatible heights.

**RED command**

```bash
cargo test --manifest-path src-tauri/Cargo.toml capture::tests::cross_monitor
```

Expected: compile/test failure before helpers exist.

**Implementation constraints**

- Use `screenshots::image` (the image version already re-exported by `screenshots`) for `crop_imm`, resize, and RGBA compositing; do not add a second direct `image` dependency unless the compiler proves it necessary.
- Fill uncovered gaps in irregular monitor arrangements with transparent pixels in the composite. Do not invent pixels between monitors.
- Return a clear error when the normalized selection has width/height `< 1` logical pixel or intersects no monitor.

**GREEN commands**

```bash
cargo test --manifest-path src-tauri/Cargo.toml capture::tests
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: Rust tests pass and `cargo check` exits 0.

**Commit**

```bash
git add src-tauri/src/capture.rs src-tauri/src/capture_session.rs src-tauri/src/main.rs
git commit -m "test: add cross-monitor crop composition"
```

Only add paths that exist.

### 3. Replace cursor-only region capture with a native `CaptureSession`

**Files**

- `src-tauri/src/capture.rs`
- `src-tauri/src/main.rs`
- `src/capture-flow.test.ts`

**RED tests**

In `src/capture-flow.test.ts`, replace the assertion that the region handler calls `capture_full_screen` with assertions that:

```ts
expect(rustMain).toContain("capture::start_capture_session");
expect(rustMain).toContain("capture::finalize_global_selection");
expect(app).toContain('invoke<CaptureSession>("start_capture_session")');
expect(app).not.toContain('invoke<CaptureResult>("capture_full_screen")'); // only within region-capture handler slice
```

Run:

```bash
npm test -- src/capture-flow.test.ts
```

Expected: the updated source-contract test fails.

**Implementation**

- Add `start_capture_session(app: AppHandle, state: State<CaptureSessionState>) -> Result<CaptureSession, String>`.
- Call `Screen::all()`, sort deterministically by `(display_info.x, display_info.y, display_info.id)`, and capture every screen while all capture windows are hidden.
- For every screen, return:
  - logical desktop rectangle from `DisplayInfo.x/y/width/height`;
  - physical dimensions from the captured PNG;
  - `scale_factor` from `DisplayInfo.scale_factor`;
  - the display `id` and data URL.
- Compute virtual bounds with signed min/max; support monitors left/above the primary.
- Store decoded RGBA frames in managed Rust state keyed by a monotonically increasing `session_id`. Do not decode base64 again during finalization.
- Add `update_global_selection` and `finalize_global_selection`. Reject stale `session_id` values.
- Keep `capture_full_screen` for `fullscreen-capture` and keep its existing cursor-monitor behavior.
- Register the new commands and `.manage(CaptureSessionState::default())` in `src-tauri/src/main.rs`.

**GREEN commands**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm test -- src/capture-flow.test.ts
```

Expected: Rust tests and source-contract tests pass.

**Commit**

```bash
git add src-tauri/src/capture.rs src-tauri/src/main.rs src/capture-flow.test.ts
git commit -m "feat: capture all monitors into one session"
```

### 4. Create/reuse one overlay window per monitor and retain the actual geometry

**Files**

- `src-tauri/src/settings.rs`
- `src-tauri/src/main.rs`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/main.json`
- `src/capability-config.test.ts`
- `src/capture-flow.test.ts`

**Design**

- Keep configured `main` as the first reusable capture window.
- Dynamically create additional capture windows with labels `capture-<monitor_id>` and URL `index.html?window=capture&monitor=<monitor_id>`.
- Every capture window must be `transparent`, `decorations(false)`, `resizable(false)`, `skip_taskbar(true)`, `visible(false)`, and initially not focused. Do not use fullscreen/maximized.
- Settings remains a separate predeclared decorated window.
- `resize_window_to_capture` is currently physical-pixel/single-monitor-specific. Generalize it to `fit_capture_window` accepting the monitor’s **logical desktop rectangle** and returning the actual `CaptureWindowGeometry`. Preserve the retry/readback behavior around `WM_DPICHANGED`.
- Do not assume `monitor_x * scale_factor` is a physical virtual-desktop origin. Keep logical monitor origins for cross-window selection and use the actual client rectangle only for local CSS↔frame mapping.

**RED tests**

Update `src/capability-config.test.ts` so dynamic `capture-*` windows are covered by a capability pattern allowed by Tauri’s generated schema. Before editing the capability, inspect `src-tauri/gen/schemas/desktop-schema.json` for the exact supported wildcard syntax; use that exact syntax, not a guessed permission.

Add source-contract assertions in `src/capture-flow.test.ts` that every overlay is fitted and loaded before any overlay is shown and that `window.show()` is still absent from the native hotkey callback.

```bash
npm test -- src/capability-config.test.ts src/capture-flow.test.ts
```

Expected: tests fail before dynamic overlay creation/capability changes exist.

**Implementation**

Create helpers in `settings.rs` or a focused `capture_windows.rs` module:

```rust
fn capture_window_label(index: usize, monitor_id: u32) -> String
async fn ensure_capture_windows(app: &AppHandle, session: &CaptureSession) -> Result<Vec<CaptureWindowGeometry>, String>
fn hide_capture_windows(app: &AppHandle) -> Result<(), String>
```

For a monitor removed since the previous capture, hide its old window; do not destroy/recreate every session unless Tauri/WebView2 proves reuse unreliable.

Add `window=<main|capture>` URL handling in `src/App.tsx`; settings detection must continue to work.

**GREEN commands**

```bash
npm test -- src/capability-config.test.ts src/capture-flow.test.ts
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: tests pass and Rust compiles.

**Commit**

```bash
git add src-tauri/src/settings.rs src-tauri/src/capture_windows.rs src-tauri/src/main.rs src-tauri/tauri.conf.json src-tauri/capabilities/main.json src/capability-config.test.ts src/capture-flow.test.ts
git commit -m "feat: manage one capture overlay per monitor"
```

Only add paths that exist.

### 5. Synchronize one global selection across every overlay

**Files**

- `src/App.tsx`
- `src/components/CaptureOverlay.tsx`
- `src/capture-session.ts`
- `src/capture-session.test.ts`
- `src/capture-flow.test.ts`

**RED tests**

Extend `src/capture-session.test.ts` with:

```ts
it("returns null for a monitor outside the selection", () => {
  expect(intersectGlobalSelection({ x: 100, y: 100, width: 50, height: 50 }, MIXED_DPI_TOPOLOGY[0])).toBeNull();
});

it("clips a selection to virtual bounds without shifting its anchor", () => {
  expect(clampGlobalSelection(
    { x: -3000, y: -100, width: 3500, height: 500 },
    { x: -2560, y: 0, width: 4480, height: 1600 },
  )).toEqual({ x: -2560, y: 0, width: 3060, height: 400 });
});
```

Update `src/capture-flow.test.ts` to require listeners for `capture-session-ready`, `global-selection-updated`, and `capture-session-finished`.

```bash
npm test -- src/capture-session.test.ts src/capture-flow.test.ts
```

Expected: new tests fail.

**Implementation**

- Refactor `CaptureOverlay` to receive:
  - the current `MonitorCapture`;
  - the global selection;
  - callbacks `onGlobalPointerDown`, `onGlobalPointerMove`, `onGlobalPointerUp`.
- Convert `event.clientX/clientY` to monitor-local logical CSS coordinates using the existing live viewport measurement, then add `monitor.logical_x/y` with `globalPointFromLocal`.
- On every `global-selection-updated`, compute `intersectGlobalSelection` and render only that local piece. The selection border must align at monitor edges without double-width seams.
- Use pointer capture on the initiating overlay where available, but do not rely on it crossing HWNDs. Every overlay reports pointer movement into the same Rust session, so crossing the OS window boundary continues the drag.
- Throttle `update_global_selection` to one in-flight call / animation frame; never enqueue an unbounded invoke per `mousemove`.
- On pointer-up in any overlay, finalize the normalized global selection exactly once. Use `session_id` plus a Rust `finalizing` guard to suppress duplicate releases.
- Clear the old `previous_selection` when a new multi-monitor session begins. A persisted monitor-local rectangle has no valid meaning on a changed virtual topology; add topology-aware persistence only as a separate feature.

**GREEN commands**

```bash
npm test -- src/capture-session.test.ts src/capture-flow.test.ts
npm run build
```

Expected: all targeted tests pass and TypeScript/Vite build succeeds.

**Commit**

```bash
git add src/App.tsx src/components/CaptureOverlay.tsx src/capture-session.ts src/capture-session.test.ts src/capture-flow.test.ts
git commit -m "feat: synchronize selection across capture overlays"
```

### 6. Finalize the cross-monitor selection into the existing annotation flow

**Files**

- `src-tauri/src/capture.rs`
- `src/App.tsx`
- `src/components/CaptureOverlay.tsx`
- `src/components/AnnotationCanvas.tsx` only if existing local-composite mapping needs a narrow correction
- `src/geometry.test.ts`
- `src/capture-flow.test.ts`

**RED tests**

Add Rust integration-style unit tests using tiny generated images:

- monitor A: solid red, logical `[-2, 0, 2, 2]`, scale 1;
- monitor B: solid blue, logical `[0, 0, 2, 2]`, scale 2;
- selection `[-1, 0, 2, 2]`.

Assert the composite:

- has dimensions `4 x 4` at output scale 2;
- left half is red and right half is blue;
- no transparent seam occurs at the shared boundary.

```bash
cargo test --manifest-path src-tauri/Cargo.toml capture::tests::composites_cross_monitor_selection
```

Expected: RED before `finalize_global_selection` uses the compositor.

**Implementation**

- Return `CaptureResult { image_data, width, height, x: 0, y: 0 }` from finalization. The result is a new local image, not a virtual-desktop frame.
- Pick the monitor/window where pointer-up occurred as annotation owner. Emit `capture-session-finished` with the composite only to that label (or include `owner_label` and let non-owners hide).
- Hide every other overlay immediately.
- Fit the owner overlay to a usable monitor-local area using the existing fit/readback logic, set `captureGeometry` for that owner, and enter the current `annotating` phase with selection `{ x: 0, y: 0, width: compositeCssWidth, height: compositeCssHeight }` clamped to its viewport.
- If the composite is larger than the owner monitor, scale only the **displayed annotation surface** to fit; retain the physical export multiplier so saved/copied pixels keep the compositor dimensions.
- Reuse current annotation, copy, save, quick-save, blur, and multi-region code. Do not maintain annotation canvases across multiple native windows.
- Escape/cancel must hide all capture windows and clear Rust session frames.

**GREEN commands**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm test -- src/geometry.test.ts src/capture-flow.test.ts src/capture-session.test.ts
npm run build
```

Expected: all tests pass and build exits 0.

**Commit**

```bash
git add src-tauri/src/capture.rs src/App.tsx src/components/CaptureOverlay.tsx src/components/AnnotationCanvas.tsx src/geometry.test.ts src/capture-flow.test.ts
git commit -m "feat: annotate cross-monitor composite captures"
```

Only add changed paths.

### 7. Add session cleanup and monitor-change failure handling

**Files**

- `src-tauri/src/capture.rs`
- `src-tauri/src/main.rs`
- `src/App.tsx`
- `src/capture-flow.test.ts`

**RED cases**

Add source/unit tests for:

- Escape clears state and hides every `main`/`capture-*` window;
- starting a new capture invalidates the previous session ID;
- finalizing stale session returns an error and does not emit a composite;
- monitor removal between capture and show aborts cleanly and hides already-prepared overlays;
- a capture failure on one monitor aborts the whole session rather than showing a partial desktop without warning.

```bash
npm test -- src/capture-flow.test.ts
cargo test --manifest-path src-tauri/Cargo.toml capture::tests
```

Expected: RED before cleanup guards are present, then GREEN after implementation.

**Implementation**

Use an RAII-style/session reset helper in Rust so every error path drops stored frames and requests all capture windows to hide. Log the monitor ID and stage (`enumerate`, `capture`, `window-fit`, `show`, `finalize`) without logging image data.

**Commit**

```bash
git add src-tauri/src/capture.rs src-tauri/src/main.rs src/App.tsx src/capture-flow.test.ts
git commit -m "fix: clean up failed multi-monitor capture sessions"
```

### 8. Document the invariant and run the complete automated gate

**Files**

- `README.md`

Replace the current single-monitor wording in `README.md:222-238` with these invariants:

1. region capture enumerates/captures every monitor while overlays are hidden;
2. one transparent window is fitted per monitor;
3. selection coordinates are global logical desktop units and may be negative;
4. each monitor frame maps logical selection intersections to physical pixels with that monitor’s own scale;
5. final composition resamples to the maximum intersected scale before annotation;
6. no equal-size/two-monitor/layout assumptions are allowed.

**Verification commands**

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected:

- Vitest reports all tests passing.
- TypeScript + Vite build exits 0; the existing chunk-size warning is non-fatal.
- Cargo tests pass.
- Cargo check exits 0.

**Commit**

```bash
git add README.md
git commit -m "docs: describe virtual desktop capture invariants"
```

### 9. Run Windows hardware validation on the actual dual-4K setup

Automated tests cannot validate HWND focus, WebView2 DPI transitions, or cross-window mouse delivery. Run the development build:

```bash
npm run tauri dev
```

Use this exact manual matrix and record pass/fail plus monitor layout/scales in the task handoff:

| Case | Setup / action | Expected result |
|---|---|---|
| 1 | Both 4K monitors at 100%; cursor on left; press PrintScreen | Both screens dim at once; one selection can begin left and end right |
| 2 | Both 4K at 150% | Border and crop align within 1 physical pixel on both monitors |
| 3 | Left 150%, right 200% | Cross-boundary crop has no duplicate/missing seam and correct content on both sides |
| 4 | Secondary placed left of primary (negative X) | Drag in either direction works; no jump to primary origin |
| 5 | Secondary placed above primary (negative Y) | Vertical cross-boundary drag and crop are accurate |
| 6 | Begin drag on one overlay, release on the other | Selection finalizes once; only one annotation owner remains visible |
| 7 | Press Escape during selection | Every overlay hides; desktop input is restored |
| 8 | Repeat PrintScreen 20 times, alternating cursor/starting monitor | No stale frame, white flash, frozen input, or orphan overlay |
| 9 | Disconnect/reconnect secondary between sessions | Next session reflects current monitors and stale window stays hidden |
| 10 | Copy and save a cross-monitor annotated capture | Clipboard/file dimensions equal compositor dimensions and pixels match preview |

When a case fails, capture a diagnostic line per overlay containing: `session_id`, `monitor_id`, logical monitor rect, actual physical client rect, WebView viewport, `devicePixelRatio`, and final global selection. Do not log `image_data`.

After the matrix passes, run the release gate without publishing:

```bash
npm run build:release
```

Expected: Tauri release build creates portable EXE, NSIS installer, and MSI, and `scripts/copy-release-artifacts.mjs` copies all three into `releases/`. This modifies tracked release binaries; review them before committing and do not commit/push unless explicitly requested.

**Optional commit after hardware proof**

```bash
git add releases/Cap2Clip.exe releases/Cap2Clip_1.0.0_x64-setup.exe releases/Cap2Clip_1.0.0_x64_en-US.msi
git commit -m "build: update multi-monitor capture binaries"
```

## Tests / validation summary

Follow RED → GREEN → commit for each implementation slice above. The minimum merge gate is:

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

The feature is **not done** until the dual-4K hardware matrix passes. Unit tests prove coordinate/composition math; only real Windows monitors prove window DPI, focus, z-order, and cross-HWND pointer behavior.

## Risks, tradeoffs, and open questions

### Risks

- **Cross-window drag delivery:** browsers do not guarantee pointer capture across native HWNDs. The design mitigates this by letting every overlay feed the same Rust session. Hardware validation must confirm there is no dead strip at monitor boundaries.
- **Mixed-DPI composition:** physical images from 150% and 200% monitors have different pixels per logical unit. Resampling to the maximum intersected scale is deterministic and preserves a rectangular output, but content from lower-scale monitors is upscaled.
- **Memory/latency:** two 4K RGBA frames are roughly 63 MiB before PNG/base64/WebView copies; multiple data URLs can temporarily use considerably more. Store native RGBA once, release immediately after finalization/cancel, and measure capture latency during hardware validation.
- **Irregular layouts:** L-shaped monitor layouts create virtual-desktop gaps. The compositor must keep those regions transparent; selection UI should not pretend pixels exist there.
- **Runtime monitor changes:** hot-plugging during a live session can invalidate windows. Abort atomically rather than finalize a partial/stale session.

### Tradeoffs

- Multiple overlay windows add lifecycle/event complexity, but avoid mathematically invalid single-window mixed-DPI mapping.
- The first implementation annotates the finalized composite in one window rather than distributing Fabric canvases across monitors. This keeps existing annotation/export code reusable and limits scope.
- Maximum-scale output favors pixel fidelity on the highest-DPI monitor at the cost of upscaling lower-DPI portions. A later setting could choose logical-resolution output, but YAGNI for this fix.

### Open questions that do not block implementation

- Which monitor should own annotation after finalization: pointer-up monitor (recommended) or monitor containing the largest selected area?
- Should “fullscreen capture” later mean the whole virtual desktop? This plan deliberately preserves its current cursor-monitor copy behavior.
- Should previous cross-monitor selections be persisted with a topology signature? This plan clears them because replaying a monitor-local rectangle on a changed topology is unsafe.
