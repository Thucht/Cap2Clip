# Lightshot Clone - Specification

## 1. Project Overview

**Project Name**: Lightshot Clone  
**Type**: Desktop Screenshot Capture & Annotation Tool  
**Core Feature Summary**: A lightweight, cross-platform screenshot capture tool with region selection and annotation capabilities, inspired by Lightshot.  
**Target Users**: Developers, designers, content creators, and anyone needing quick screenshot annotation.

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Framework | Tauri v2 |
| Backend Language | Rust |
| Frontend Framework | React 18 + TypeScript |
| Canvas Library | Fabric.js 6 |
| State Management | Zustand |
| Build Tool | Vite |

## 3. UI/UX Specification

### 3.1 Window Model

- **Overlay Window**: Fullscreen transparent window for region selection
  - Frameless, always-on-top
  - Covers entire screen
  - Click-and-drag to select region
  
- **Editor Window**: Annotation canvas (same window, different mode)
  - Dark theme (#1a1a1a background)
  - Toolbar at top
  - Canvas centered with padding

### 3.2 Visual Design

**Color Palette**:
| Role | Color | Hex |
|------|-------|-----|
| Background | Dark Gray | #1a1a1a |
| Surface | Lighter Gray | #2a2a2a |
| Border | Gray | #3a3a3a |
| Primary Accent | Blue | #0078d4 |
| Success | Green | #28a745 |
| Text Primary | White | #ffffff |
| Text Secondary | Gray | #888888 |
| Selection Border | White (dashed) | #ffffff |

**Typography**:
- Font Family: System fonts (-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto)
- Toolbar icons: Lucide React, 20px
- Text labels: 14px

**Spacing System**:
- Toolbar padding: 10px 16px
- Tool button size: 40px × 40px
- Gap between tool groups: 8px
- Border radius: 8px (buttons), 12px (panels)

### 3.3 Components

**Overlay Screen**:
- Semi-transparent backdrop (click to dismiss concept, but we capture full screen first)
- Selection rectangle: White dashed border, 2px
- Dimension tooltip: White pill above selection
- Instructions bar: Fixed at bottom center

**Editor Toolbar**:
- Tool buttons: Rect, Circle, Arrow, Pencil, Text, Select
- Color picker: Native color input
- Stroke width: Range slider (1-20px)
- Action buttons: Undo, Delete, Copy, Save, Cancel

**Preset Panel** (Modal):
- Header with title and close button
- Scrollable list of presets
- Add new preset form
- Delete button per preset

## 4. Functional Specification

### 4.1 Core Features

1. **Screenshot Capture**
   - Global hotkey: Ctrl+Shift+5
   - Full screen capture via Rust backend
   - Region selection on overlay
   - Minimum selection: 10×10 pixels

2. **Drawing Tools**
   | Tool | Description |
   |------|-------------|
   | Select | Click to select objects, drag to move |
   | Rectangle | Add rectangle with current color/stroke |
   | Circle | Add circle with current color/stroke |
   | Arrow | Add arrow line |
   | Pencil | Freehand drawing |
   | Text | Add editable text |

3. **Annotation Options**
   - Color picker (any color)
   - Stroke width slider (1-20px)
   - Undo (up to 50 states)
   - Delete selected object

4. **Dimension Presets**
   - Default presets: 1080p, 720p, 4K, Square
   - Add custom presets (name, width, height)
   - Delete presets
   - Persisted to JSON config file

5. **Save & Export**
   - Save dialog with PNG filter
   - Default location: ~/Pictures/Screenshots
   - Filename: screenshot_YYYYMMDD_HHMMSS.png
   - Copy to clipboard

6. **System Integration**
   - System tray icon
   - Tray menu: Capture, Quit
   - Click tray icon to capture
   - Close on Escape (in overlay mode)

### 4.2 User Flows

**Capture Flow**:
1. User presses Ctrl+Shift+5 or clicks tray icon
2. Fullscreen overlay appears
3. User clicks and drags to select region
4. Screenshot captured and cropped
5. Editor opens with screenshot

**Annotation Flow**:
1. User selects tool from toolbar
2. Tool properties (color, stroke) apply
3. User draws/adds annotation on canvas
4. Objects can be selected and deleted

**Save Flow**:
1. User clicks Save button
2. Save dialog opens with PNG filter
3. User chooses location and filename
4. PNG saved to disk
5. Window closes automatically

### 4.3 Data Flow

```
User Input → Overlay (region selection)
    ↓
Rust Backend (screenshot capture)
    ↓
Frontend (image processing & crop)
    ↓
Fabric.js Canvas (annotation)
    ↓
Export (save/clipboard via Rust)
```

### 4.4 Key Modules

| Module | Responsibility |
|--------|---------------|
| `capture.rs` | Screenshot capture, save to file |
| `presets.rs` | Dimension preset CRUD |
| `clipboard.rs` | Copy image to system clipboard |
| `Overlay.tsx` | Region selection UI |
| `Editor.tsx` | Annotation canvas with Fabric.js |
| `appStore.ts` | Zustand state management |

## 5. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+5 | Open capture overlay |
| Escape | Cancel (overlay) / Close (editor) / Close app |
| Ctrl+Shift+P | Toggle preset panel |

## 6. File Structure

```
lightshot-clone/
├── src/                          # React frontend
│   ├── App.tsx                   # Main app component
│   ├── components/
│   │   ├── Overlay.tsx           # Selection overlay
│   │   ├── Editor.tsx           # Annotation editor
│   │   └── PresetPanel.tsx      # Preset management
│   ├── stores/
│   │   └── appStore.ts          # Zustand store
│   └── styles/
│       └── global.css           # Global styles
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs              # Entry point
│   │   ├── capture.rs           # Screenshot capture
│   │   ├── presets.rs           # Preset storage
│   │   └── clipboard.rs         # Clipboard operations
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/                   # App icons
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## 7. Configuration

**Preset Storage**: `%APPDATA%/lightshot-clone/presets.json`

```json
{
  "presets": [
    {"id": "preset_1080p", "name": "1920×1080 (Full HD)", "width": 1920, "height": 1080},
    {"id": "preset_720p", "name": "1280×720 (HD)", "width": 1280, "height": 720}
  ],
  "save_path": "~/Pictures/Screenshots"
}
```

## 8. Out of Scope (Not Implemented)

- User login/authentication
- Cloud upload
- Screenshot sharing
- Screenshot search/organization
- Multiple monitor support (v1)
- Video recording
- OCR text extraction

## 9. Acceptance Criteria

- [ ] App launches without errors
- [ ] Overlay covers entire screen
- [ ] Region selection works with visual feedback
- [ ] Screenshot is captured and cropped correctly
- [ ] All 6 drawing tools function correctly
- [ ] Color picker changes stroke color
- [ ] Stroke width slider works (1-20px)
- [ ] Undo reverts to previous state
- [ ] Delete removes selected object
- [ ] Save dialog opens with PNG filter
- [ ] File saves to selected location
- [ ] Copy to clipboard works
- [ ] System tray icon appears
- [ ] Tray menu items work
- [ ] Preset panel opens/closes
- [ ] Add/delete presets persists
- [ ] Escape key closes app from overlay
