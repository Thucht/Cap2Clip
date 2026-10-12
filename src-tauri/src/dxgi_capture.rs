//! Desktop capture through the DXGI Desktop Duplication API.
//!
//! `BitBlt` on the desktop device context - which is what the `screenshots`
//! crate does on Windows - only sees what GDI composites. Hardware accelerated
//! surfaces (Chrome, video players, GPU wallpapers, anything drawn through
//! D3D/FLIP) arrive black, transparent or one frame stale. DXGI Desktop
//! Duplication hands out the real frame the display engine produced.
//!
//! This is the mechanism Lightshot ships in `DXGIODScreenshot.dll`, which
//! imports exactly `d3d11!D3D11CreateDevice` and `dxgi!CreateDXGIFactory1`
//! next to its `BitBlt` fallback. The same split is reproduced here: DXGI is
//! the primary path and GDI stays as the fallback, so a display that refuses
//! duplication never fails the capture.
//!
//! Outputs are matched to `screenshots` monitors by their desktop-space
//! rectangle, which keeps mixed-DPI and multi-adapter desktops resolving to the
//! same monitor the overlay geometry was computed from.

#![cfg(windows)]

use screenshots::image::{Rgba, RgbaImage};
use windows::core::{Interface, HRESULT};
use windows::Win32::Foundation::HMODULE;
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_UNKNOWN;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Resource, ID3D11Texture2D,
    D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_FLAG, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ,
    D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIAdapter1, IDXGIFactory1, IDXGIOutput, IDXGIOutput1, IDXGIOutput6,
    IDXGIOutputDuplication, IDXGIResource, DXGI_OUTDUPL_FRAME_INFO,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_MODE_ROTATION, DXGI_SAMPLE_DESC};

/// `DXGI_ERROR_ACCESS_LOST`: the display mode changed and this duplication
/// object is dead. The frame is dropped and GDI covers the monitor.
const DXGI_ERROR_ACCESS_LOST: HRESULT = HRESULT(0x887A0006u32 as i32);

const DXGI_MODE_ROTATION_90: DXGI_MODE_ROTATION = DXGI_MODE_ROTATION(2);
const DXGI_MODE_ROTATION_180: DXGI_MODE_ROTATION = DXGI_MODE_ROTATION(4);
const DXGI_MODE_ROTATION_270: DXGI_MODE_ROTATION = DXGI_MODE_ROTATION(6);


/// One output captured through Desktop Duplication, in desktop coordinates.
pub struct DuplicatedOutput {
    /// Desktop-space origin, the same coordinate space `EnumDisplayMonitors`
    /// reports a monitor origin in.
    pub x: i32,
    pub y: i32,
    /// Desktop-space size, i.e. already in the orientation Windows reports the
    /// monitor rectangle in.
    pub image: RgbaImage,
}

/// Capture every output the display engine exposes.
///
/// Yields an empty list when DXGI is unusable so the caller falls back to GDI
/// wholesale instead of mixing sources per monitor. Enumeration stops on the
/// first adapter or output that cannot be walked, which mirrors how a display
/// driver that refuses duplication degrades the whole capture.
pub fn capture_outputs() -> Vec<DuplicatedOutput> {
    // SAFETY: every call below is a documented DXGI/D3D11 entry point, and each
    // returned HRESULT or COM object is checked before it is dereferenced.
    unsafe { capture_outputs_inner() }.unwrap_or_default()
}

unsafe fn capture_outputs_inner() -> Result<Vec<DuplicatedOutput>, HRESULT> {
    let factory: IDXGIFactory1 = CreateDXGIFactory1()?;

    let mut captured = Vec::new();
    let mut adapter_index = 0u32;
    while let Ok(adapter) = factory.EnumAdapters1(adapter_index) {
        // `DuplicateOutput` requires the D3D11 device to be created on the very
        // adapter that owns the output, so the device is per-adapter.
        if let Some((device, context)) = create_device(&adapter) {
            let mut output_index = 0u32;
            while let Ok(output) = adapter.EnumOutputs(output_index) {
                // A frame that is entirely black is what a display engine hands
                // out when duplication raced a mode switch or an overlay driver
                // (streaming, remote desktop) took the output over. One retry
                // usually recovers; when it does not the output is dropped so
                // the caller falls back to GDI instead of saving a black image.
                let duplicated = capture_output(&device, &context, &output)
                    .filter(|frame| !is_uniformly_black(&frame.image))
                    .or_else(|| {
                        capture_output(&device, &context, &output)
                            .filter(|frame| !is_uniformly_black(&frame.image))
                    });
                if let Some(duplicated) = duplicated {
                    captured.push(duplicated);
                }
                output_index = output_index.saturating_add(1);
            }
        }
        adapter_index = adapter_index.saturating_add(1);
    }

    Ok(captured)
}

