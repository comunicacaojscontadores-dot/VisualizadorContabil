// Gera um icon.png simples via canvas (rode com: node electron/create-icon.js)
// Substitua electron/icon.png e electron/icon.ico por um ícone real depois
const { createCanvas } = require("canvas");
const fs = require("fs");

const size = 256;
const canvas = createCanvas(size, size);
const ctx = canvas.getContext("2d");

// Fundo
const grad = ctx.createLinearGradient(0, 0, size, size);
grad.addColorStop(0, "#6366f1");
grad.addColorStop(1, "#8b5cf6");
ctx.fillStyle = grad;
ctx.roundRect(0, 0, size, size, 48);
ctx.fill();

// Letra C
ctx.fillStyle = "#fff";
ctx.font = "bold 140px -apple-system, Arial";
ctx.textAlign = "center";
ctx.textBaseline = "middle";
ctx.fillText("C", size / 2 + 4, size / 2 + 4);

const buf = canvas.toBuffer("image/png");
fs.writeFileSync("electron/icon.png", buf);
console.log("icon.png criado");
