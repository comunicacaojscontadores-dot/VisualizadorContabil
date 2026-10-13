// node electron/gerar-icon.cjs
const fs = require("fs");
const path = require("path");

// PNG 256x256 roxo com "CC" — gerado inline sem dependências externas
// Este é um PNG válido mínimo em base64
const png256 = "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAACXBIWXMAAAsTAAALEwEAmpwYAAAF8WlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNi4wLWMwMDIgNzkuMTY0MzUyLCAyMDIwLzAxLzMwLTE1OjUwOjM4ICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIiB4bWxuczpzdEV2dD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlRXZlbnQjIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgMjEuMSAoV2luZG93cykiIHhtcDpDcmVhdGVEYXRlPSIyMDIwLTA1LTI2VDEyOjI3OjEwKzAzOjAwIiB4bXA6TWV0YWRhdGFEYXRlPSIyMDIwLTA1LTI2VDEyOjI3OjEwKzAzOjAwIiB4bXA6TW9kaWZ5RGF0ZT0iMjAyMC0wNS0yNlQxMjoyNzoxMCswMzowMCIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDo1ZjE3MDMxMy05ZDI1LTQxNGQtYWFiMi01NWEyZGVhNzZlOTUiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6NWYxNzAzMTMtOWQyNS00MTRkLWFhYjItNTVhMmRlYTc2ZTk1IiB4bXBNTTpPcmlnaW5hbERvY3VtZW50SUQ9InhtcC5kaWQ6NWYxNzAzMTMtOWQyNS00MTRkLWFhYjItNTVhMmRlYTc2ZTk1IiBkYzpmb3JtYXQ9ImltYWdlL3BuZyIgcGhvdG9zaG9wOkNvbG9yTW9kZT0iMyI+IDx4bXBNTTpIaXN0b3J5PiA8cmRmOlNlcT4gPHJkZjpsaSBzdEV2dDphY3Rpb249ImNyZWF0ZWQiIHN0RXZ0Omluc3RhbmNlSUQ9InhtcC5paWQ6NWYxNzAzMTMtOWQyNS00MTRkLWFhYjItNTVhMmRlYTc2ZTk1IiBzdEV2dDp3aGVuPSIyMDIwLTA1LTI2VDEyOjI3OjEwKzAzOjAwIiBzdEV2dDpzb2Z0d2FyZUFnZW50PSJBZG9iZSBQaG90b3Nob3AgMjEuMSAoV2luZG93cykiLz4gPC9yZGY6U2VxPiA8L3htcE1NOkhpc3Rvcnk+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+";

// Cria um PNG real simples 64x64 com fundo roxo
// Usando raw PNG bytes
const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xFF];
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crcInput = Buffer.concat([typeB, data]);
  const crcB = Buffer.alloc(4); crcB.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([len, typeB, data, crcB]);
}

const size = 64;
// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

// Image data: each row = filter byte (0) + RGB pixels
const zlib = require("zlib");
const rows = [];
for (let y = 0; y < size; y++) {
  const row = Buffer.alloc(1 + size * 3);
  row[0] = 0;
  for (let x = 0; x < size; x++) {
    // Rounded rect roxo #6366f1 com cantos
    const r = Math.min(x, y, size-1-x, size-1-y);
    if (r < 10) { row[1+x*3]=15; row[2+x*3]=17; row[3+x*3]=23; } // fundo escuro
    else { row[1+x*3]=99; row[2+x*3]=102; row[3+x*3]=241; } // roxo
  }
  rows.push(row);
}
const rawPixels = Buffer.concat(rows);
const compressed = zlib.deflateSync(rawPixels);
const idat = chunk("IDAT", compressed);
const iend = chunk("IEND", Buffer.alloc(0));
const ihdrChunk = chunk("IHDR", ihdr);

const png = Buffer.concat([PNG_HEADER, ihdrChunk, idat, iend]);
fs.writeFileSync(path.join(__dirname, "icon.png"), png);
console.log("icon.png criado:", png.length, "bytes");
