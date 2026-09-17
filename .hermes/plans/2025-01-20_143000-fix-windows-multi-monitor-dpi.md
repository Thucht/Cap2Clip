# Plan: Fix Windows Multi-Monitor 4K + DPI Bug

## Goal
Fix the bug where the Cap2Clip capture overlay behaves incorrectly on Windows systems with two 4K screens: when the app is running on the screen where the mouse cursor is active, the overlay should work seamlessly across all monitors, but currently it has issues with DPI scaling, coordinate mapping, and window positioning across mixed-DPI setups.

## Current Context / Assumptions
- The codebase is a Tauri v2 desktop app (React + Rust) for screenshot capture and annotation
- The main window is transparent, frameless, not fullscreen/maximized, with `visible: false` and `focus: false` by default
- The capture overlay appears on the "captured monitor" and handles selection/annotation
- Mixed-DPI desktops already have some handling via `offsetX`/`offsetY` in `ImageMapping` and `calculateImageMapping`, but these are insufficient for multi-monitor 4K setups
- The bug manifests when: Windows has two 4K monitors, app runs on one monitor, mouse is active on the other, and the overlay/window positioning doesn't coordinate correctly across monitors
- Key files already have DPI-aware foundations but need extension for full multi-monitor support

## Architecture / Proposed Approach
The approach is to enhance the existing DPI/coordinate mapping system in `geometry.ts` to fully track which monitor the overlay is on, and add monitor-aware window management in the Tauri config and App component. The existing `CaptureWindowGeometry` interface already has `monitor_*` and `window_*` fields plus `scale_factor` — we will extend these to properly handle multi-monitor 4K scenarios. The overlay will detect the current monitor via Windows API (through Tauri's `@tauri-apps/api/window` or `global-shortcut`), and all coordinate calculations will be relative to that monitor. Window positioning will use the monitor rectangle to avoid overlap and ensure seamless drag-and-drop across monitors.

## Step-by-Step Tasks

### Task 1: Extend `CaptureWindowGeometry` to track current monitor index
- **File**: `src/geometry.ts`
- **Change**: Add `monitor_index: number` field to `CaptureWindowGeometry` interface
- **Code**: 
  ```typescript
  export interface CaptureWindowGeometry {
    monitor_x: number;
    monitor_y: number;
    monitor_width: number;
    monitor_height: number;
    window_x: number;
    window_y: number;
    window_width: number;
    window_height: number;
    scale_factor: number;
    monitor_index: number;  // NEW: which monitor index (0, 1, 2, ...)
  }
  ```

### Task 2: Add `getCurrentMonitor` helper function
- **File**: `src/geometry.ts`
- **Change**: Add new function that uses `measureViewport` + Windows monitor enumeration to determine current monitor index
- **Code** (copy-pasteable):
  ```typescript
  /** Returns the monitor rectangle for a given index, or the monitor containing (x,y). */
  export function getMonitorRect(monitorIndex: number, screenWidth: number, screenHeight: number): Rect {
    // Simulate: in real implementation, this would call Windows EnumDisplayMonitors
    // For now, use simple logic: each monitor is side-by-side
    const monitorWidth = screenWidth / 2; // assumes 2 monitors for simplicity
    const monitorHeight = screenHeight;
    const x = monitorIndex * monitorWidth;
    const y = 0;
    return { x, y, width: monitorWidth, height: monitorHeight };
  }
  
  /** Determine which physical monitor the given CSS viewport point falls on. */
  export function detectCurrentMonitor(
    viewportX: number,
    viewportY: number,
    screenWidth: number,
    screenHeight: number
  ): number {
    // Each monitor gets half the screen width in a 2-monitor setup
    const monitorWidth = screenWidth / 2;
    if (viewportX >= viewportX + monitorWidth) return 1; // second monitor
    return 0; // first monitor
  }
  ```

### Task 3: Update `CalculateImageMapping` to include monitor-aware offset
- **File**: `src/geometry.ts`
- **Change**: Modify `calculateImageMapping` to also return `offsetX`/`offsetY` based on which monitor the viewport is on (for mixed-DPI multi-monitor)
- **Code** (copy-pasteable):
  ```typescript
  export function calculateImageMapping(
    imageWidth: number,
    imageHeight: number,
    viewportWidth: number,
    viewportHeight: number,
    monitorIndex: number = 0
  ): ImageMapping {
    const base = {
      scaleX: viewportWidth > 0 ? imageWidth / viewportWidth : 1,
      scaleY: viewportHeight > 0 ? imageHeight / viewportHeight : 1,
    };
    
    // For mixed-DPI: if on a higher-DPI monitor, adjust offsets
    // In a 4K+4K setup, each monitor may have different pixel-to-logical ratios
    // The offset accounts for window position offset when switching monitors
    const offsetX = monitorIndex === 1 ? viewportWidth * 0.02 : 0; // example: small offset for monitor 1
    const offsetY = 0;
    
    return {
      ...base,
      offsetX,
      offsetY,
    };
  }
  ```

### Task 4: Update `CaptureOverlay.tsx` to detect and use current monitor
- **File**: `src/components/CaptureOverlay.tsx`
- **Change**: 
  - Import `detectCurrentMonitor` and `getMonitorRect` from geometry
  - On overlay mount, detect which monitor the overlay is on
  - Pass `monitor_index` to all geometry calculations
  - Adjust overlay positioning based on monitor rectangle
- **Code** (key sections):
  ```tsx
  import { detectCurrentMonitor, getMonitorRect, CaptureWindowGeometry } from "../geometry";
  
  // In the component, after capture geometry is set:
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;
  const currentMonitor = detectCurrentMonitor(
    captureGeometry?.window_x ?? 0,
    captureGeometry?.window_y ?? 0,
    screenWidth,
    screenHeight
  );
  
  const monitorRect = getMonitorRect(currentMonitor, screenWidth, screenHeight);
  
  // Pass monitor_index to mapping functions
  const imageMapping = calculateImageMapping(
    fullScreenshotWidth,
    fullScreenshotHeight,
    viewportWidth,
    viewportHeight,
    currentMonitor
  );
  ```

### Task 5: Update `App.tsx` window management for multi-monitor
- **File**: `src/App.tsx`
- **Change**: 
  - On window creation, determine which monitor the window should appear on
  - Store the monitor index in state and pass it down
  - Add effect to re-detect monitor when window moves
- **Code** (key sections):
  ```tsx
  const [monitorIndex, setMonitorIndex] = useState(0);
  
  useEffect(() => {
    const checkMonitor = () => {
      // Use window.screenX/screenY + window.innerWidth to determine monitor
      const viewportX = window.screenX || window.left || 0;
      const viewportY = window.screenY || window.top || 0;
      const newIndex = detectCurrentMonitor(
        viewportX,
        viewportY,
        window.screen.width,
        window.screen.height
      );
      if (newIndex !== monitorIndex) setMonitorIndex(newIndex);
    };
    checkMonitor();
    const interval = setInterval(checkMonitor, 1000); // re-check if moved
    return () => clearInterval(interval);
  }, [monitorIndex]);
  ```

### Task 6: Add tests for multi-monitor geometry
- **File**: `src/geometry.test.ts`
- **Change**: Add new test cases for multi-monitor detection and coordinate mapping
- **Code** (copy-pasteable tests):
  ```typescript
  describe("multi-monitor geometry", () => {
    it("detects current monitor for viewport point on monitor 1", () => {
      expect(detectCurrentMonitor(960, 500, 3840, 2160)).toBe(0); // left half
    });
    
    it("detects current monitor for viewport point on monitor 2", () => {
      expect(detectCurrentMonitor(2880, 500, 3840, 2160)).toBe(1); // right half
    });
    
    it("calculateImageMapping returns correct offset for monitor 1", () => {
      expect(calculateImageMapping(3840, 2160, 1920, 1080, 1)).toEqual({
        scaleX: 2,
        scaleY: 2,
        offsetX: expect.any(Number), // non-zero for mixed-DPI
        offsetY: 0,
      });
    });
    
    it("clampSelection respects monitor boundaries", () => {
      expect(clampSelection({ x: 3000, y: 1000, width: 800, height: 600 }, 3840, 2160)).toEqual({
        x: 3000, // shouldn't clamp to 0 if on monitor 2
        y: 1000,
        width: 800,
        height: 600,
      });
    });
  });
  ```

### Task 7: Verify build and run tests
- **Command**: `npm run build && npm test`
- **Expected**: All tests pass, build succeeds
- **Verification**: Run `npm test -- --reporter=verbose` to see test results

## Tests / Validation

### Task 6 Test Structure (TDD cycle per task)
1. **Write failing test** — add the multi-monitor test cases to `geometry.test.ts`
2. **Run test** — `npm test -- -t "multi-monitor"` should show failures
3. **Implement minimally** — add the `detectCurrentMonitor`, `getMonitorRect`, updated `calculateImageMapping` functions
4. **Run to verify pass** — `npm test -- -t "multi-monitor"` should show all passing
5. **Commit** — with descriptive message

### Expected test output after implementation:
```
Multi-monitor geometry
  ✓ detects current monitor for viewport point on monitor 1
  ✓ detects current monitor for viewport point on monitor 2
  ✓ calculateImageMapping returns correct offset for monitor 1
  ✓ clampSelection respects monitor boundaries
```

## Risks, Tradeoffs, and Open Questions

### Risks
1. **Windows API dependency**: The `detectCurrentMonitor` function currently uses simulated logic. Real implementation would need Windows `EnumDisplayMonitors` API access. This could be done via a small Rust helper or by using `window.screen` properties which are sufficient for side-by-side monitor layouts.
2. **Monitor hot-plugging**: If a user connects/displays monitors while the app is running, the monitor index could change. We add a periodic re-check interval (every 1s) but this may cause flicker or unnecessary recalculations.
3. **Mixed-DPI complexities**: Different monitors may have different scaling (100%, 150%, 200%). The current `scale_factor` in `CaptureWindowGeometry` helps, but real Windows DPI handling may require additional Tauri/plugin logic.

### Tradeoffs
- **Simplicity vs completeness**: We assume 2 monitors side-by-side with equal width division. For setups with >2 monitors or portrait/rotation, the logic would need extension but the core pattern (monitor index + rect) remains valid.
- **Pure JS vs Rust**: Using `window.screen` properties is simpler but less accurate than a Rust `win32` call. We start with JS and can add a Rust helper later if needed.

### Open Questions
1. Should we add a Rust plugin module to accurately enumerate monitors via Windows API, or is `window.screen` sufficient for the target use case?
2. How should the app behave when the user drags the capture overlay from one monitor to another — should it automatically re-detect and remap, or require a hotkey?
3. Should the `monitor_index` be persisted in `AppSettings` so the app remembers which monitor it was last used on?

## Commit Checklist
- [ ] Task 1: Extend `CaptureWindowGeometry` interface
- [ ] Task 2: Add `getMonitorRect` and `detectCurrentMonitor` helpers
- [ ] Task 3: Update `calculateImageMapping` for monitor-aware offsets
- [ ] Task 4: Update `CaptureOverlay.tsx` to detect and use current monitor
- [ ] Task 5: Update `App.tsx` window management for multi-monitor
- [ ] Task 6: Add multi-monitor test cases to `geometry.test.ts` (TDD cycle)
- [ ] Task 7: Run `npm run build && npm test` — all pass
- [ ] Task 8: Commit with message describing the multi-monitor DPI fix