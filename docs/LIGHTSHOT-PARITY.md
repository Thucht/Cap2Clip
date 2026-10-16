# Lightshot parity

"Lightshot parity" in this repository means: where Cap2Clip implements the same
user-visible behaviour as the Lightshot desktop app, it uses the same option
names, the same defaults, and the same capture strategy, so a Lightshot user can
switch without relearning anything. It does **not** mean a clone — Cap2Clip stays
local-only (see [README](../README.md)).

This page records which claims are actually backed by evidence, which are
deliberate deviations, and what is still unknown.

## How the Lightshot side was verified

Two independent sources:

1. **Cap2Clip source** — authoritative for what Cap2Clip does. Every Cap2Clip
   claim below cites a file and line.
2. **The shipped Lightshot 5.5.0.7 binaries on this machine** — disassembled and
   decompiled with Ghidra 12.1.4. This is the only way to know what Lightshot
   really does, because Skillbrains publish no protocol or design docs.

| Artifact | Size | SHA-256 |
| --- | --- | --- |
| `5.5.0.7\Lightshot.exe` | 499,624 | `0b899508777d7ed5159e2a99a5eff60c54d0724493df3d630525b837fa43aa51` |
| `5.5.0.7\Lightshot.dll` | 502,696 | `04a27f0d1e89341722461119e00a10e00ec2a52f5e305961161ec4378e610e93` |
| `5.5.0.7\DXGIODScreenshot.dll` | 95,656 | `6acdcd817cc5df637aa4cd101c25c9e0a69c778347a7a40ce7511eeea26fd6f0` |

