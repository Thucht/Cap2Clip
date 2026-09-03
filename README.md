# Lightshot Clone

A lightweight, cross-platform screenshot capture and annotation tool built with Tauri v2. Inspired by Lightshot for Windows/Mac.

![Lightshot Clone](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-blue)
![Rust](https://img.shields.io/badge/Rust-1.70+-orange)
![React](https://img.shields.io/badge/React-18-blue)

## Features

- 📸 **Screenshot Capture** - Full screen capture with region selection
- ✏️ **Drawing Tools** - Rectangle, Circle, Arrow, Pencil, Text
- 🎨 **Customization** - Color picker, adjustable stroke width
- 📐 **Dimension Presets** - Save and manage custom screen sizes
- 💾 **Save & Copy** - Export as PNG or copy to clipboard
- 🖥️ **System Tray** - Quick access from system tray
- ⌨️ **Global Shortcut** - Ctrl+Shift+5 to capture from anywhere

## Quick Start

```bash
# Install dependencies
npm install

# Development
npm run tauri dev

# Production build
npm run tauri build
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+5` | Open capture overlay |
| `Escape` | Cancel / Close app |
| `Ctrl+Shift+P` | Toggle preset panel |

## Drawing Tools

| Tool | Shortcut | Description |
|------|----------|-------------|
| Select | V | Select and move objects |
| Rectangle | R | Draw rectangle shapes |
| Circle | C | Draw circle shapes |
| Arrow | A | Draw arrows |
| Pencil | P | Freehand drawing |
| Text | T | Add text annotations |

## Project Structure

```
lightshot-clone/
├── src/                     # React frontend
│   ├── components/          # UI components
│   ├── stores/              # Zustand state
│   └── styles/              # CSS styles
├── src-tauri/               # Rust backend
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   ├── capture.rs      # Screenshot capture
│   │   ├── presets.rs      # Preset storage
│   │   └── clipboard.rs    # Clipboard operations
│   └── icons/              # App icons
└── package.json
```

## Tech Stack

- **Tauri v2** - Rust-powered desktop framework
- **React 18** - UI framework
- **Fabric.js** - Canvas manipulation
- **Zustand** - State management
- **Vite** - Build tool

## Configuration

Presets are stored in:
- **Windows**: `%APPDATA%/lightshot-clone/presets.json`
- **macOS**: `~/Library/Application Support/com.lightshot.clone/presets.json`

## License

MIT License
