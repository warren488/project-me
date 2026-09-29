// Renders public/social-card.png (1200x630), the image behind link previews.
// Needs sharp: `npx -p sharp node scripts/build-social-card.js`, or
// `npm run og:build` once sharp is installed locally.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "social-card.png");
const PORTRAIT = path.join(ROOT, "public", "images", "portrait.jpeg");

const W = 1200;
const H = 630;
const BG = "#151a2d";
const TEXT = "#d7dbe4";
const MUTED = "#9aa3b8";
const ACCENT = "#ffb454";
const SIZE = 300; // portrait diameter

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const background = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.2" fill="${TEXT}" fill-opacity="0.18"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  <rect x="0" y="${H - 10}" width="${W}" height="10" fill="${ACCENT}"/>
  <g font-family="Raleway, 'DejaVu Sans', Helvetica, Arial, sans-serif">
    <text x="90" y="215" font-size="24" font-weight="700" letter-spacing="4" fill="${ACCENT}">HI, I'M</text>
    <text x="90" y="300" font-size="58" font-weight="800" fill="${TEXT}">Warren Scantlebury</text>
    <text x="90" y="356" font-size="34" font-weight="600" fill="${MUTED}">Full Stack Software Engineer</text>
    <text x="90" y="430" font-size="24" fill="${TEXT}" fill-opacity="0.85">TypeScript · React · Node.js · GCP · PWAs</text>
    <text x="90" y="540" font-size="24" font-weight="600" fill="${ACCENT}">warren.scantlebury.io</text>
  </g>
</svg>`;

const circleMask = `
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="#fff"/>
</svg>`;

const ring = `
<svg width="${SIZE + 24}" height="${
  SIZE + 24
}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${(SIZE + 24) / 2}" cy="${(SIZE + 24) / 2}" r="${
  SIZE / 2 + 8
}" fill="none" stroke="${ACCENT}" stroke-width="4"/>
</svg>`;

async function main() {
  const portrait = await sharp(PORTRAIT)
    .resize(SIZE, SIZE, { fit: "cover", position: "top" })
    .composite([{ input: Buffer.from(circleMask), blend: "dest-in" }])
    .png()
    .toBuffer();

  const x = W - SIZE - 80;
  const y = Math.round((H - SIZE) / 2);

  await sharp(Buffer.from(background))
    .composite([
      { input: Buffer.from(ring), left: x - 12, top: y - 12 },
      { input: portrait, left: x, top: y },
    ])
    .png({ compressionLevel: 9 })
    .toFile(OUT);

  const { size } = fs.statSync(OUT);
  console.log(
    `Wrote ${path.relative(ROOT, OUT)} (${Math.round(size / 1024)} KB)`
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
