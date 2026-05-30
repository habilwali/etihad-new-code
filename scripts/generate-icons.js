/**
 * Generate Android launcher icons from source.
 * Run: node scripts/generate-icons.js
 * Requires: npm install jimp --save-dev
 */
const fs = require('fs');
const path = require('path');

const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

async function main() {
  let Jimp;
  try {
    ({ Jimp } = require('jimp'));
  } catch {
    console.error('Run: npm install jimp --save-dev');
    process.exit(1);
  }

  const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
  const sourcePath = path.join(__dirname, '..', 'src', 'assets', 'images', 'icon-etihad.png');

  if (!fs.existsSync(sourcePath)) {
    console.error('Source icon not found at:', sourcePath);
    process.exit(1);
  }

  const image = await Jimp.read(sourcePath);

  for (const [folder, size] of Object.entries(sizes)) {
    const dir = path.join(resDir, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const resized = image.clone().resize({ w: size, h: size });
    await resized.write(path.join(dir, 'ic_launcher.png'));
    await resized.write(path.join(dir, 'ic_launcher_round.png'));
  }

  console.log('Icons generated.');
}

main().catch(console.error);
