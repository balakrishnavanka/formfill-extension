// ──────────────────────────────────────────────────────
//  FormFill Pro — Icon Generator
//  Run this once in any browser console or Node.js
//  to generate proper PNG icons from the source image.
//
//  Usage in browser console:
//    Paste this script and run it. PNG files will be
//    auto-downloaded (16.png, 48.png, 128.png).
//
//  Alternatively, use the Python script in scripts/
// ──────────────────────────────────────────────────────

async function generateIcons(sourceImageUrl) {
  const sizes = [16, 48, 128];
  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = sourceImageUrl;
  });

  for (const size of sizes) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);

    // Download
    const a = document.createElement('a');
    a.download = `icon-${size}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('Icons generated! Place them in the /icons folder of the extension.');
}

// Call with path to your source image:
// generateIcons('path/to/formfill_icon_source.png');
