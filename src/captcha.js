'use strict';

// Simple self-contained SVG captcha: 4 distorted letters + noise.
// The answer is returned to the caller to store in the session.
const ALPHABET = 'ABCDEFGHKMNPRSTUVWXYZ'; // no easily confused letters (I,O,Q,J,L)

function rand(min, max) { return Math.random() * (max - min) + min; }

function generate() {
  let code = '';
  for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];

  const W = 150;
  const H = 54;
  const colors = ['#1f2430', '#3a3f4b', '#7a2030', '#22405e', '#5a2a6e'];

  let letters = '';
  for (let i = 0; i < 4; i++) {
    const x = 22 + i * 31 + rand(-4, 4);
    const y = 37 + rand(-5, 5);
    const rot = rand(-22, 22);
    const fill = colors[Math.floor(Math.random() * colors.length)];
    const fs = rand(28, 34).toFixed(0);
    letters += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Arial,Helvetica,sans-serif" font-size="${fs}" font-weight="700" fill="${fill}" transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">${code[i]}</text>`;
  }

  let noise = '';
  for (let i = 0; i < 4; i++) {
    noise += `<line x1="${rand(0, W).toFixed(0)}" y1="${rand(0, H).toFixed(0)}" x2="${rand(0, W).toFixed(0)}" y2="${rand(0, H).toFixed(0)}" stroke="rgba(255,45,85,0.30)" stroke-width="${rand(1, 2).toFixed(1)}"/>`;
  }
  let dots = '';
  for (let i = 0; i < 28; i++) {
    dots += `<circle cx="${rand(0, W).toFixed(0)}" cy="${rand(0, H).toFixed(0)}" r="${rand(0.6, 1.6).toFixed(1)}" fill="rgba(0,0,0,0.18)"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" rx="10" fill="#eef1f6"/>${noise}${dots}${letters}</svg>`;

  return { code, svg };
}

module.exports = { generate };