unsafe fn create_device(adapter: &IDXGIAdapter1) -> Option<(ID3D11Device, ID3D11DeviceContext)> {
    let mut device: Option<ID3D11Device> = None;
    let mut context: Option<ID3D11DeviceContext> = None;
    let created = D3D11CreateDevice(
        adapter,
        D3D_DRIVER_TYPE_UNKNOWN,
        HMODULE::default(),
        D3D11_CREATE_DEVICE_FLAG(0),
        None,
        D3D11_SDK_VERSION,
        Some(&mut device),
        None,
        Some(&mut context),
    );
    match (created, device, context) {
        (Ok(()), Some(device), Some(context)) => Some((device, context)),
        _ => None,
    }
}

unsafe fn capture_output(
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    output: &IDXGIOutput,
) -> Option<DuplicatedOutput> {
    let output1: IDXGIOutput1 = output.cast().ok()?;

    // `DXGI_OUTPUT_DESC` has no rotation field; only `IDXGIOutput6::GetDesc1`
    // reports one. The interface exists since Windows 10 1803, so the plain
    // descriptor stays as the fallback and an unrotated output keeps working.
    let descriptor = output.cast::<IDXGIOutput6>().ok().and_then(|o| o.GetDesc1().ok());
    let bounds = match descriptor {
        Some(ref desc) => desc.DesktopCoordinates,
        None => output.GetDesc().ok()?.DesktopCoordinates,
    };
    let rotation = descriptor
        .map(|desc| desc.Rotation)
        .unwrap_or(DXGI_MODE_ROTATION(0));

    let desktop_width = (bounds.right - bounds.left).max(0) as u32;
    let desktop_height = (bounds.bottom - bounds.top).max(0) as u32;
    if desktop_width == 0 || desktop_height == 0 {
        return None;
    }

    let duplication: IDXGIOutputDuplication = output1.DuplicateOutput(device).ok()?;
    let Some(texture) = acquire_frame(&duplication) else {
        return None;
    };

    let frame = read_texture(device, context, &texture);

    // Hand the frame back before anything else so the display engine is free
    // to produce the next one. Leaving it held keeps a stale front buffer and,
    // on a desktop that only updates when something changes, the frame read
    // back can be an untouched (black) surface.
    let _ = duplication.ReleaseFrame();

    let frame = frame?;
    let image = orient(frame, rotation);

    // The composite planner indexes the source image with monitor-relative
    // coordinates, so a frame that does not line up with the desktop rectangle
    // would shift every crop. Falling back to GDI is correct-but-dimmed, which
    // is preferable to a silently misaligned capture.
    if image.width() != desktop_width || image.height() != desktop_height {
        return None;
    }

    Some(DuplicatedOutput {
        x: bounds.left,
        y: bounds.top,
        image,
    })
}

/// `DXGI_ERROR_WAITED_TIMEOUT`: the duplication object has no new frame yet.
const DXGI_ERROR_WAITED_TIMEOUT: HRESULT = HRESULT(0x887A0027u32 as i32);

/// True when every pixel of the frame is fully opaque black.
///
/// Sampling the corners and the centre is enough: a real desktop frame always
/// differs from the untouched front buffer somewhere in the middle of the
/// screen, while a blacked-out frame is uniform everywhere.
fn is_uniformly_black(image: &RgbaImage) -> bool {
    let (width, height) = (image.width(), image.height());
    if width == 0 || height == 0 {
        return true;
    }
    let probes = [
        (0u32, 0u32),
        (width - 1, 0),
        (0, height - 1),
        (width - 1, height - 1),
        (width / 2, height / 2),
    ];
    probes
        .iter()
        .all(|&(x, y)| image.get_pixel(x, y).0[..3] == [0, 0, 0])
}