Install location comes from the uninstall key
`HKLM\SOFTWARE\WOW6432Node\...\Uninstall\{30A5B3C9-2084-4063-A32A-628A98DE512B}_is1`
→ `C:\Program Files (x86)\Skillbrains\lightshot\`, display version
`Lightshot-5.5.0.7`.

Labels are quoted from `5.5.0.7\locales\en.txt`, which is the shipped English
string table, so a label match is a real match and not a guess.

> **Note on method.** These findings have no REA Evidence ID. REA's Windows
> disassembler only accepts application-role PE files and rejects DLLs with
> `executable_role: shared-library`, so the two DLLs were analysed with
> `analyzeHeadless.bat` directly. The offsets that the interpretation depends on
> were checked against the Windows SDK headers, not guessed from memory. See
> [Reproducing this](#reproducing-this).

## Settings parity

Cap2Clip reads its settings from `%APPDATA%\cap2clip\settings.json`
([`settings.rs`](../src-tauri/src/settings.rs)). Lightshot keeps its options in
the registry under `HKCU\Software\SkillBrains\Lightshot`. The values in the table
below were read from a live install.

| Cap2Clip key | Cap2Clip default | Lightshot value | Lightshot UI label (`en.txt`) | Status |
| --- | --- | --- | --- | --- |
| `show_notifications` | `true` | `ShowBubbles = 1` | "Show notifications about copying and saving" (75) | matches |
| `capture_cursor` | `false` | `CaptureCursor = 0` | "Capture a cursor on a screenshot" (76) | matches, label identical |
| `keep_selection` | `true` | `KeepSelection = 1` | "Keep the selected area position" (86) | matches, label identical |
| `image_format` | `"png"` | `UploadFormat = 1` | "Upload using the format" (84) | renamed on purpose, enum unresolved |
| `jpeg_quality` | `90` | `JpegQuality = 100` | "JPEG quality" (85) | **deviation** |

Defaults are declared in three places and kept in step by tests:
`settings.rs:94-98` (Rust), `App.tsx:91-95` (TypeScript), and the read-back test
`settings::tests::parity_values_that_were_saved_are_read_back`
(`settings.rs:726-740`).

### The released 1.0.0 binary read the old directory

The shipped `releases\Cap2Clip.exe` (16,080,384 bytes, SHA-256
`8047e5184aca6152d6eb121e9b1d9ab0f7135140ba50e2ad69382536e76556d6`) was scanned
for literal strings rather than disassembled, which is enough to answer a
question about stored paths. Its `.rdata` string pool contains, contiguously:

| Offset | Literal |
| --- | --- |
| `0xda9a0c` | `Software\Microsoft\Windows\CurrentVersion\Run` |
| `0xda9a39` | `ScreenshotApp` |
| `0xda9a46` | `screenshot-app` |
| `0xda9a54` | `settings.json` |

So the binary users actually installed resolves its settings file as
`%APPDATA%\screenshot-app\settings.json`. The other five occurrences of
`cap2clip` in the same file are the Rust type path `cap2clip::capture::CaptureSessions`
(`0x693c38`), the bundle identifier `com.thucht.cap2clip` (`0x69dce3`), the product
block (`0x69e1c9`), the print temp-file prefix `cap2clip-print-` (`0xda9651`) and
`cap2clip.pdb` (`0xeef4e4`) — none of them is a settings directory.

That is why the settings directory is now `cap2clip` with a one-time migration
from `screenshot-app` (`settings.rs`, `migrate_legacy_settings`): the README
advertised `cap2clip` while every released build used `screenshot-app`, and real
installs have data in the old directory. The migration copies only when the new
file is missing and leaves the old file alone, so a rollback still finds its
settings. It is covered by `settings::tests::legacy_settings_are_copied_once_and_left_in_place`
and `settings::tests::migration_never_overwrites_a_file_that_already_exists`.

### Deviation: `jpeg_quality` 90 vs 100

Lightshot ships `JpegQuality = 100`. Cap2Clip defaults to 90. This is a real
difference, not a rounding artefact, and it is left alone deliberately: 90 is
visually indistinguishable from 100 at a fraction of the file size, and Cap2Clip
defaults to PNG anyway, so the value only matters for a user who switches to
JPEG on purpose. A user who wants Lightshot's behaviour sets `"jpeg_quality":
100`. Values outside 1..100 are clamped at `settings.rs:368`.

### Deviation: "Save using the format" vs "Upload using the format"

Lightshot's label is about uploading, because in Lightshot that format also
drives the prntscr.com upload. Cap2Clip has no upload path
([README:17](../README.md#features)), so the label
([`SettingsPanel.tsx:197`](../src/components/SettingsPanel.tsx)) describes the one
thing the option actually controls. Renaming it to "Upload" would be a lie.

### Deviation: autostart value name

Cap2Clip writes its autostart entry as the registry value `ScreenshotApp`
(`settings.rs:420`, deleted at `settings.rs:424`); Lightshot uses `Lightshot`.
The name is a leftover from the earlier product name. It is **not** renamed here:
renaming without also deleting the old value would leave both entries and launch
the app twice at logon. If it is ever renamed, the migration has to delete
`ScreenshotApp` and write the new value in the same code path.

## Capture pipeline

Both apps use DXGI Desktop Duplication and both fall back to GDI. They do it in
**opposite orders**, and each one guards the fast path with a blank-frame check.

| | Lightshot 5.5.0.7 | Cap2Clip |
| --- | --- | --- |
| Primary path | GDI: `GetWindowDC(NULL)` + `BitBlt` (`SRCCOPY \| CAPTUREBLT`, `0x40cc0020`) | DXGI Desktop Duplication (`dxgi_capture.rs:69` `CreateDXGIFactory1`, `:147` `DuplicateOutput`) |
| Fallback | DXGI duplication, via the `DXGIODScreenshot.dll` plugin | GDI, `screen.capture()` (`capture.rs:114`) |
| Blank-frame guard | `FUN_10005040` samples the grabbed bitmap at a 4-byte stride and returns "uniform" if every sampled pixel matches; uniform or a failed `BitBlt` triggers the plugin | `is_uniformly_black` (`dxgi_capture.rs:186`) rejects an all-black frame, and the caller falls back to GDI (`dxgi_capture.rs:85-88`) |
| Frame wait | one `AcquireNextFrame` with a 60 ms timeout | retry ladder 16 / 48 / 120 / 250 ms (`dxgi_capture.rs:218-232`) |
| Cursor | GDI `GetCursorInfo` + `GetIconInfo` + `DrawIcon`, run on **both** capture paths (see below); the duplication's `GetFramePointerShape` / `MapDesktopSurface` are also called inside the plugin | always composited in Rust: `cursor::cursor_position` + `cursor::draw_cursor`, gated on `capture_cursor` at `capture.rs:121`, with the per-monitor test in `cursor_is_on_monitor` (`capture.rs:142`) |

The two blank-frame guards are mirror images of each other and both exist for the
same reason: a desktop-composited or hardware-accelerated surface can come back
as an untouched front buffer. Cap2Clip's own comment says this directly
(`dxgi_capture.rs:6-7`, `:79-83`).

### Lightshot's plugin chain (from the binaries)

Observation, with addresses in `Lightshot.dll` unless noted:

- `Lightshot.exe` is a thin host. It does `PathFileExistsW` + `LoadLibraryW` of
  `\Lightshot.dll` and resolves exactly five exports: `MakeScreenshot`,
  `MakeScreenshotByCommand`, `SetTranslations`, `InitLightshot`,
  `DeinitLightshot`.
- `MakeScreenshot` @`10007080` takes the mutex `COOL_SCREENSHOT_MUTEX_YARRR`
  (single instance), then calls the full-screen grab `FUN_10011090`.
- `FUN_10011090` builds the virtual-screen rect from
  `GetSystemMetrics(SM_X/Y/CX/CYVIRTUALSCREEN)`, grabs it with GDI, then checks
  the result with `FUN_10005040`. On a uniform or failed grab it calls the plugin
  pointer as `(*fp)(hdc, left, top)`.
- The plugin is loaded by `FUN_100018c0`: an OS-version gate (`FUN_100017f0`,
  `VerifyVersionInfoW` + `VerSetConditionMask`), then path-combine
  `L"DXGIODScreenshot.dll"`, `PathFileExistsW`, `LoadLibraryW`, and
  `GetProcAddress(hModule, "TakeScreenshotExp")`. Both the module handle and the
  function pointer are cached, and a failure latches the plugin off.
- `DXGIODScreenshot.dll!TakeScreenshotExp` @`10001540` → `FUN_10002230` →
  `FUN_10001d50`, which calls `CreateDXGIFactory1` and `D3D11CreateDevice` and
  then the COM vtable slot at `+0x58`.

The COM calls are indirect, so they carry no names in the binary. Reading them
needs the vtable offsets, which were taken from the SDK headers
(`Windows Kits\10\Include\10.0.26100.0\um\dxgi.h`, `dxgi1_2.h`):

| Slot offset | Method | Call site |
| --- | --- | --- |
| `+0x58` | `IDXGIOutput1::DuplicateOutput` (slot 22) | `10001f5f` in `FUN_10001d50` |
| `+0x20` | `IDXGIOutputDuplication::AcquireNextFrame` (slot 8) | `FUN_10001b90`, called with `0x3c` = 60 ms |
| `+0x2c` | `IDXGIOutputDuplication::GetFramePointerShape` (slot 11) | `FUN_10001930` |
| `+0x30` | `IDXGIOutputDuplication::MapDesktopSurface` (slot 12) | `FUN_10001930` |
| `+0x38` | `IDXGIOutputDuplication::ReleaseFrame` (slot 14) | `FUN_10001b90`, on both the success and error path |
| `+0x1c` | `IDXGIAdapter::EnumOutputs` (slot 7) | `FUN_10001670`, `FUN_10001800`, in an index loop |

Inference (high confidence): the object at `+0x20`/`+0x2c`/`+0x30`/`+0x38` is an
`IDXGIOutputDuplication`, because those four methods only exist on that interface
and the 60 ms argument matches `AcquireNextFrame`'s timeout parameter.

Inference (medium confidence): `FUN_10005040` means "is this bitmap one uniform
colour". The loop steps by 4 bytes (32 bpp) and compares the RGB triplets of
sampled pixels, returning true only while they all match.

The absence of the strings `DuplicateOutput`, `AcquireNextFrame`,
`IDXGIOutputDuplication` and `DXGI_ERROR_ACCESS_LOST` from these binaries is
**not** evidence that Lightshot avoids Desktop Duplication. Those are COM vtable
methods, so they never appear as import names.

### How Lightshot composites the cursor

`FUN_10011090` ends with a cursor block that is reached from **both** capture
paths. The shortcut taken when the plugin succeeds is `goto LAB_10011298`, and
that label sits *before* the cursor block, so jumping to it does not skip the
block:

```
LAB_10011298:  look up the setting named L"CaptureCursor"
               if it reads 1:
                 GetCursorInfo  -> only when flags == CURSOR_SHOWING
                 GetIconInfo    -> hCursor, xHotspot, yHotspot
                 DrawIcon(hdc, pt.x - xHotspot, pt.y - yHotspot, hCursor)
