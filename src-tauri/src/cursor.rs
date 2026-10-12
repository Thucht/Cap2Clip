//! Composites the mouse cursor into a captured frame.
//!
//! Neither Desktop Duplication nor a desktop `BitBlt` includes the pointer, so a
//! screenshot taken while the cursor sits inside the selection loses it. Windows
//! still owns the cursor artwork: `GetCursorInfo` hands out the shared icon and
//! `GetIconInfo` its colour bitmap, which can be read straight into RGBA. The
//! pointer is then drawn on top of the frame at the position the capture was
//! taken, which is what Lightshot's "Capture a cursor on a screenshot" option
//! does.
//!
//! The cursor only exists on the desktop that owns the pointer, so a multi-monitor
//! capture draws it on at most one output.

#![cfg(windows)]

use screenshots::image::{Rgba, RgbaImage};
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::{
    GetDIBits, GetDC, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS,
    HBITMAP, HGDIOBJ, RGBQUAD,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorInfo, GetIconInfo, CURSORINFO, CURSOR_SHOWING, HICON, ICONINFO,
};

/// Desktop-space position of the visible cursor, in the same coordinate space
/// `Screen::display_info` reports monitor origins in.
pub fn cursor_position() -> Option<(i32, i32)> {
    // SAFETY: `CURSORINFO` is a plain struct the call fills in; `cbSize` is set
    // here and the result is only read when the call succeeded.
    unsafe {
        let mut info = CURSORINFO {
            cbSize: std::mem::size_of::<CURSORINFO>() as u32,
            ..Default::default()
        };
        if GetCursorInfo(&mut info).is_ok() && info.flags.0 & CURSOR_SHOWING.0 != 0 {
            Some((info.ptScreenPos.x, info.ptScreenPos.y))
        } else {
            None
        }
    }
}

/// Alpha mask and colour pixels of the current cursor icon.
struct CursorArt {
    /// Premultiplied-free BGRA rows, `width * height` pixels.
    pixels: Vec<u8>,
    width: usize,
    height: usize,
    hotspot_x: i32,
    hotspot_y: i32,
}

/// Read the cursor icon's pixels, preferring the 32-bit colour bitmap Windows
/// uses since Vista because it carries its own transparency.
fn read_cursor_art() -> Option<CursorArt> {
    // SAFETY: every call below is a documented Win32 entry point. Each returned
    // handle is checked before use and released on every path.
    unsafe {
        let mut cursor = CURSORINFO {
            cbSize: std::mem::size_of::<CURSORINFO>() as u32,
            ..Default::default()
        };
        if GetCursorInfo(&mut cursor).is_err() {
            return None;
        }

        let mut icon = ICONINFO::default();
        if GetIconInfo(HICON(cursor.hCursor.0), &mut icon).is_err() {
            return None;
        }

        let mask = icon.hbmMask;
        let color = icon.hbmColor;
        let hotspot_x = icon.xHotspot as i32;
        let hotspot_y = icon.yHotspot as i32;
        if !color.is_invalid() {
            if let Some(art) = read_bitmap(color, mask, hotspot_x, hotspot_y) {
                return Some(art);
            }
        }

        // A monochrome cursor has no colour bitmap. The mask is an AND plane, so
        // bit 0 means "opaque"; drawing it as a stencil over a mid-grey block is
        // the only way to tell opaque from transparent without the colour data.
        read_bitmap(mask, mask, hotspot_x, hotspot_y)
    }
}

/// Copy a device bitmap into an RGBA buffer.
///
/// `mask` is used only for its dimensions: on Windows the AND mask of a cursor is
/// stored as a monochrome bitmap whose height covers both planes.
unsafe fn read_bitmap(bitmap: HBITMAP, mask: HBITMAP, hotspot_x: i32, hotspot_y: i32) -> Option<CursorArt> {
    let mut source = BITMAP::default();
    if GetObjectW(
        HGDIOBJ(bitmap.0),
        std::mem::size_of::<BITMAP>() as i32,
        Some((&mut source as *mut BITMAP).cast()),
    ) == 0
    {
        return None;
    }
    let width = source.bmWidth as usize;
    // A cursor mask holds the AND plane stacked on the XOR plane.
    let height = (source.bmHeight as usize) / if source.bmBitsPixel == 1 { 2 } else { 1 };
    if width == 0 || height == 0 || width > 1024 || height > 1024 {
        return None;
    }

    let mut info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            // A negative height requests a top-down DIB, so the rows arrive in
            // the same order the cursor is drawn in.
            biHeight: -(height as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: 0,
            ..Default::default()
        },
        bmiColors: [RGBQUAD::default(); 1],
    };

    let mut pixels = vec![0u8; width * height * 4];
    let screen = GetDC(Some(HWND(std::ptr::null_mut())));
    if screen.is_invalid() {
        return None;
    }
    let copied = GetDIBits(
        screen,
        bitmap,
        0,
        height as u32,
        Some(pixels.as_mut_ptr().cast()),
        &mut info,
        DIB_RGB_COLORS,
    );
    let _ = ReleaseDC(Some(HWND(std::ptr::null_mut())), screen);

    if copied == 0 {
        return None;
    }

    // A monochrome source has no per-pixel transparency. Reuse the mask plane
    // to recover it: anything the AND mask keeps visible is opaque.
    if source.bmBitsPixel == 1 {
        let mut mask_pixels = vec![0u8; width * height * 4];
        let mut mask_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0,
                ..Default::default()
            },
            bmiColors: [RGBQUAD::default(); 1],
        };
        let screen = GetDC(Some(HWND(std::ptr::null_mut())));
        if !screen.is_invalid() {
            GetDIBits(
                screen,
                mask,
                0,
                height as u32,
                Some(mask_pixels.as_mut_ptr().cast()),
                &mut mask_info,
                DIB_RGB_COLORS,
            );
            let _ = ReleaseDC(Some(HWND(std::ptr::null_mut())), screen);
        }
        for (pixel, mask_pixel) in pixels.chunks_exact_mut(4).zip(mask_pixels.chunks_exact(4)) {
            let lum = u32::from(mask_pixel[0])
                + u32::from(mask_pixel[1])
                + u32::from(mask_pixel[2])
                + u32::from(mask_pixel[3]);
            pixel[3] = if lum > 384 { 0 } else { 255 };
            if pixel[3] == 0 {
                pixel[0] = 0;
                pixel[1] = 0;
                pixel[2] = 0;
            }
        }
    }

    Some(CursorArt {
        pixels,
        width,
        height,
        hotspot_x,
        hotspot_y,
    })
}