/// Acquire the current desktop frame of one output.
///
/// A freshly created duplication object does not necessarily have a frame
/// ready, and `AcquireNextFrame` reporting "no new frame" is not fatal: the
/// display engine only produces one when something on the output changes, so a
/// zero timeout loses the race on an otherwise idle desktop and the capture
/// silently falls back to a black GDI frame. Retrying with a real budget is what
/// makes an unchanged desktop capture as reliably as a busy one.
///
/// `DXGI_ERROR_ACCESS_LOST` must not be followed by `ReleaseFrame`: the object
/// is already dead and the release would corrupt the next attempt.
unsafe fn acquire_frame(duplication: &IDXGIOutputDuplication) -> Option<IDXGIResource> {
    // Short waits, repeated: a frame is usually available within one display
    // refresh, and giving up quickly keeps the capture responsive when the
    // output really cannot be duplicated.
    for timeout_ms in [16u32, 48, 120, 250] {
        let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
        let mut desktop_texture: Option<IDXGIResource> = None;
        match duplication.AcquireNextFrame(timeout_ms, &mut frame_info, &mut desktop_texture) {
            Ok(()) => {
                let texture = desktop_texture.and_then(|resource| resource.cast().ok());
                if texture.is_none() {
                    // Hand the frame back, otherwise the next AcquireNextFrame
                    // blocks until its timeout expires.
                    let _ = duplication.ReleaseFrame();
                }
                return texture;
            }
            Err(error) if error.code() == DXGI_ERROR_ACCESS_LOST => return None,
            Err(error) if error.code() == DXGI_ERROR_WAITED_TIMEOUT => continue,
            Err(_) => return None,
        }
    }
    None
}

/// A duplicated texture staged into CPU-readable memory, still in the panel's
/// native orientation and with its rows padded to `row_pitch`.
struct RawFrame {
    buffer: Vec<u8>,
    width: u32,
    height: u32,
    row_pitch: usize,
}

