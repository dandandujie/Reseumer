use qrcode::{QrCode, EcLevel};
use qrcode::render::svg;

pub fn generate_svg(content: &str) -> Result<String, String> {
    let code = QrCode::with_error_correction_level(content.as_bytes(), EcLevel::M)
        .map_err(|e| format!("QR code error: {}", e))?;
    let svg = code.render::<svg::Color>()
        .min_dimensions(200, 200)
        .build();
    Ok(svg)
}
