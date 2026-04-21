const sharp = require('sharp');
const fs = require('fs');

async function generate() {
  const svgBuffer = fs.readFileSync('public/logo-icon.svg');
  
  await sharp(svgBuffer).resize(192, 192).toFile('public/icon-192.png');
  console.log('Generated icon-192.png');
  
  await sharp(svgBuffer).resize(512, 512).toFile('public/icon-512.png');
  console.log('Generated icon-512.png');
  
  await sharp(svgBuffer).resize(180, 180).toFile('public/apple-touch-icon.png');
  console.log('Generated apple-touch-icon.png');
}

generate().catch(console.error);