unsafe fn read_texture(
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    texture: &IDXGIResource,
) -> Option<RawFrame> {
    let source_texture: ID3D11Texture2D = texture.cast().ok()?;

    let mut desc = D3D11_TEXTURE2D_DESC::default();
    source_texture.GetDesc(&mut desc);
    if desc.Width == 0 || desc.Height == 0 {
        return None;
    }

    let staging_desc = D3D11_TEXTURE2D_DESC {
        Width: desc.Width,
        Height: desc.Height,
        MipLevels: 1,
        ArraySize: 1,
        Format: desc.Format,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_STAGING,
        BindFlags: 0,
        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
        MiscFlags: 0,
    };

    let mut staging: Option<ID3D11Texture2D> = None;
    if device
        .CreateTexture2D(&staging_desc, None, Some(&mut staging))
        .is_err()
    {
        return None;
    }
    let staging = staging?;

    let source: ID3D11Resource = source_texture.cast().ok()?;
    let destination: ID3D11Resource = staging.cast().ok()?;

    context.CopyResource(&destination, &source);

    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    if context
        .Map(&destination, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
        .is_err()
    {
        return None;
    }

    let row_pitch = mapped.RowPitch as usize;
    let height = desc.Height as usize;
    let source_ptr = mapped.pData as *const u8;

    let mut buffer = Vec::with_capacity(row_pitch * height);
    if !source_ptr.is_null() {
        // SAFETY: `Map` guarantees `RowPitch * Height` readable bytes at
        // `pData` for the lifetime of the mapping, which ends below.
        buffer.extend_from_slice(std::slice::from_raw_parts(source_ptr, row_pitch * height));
    }

    context.Unmap(&destination, 0);

    Some(RawFrame {
        buffer,
        width: desc.Width,
        height: desc.Height,
        row_pitch,
    })
}

impl RawFrame {
    /// BGRA in, RGBA out, with the per-row padding dropped.
    fn to_image(&self) -> RgbaImage {
        let mut image = RgbaImage::new(self.width, self.height);
        let width = self.width as usize;
        let height = self.height as usize;
        for row in 0..height {
            let start = row * self.row_pitch;
            let end = start + width * 4;
            if end > self.buffer.len() {
                break;
            }
            for column in 0..width {
                let pixel = start + column * 4;
                image.put_pixel(
                    column as u32,
                    row as u32,
                    Rgba([
                        self.buffer[pixel + 2],
                        self.buffer[pixel + 1],
                        self.buffer[pixel],
                        self.buffer[pixel + 3],
                    ]),
                );
            }
        }
        image
    }
}

/// Bring a panel-native frame into desktop orientation.
///
/// Desktop Duplication hands out the panel's native buffer while the desktop
/// rectangle a monitor is reported in is already rotated, so the rotation the
/// output declares is undone here. An unrotated output - the common case -
/// takes a plain copy with no resampling.
fn orient(frame: RawFrame, rotation: DXGI_MODE_ROTATION) -> RgbaImage {
    let source = frame.to_image();
    match rotation {
        DXGI_MODE_ROTATION_90 => rotate_clockwise(&source),
        DXGI_MODE_ROTATION_180 => rotate_half_turn(&source),
        DXGI_MODE_ROTATION_270 => rotate_counter_clockwise(&source),
        _ => source,
    }
}

fn rotate_clockwise(source: &RgbaImage) -> RgbaImage {
    let (width, height) = (source.width(), source.height());
    let mut target = RgbaImage::new(height, width);
    for y in 0..height {
        for x in 0..width {
            target.put_pixel(height - 1 - y, x, *source.get_pixel(x, y));
        }
    }
    target
}

fn rotate_counter_clockwise(source: &RgbaImage) -> RgbaImage {
    let (width, height) = (source.width(), source.height());
    let mut target = RgbaImage::new(height, width);
    for y in 0..height {
        for x in 0..width {
            target.put_pixel(y, width - 1 - x, *source.get_pixel(x, y));
        }
    }
    target
}

fn rotate_half_turn(source: &RgbaImage) -> RgbaImage {
    let (width, height) = (source.width(), source.height());
    let mut target = RgbaImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            target.put_pixel(width - 1 - x, height - 1 - y, *source.get_pixel(x, y));
        }
    }
    target
}

#[cfg(test)]
mod tests {
    use super::{is_uniformly_black, rotate_clockwise, rotate_counter_clockwise, rotate_half_turn};
    use screenshots::image::{Rgba, RgbaImage};

    fn gradient(width: u32, height: u32) -> RgbaImage {
        let mut image = RgbaImage::new(width, height);
        for y in 0..height {
            for x in 0..width {
                image.put_pixel(x, y, Rgba([x as u8, y as u8, 0, 255]));
            }
        }
        image
    }

    #[test]
    fn quarter_turns_swap_the_axes() {
        let source = gradient(3, 2);

        let clockwise = rotate_clockwise(&source);
        assert_eq!((clockwise.width(), clockwise.height()), (2, 3));
        let counter = rotate_counter_clockwise(&source);
        assert_eq!((counter.width(), counter.height()), (2, 3));
    }

    #[test]
    fn opposite_quarter_turns_are_inverses() {
        let source = gradient(4, 3);
        let forward = rotate_clockwise(&source);
        let back = rotate_counter_clockwise(&forward);
        assert_eq!(back.as_raw(), source.as_raw());
    }

    #[test]
    fn half_turn_is_its_own_inverse() {
        let source = gradient(4, 3);
        let once = rotate_half_turn(&source);
        let twice = rotate_half_turn(&once);
        assert_eq!(twice.as_raw(), source.as_raw());
        assert_ne!(once.as_raw(), source.as_raw());
    }

    #[test]
    fn an_untouched_front_buffer_is_treated_as_black() {
        let blank = RgbaImage::from_pixel(4, 4, Rgba([0, 0, 0, 255]));
        assert!(is_uniformly_black(&blank));

        // The frame a display engine hands back after a lost duplication can
        // still carry an alpha channel, so the check must not depend on it.
        let transparent = RgbaImage::from_pixel(4, 4, Rgba([0, 0, 0, 0]));
        assert!(is_uniformly_black(&transparent));

        let wallpaper = gradient(4, 4);
        assert!(!is_uniformly_black(&wallpaper));
    }
}