```

Two details worth recording. The setting is looked up **by name** at capture time
rather than read from a cached flag, and the draw is offset by the icon hotspot.
The decompiler prints the call as
`DrawIcon(hdc, local_2c - xHotspot, local_28 - yHotspot, ...)`, which looks like a
size rather than a position: `CURSORINFO.ptScreenPos` lands on the same two stack
slots the function had used earlier for the bitmap width and height, so by that
point they hold the cursor point.

The observable behaviour therefore matches Cap2Clip's: the pointer is composited
after the grab, only when the option is on, at the cursor position adjusted by the
hotspot. The mechanism differs — Lightshot calls GDI `DrawIcon`, Cap2Clip
composites the cursor bitmap in Rust (`cursor::draw_cursor`).

Unknown: the plugin also calls `GetFramePointerShape` and `MapDesktopSurface`, and
a duplicated frame normally already contains the hardware cursor. Whether the
plugin blits a cursor-inclusive surface into the caller's HDC, which would draw
the pointer twice when `CaptureCursor` is on, was not resolved.

## Feature gaps

These are Lightshot features Cap2Clip does not have. They are gaps, not parity
bugs, and they are consistent with Cap2Clip's local-only scope:

- Blur / pixelate as a first-class tool — Lightshot ships it
  ("Blur", `en.txt:63`); Cap2Clip's blur is documented as not production-ready
  ([README:110-112](../README.md#blur--pixelate-roadmap)).
- Upload to prntscr.com (`en.txt:8`) and social share (`en.txt:11-18`).
- OptiPNG optimisation of saved PNGs (`en.txt:98`).
- Extra hotkeys: "Instant save of the fullscreen" and "Instant upload of the
  fullscreen" (`en.txt:89-90`). Lightshot stores them as
  `Hotkey_{main,savefull,uploadfull}_{enabled,mod,vk}` using the Win32
  `RegisterHotKey` modifier bits (1 = ALT, 2 = CONTROL, 4 = SHIFT); vk 44 is
  PrintScreen.

## Unknowns

- **`UploadFormat` enum.** The live install has `UploadFormat = 1`. Which value
  means PNG and which means JPG was not resolved, so the mapping to
  `image_format` is unverified.
- **The OS floor of the plugin gate.** `FUN_100017f0` calls `VerifyVersionInfoW`
  with a mask over major/minor/service-pack fields. The stack constants 6 and 3
  are consistent with a 6.3 (Windows 8.1) floor, which fits Desktop Duplication,
  but the exact threshold was not confirmed.
- **The interactive region-capture order.** `FUN_10011090` is reached from
  `MakeScreenshot`, the full-screen entry. Whether the interactive selection path
  uses the same GDI-first order was not traced.
- **The shipped Cap2Clip UI could not be inspected.** The same string scan finds
  `index.html?window=settings` and `index.html?window=toast` in the binary but not
  a single UI label, because `frontendDist` is embedded compressed. The absence of
  `Keep the selected area position`, `Save using the format` and
  `Show notifications` from the binary is therefore **not** evidence that the
  shipped UI lacks them; it only shows the frontend is not stored as plaintext.
  The on-disk `dist/` also predates the parity commit, so the shipped UI was not
  compared against the source.

## Reproducing this

Ghidra 12.1.4, persistent project, DLLs analysed without re-importing:

```
analyzeHeadless.bat <project-dir> ls_proj -import <copy-of-dll>     # once
analyzeHeadless.bat <project-dir> ls_proj -process <name> -noanalysis \
    -scriptPath <scripts> -postScript DumpPe.java                   # exports, imports,
                                                                    # strings, indirect calls
analyzeHeadless.bat <project-dir> ls_proj -process <name> -noanalysis \
    -scriptPath <scripts> -postScript TracePe.java <addr> ...       # call graph + pseudocode
analyzeHeadless.bat <project-dir> ls_proj -process <name> -noanalysis \
    -scriptPath <scripts> -postScript XrefPe.java  <addr> ...       # who references a string
```

Two Windows gotchas: `analyzeHeadless.bat` cannot handle a path containing
`(x86)`, so the DLLs were copied to a paren-free directory first, and the copies
were confirmed byte-identical to the originals by SHA-256 (table above). The
vtable offsets were read out of the SDK headers by a script rather than typed
from memory.

For questions that only need stored constants, a plain literal scan of the binary
is enough and takes seconds; that is how the settings-path finding above was
established. It is not enough for behaviour, and it cannot see compressed
payloads at all.

The same caution applies to Cap2Clip's own binary: `DuplicateOutput` and
`DXGI_ERROR_ACCESS_LOST` return zero hits in `releases\Cap2Clip.exe` even though
`dxgi_capture.rs:147` calls `DuplicateOutput`, for exactly the reason they return
zero hits in Lightshot — they are COM vtable methods, not import names.