/// Nearest-neighbour resize of the cursor artwork.
fn scale_art(art: &CursorArt, factor: f64) -> Option<CursorArt> {
    if (factor - 1.0).abs() < f64::EPSILON {
        return Some(CursorArt {
            pixels: art.pixels.clone(),
            width: art.width,
            height: art.height,
            hotspot_x: art.hotspot_x,
            hotspot_y: art.hotspot_y,
        });
    }
    if !(0.25..=8.0).contains(&factor) {
        return None;
    }
    let width = ((art.width as f64) * factor).round().max(1.0) as usize;
    let height = ((art.height as f64) * factor).round().max(1.0) as usize;
    let mut pixels = vec![0u8; width * height * 4];
    for y in 0..height {
        let source_y = ((y as f64 / factor).floor() as usize).min(art.height - 1);
        for x in 0..width {
            let source_x = ((x as f64 / factor).floor() as usize).min(art.width - 1);
            let from = (source_y * art.width + source_x) * 4;
            let to = (y * width + x) * 4;
            pixels[to..to + 4].copy_from_slice(&art.pixels[from..from + 4]);
        }
    }
    Some(CursorArt {
        pixels,
        width,
        height,
        hotspot_x: (art.hotspot_x as f64 * factor).round() as i32,
        hotspot_y: (art.hotspot_y as f64 * factor).round() as i32,
    })
}

/// Draw the cursor into `frame`.
///
/// `origin` is the desktop-space top-left corner of the frame and `scale` the
/// monitor scale factor, so a HiDPI pointer is drawn at the size Windows shows
/// it. Returns whether anything was drawn.
pub fn draw_cursor(
    frame: &mut RgbaImage,
    origin: (i32, i32),
    desktop_position: (i32, i32),
    scale: f64,
) -> bool {
    let Some(art) = read_cursor_art().and_then(|art| scale_art(&art, scale)) else {
        return false;
    };

    let left = desktop_position.0 - origin.0 - art.hotspot_x;
    let top = desktop_position.1 - origin.1 - art.hotspot_y;

    let mut drawn = false;
    for row in 0..art.height {
        let target_y = top + row as i32;
        if target_y < 0 || target_y >= frame.height() as i32 {
            continue;
        }
        for column in 0..art.width {
            let target_x = left + column as i32;
            if target_x < 0 || target_x >= frame.width() as i32 {
                continue;
            }
            let from = (row * art.width + column) * 4;
            // The bitmap is BGRA, the frame is RGBA.
            let pixel = Rgba([
                art.pixels[from + 2],
                art.pixels[from + 1],
                art.pixels[from],
                art.pixels[from + 3],
            ]);
            if pixel[3] == 0 {
                continue;
            }
            frame.put_pixel(target_x as u32, target_y as u32, pixel);
            drawn = true;
        }
    }
    drawn
}

#[cfg(test)]
mod tests {
    use super::scale_art;

    fn art(width: usize, height: usize, hotspot: (i32, i32)) -> super::CursorArt {
        let mut pixels = vec![0u8; width * height * 4];
        for pixel in pixels.chunks_exact_mut(4) {
            pixel[0] = 1;
            pixel[1] = 2;
            pixel[2] = 3;
            pixel[3] = 255;
        }
        super::CursorArt {
            pixels,
            width,
            height,
            hotspot_x: hotspot.0,
            hotspot_y: hotspot.1,
        }
    }

    #[test]
    fn identity_scaling_keeps_the_cursor_size() {
        let source = art(8, 12, (3, 4));
        let scaled = scale_art(&source, 1.0).unwrap();
        assert_eq!((scaled.width, scaled.height), (8, 12));
        assert_eq!((scaled.hotspot_x, scaled.hotspot_y), (3, 4));
    }

    #[test]
    fn dpi_scaling_scans_the_cursor_and_its_hotspot() {
        let source = art(32, 32, (16, 16));
        let scaled = scale_art(&source, 1.5).unwrap();
        assert_eq!((scaled.width, scaled.height), (48, 48));
        assert_eq!((scaled.hotspot_x, scaled.hotspot_y), (24, 24));
        assert_eq!(scaled.pixels.len(), 48 * 48 * 4);
    }

    #[test]
    fn an_absurd_scale_is_refused_instead_of_allocating() {
        let source = art(32, 32, (0, 0));
        assert!(scale_art(&source, 4096.0).is_none());
    }
}