/* Generador QR SVG 100 % offline (ISO-18004, modo byte, nivel EC L, versiones 1-6) para /descargar */
(function () {
  "use strict";

  // Tabla EC L: [version, dataCodewords, ecCodewordsPerBlock, numBlocks]
  const TABLA_L = [
    [1, 19, 7, 1],
    [2, 34, 10, 1],
    [3, 55, 15, 1],
    [4, 80, 20, 1],
    [5, 108, 26, 1],
    [6, 136, 18, 2],
  ];
  const ALINEACION = { 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };

  // GF(256) con polinomio 0x11D
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x;
    EXP[i + 255] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

  function rsGenPoly(deg) {
    let p = [1];
    for (let i = 0; i < deg; i++) {
      const next = new Array(p.length + 1).fill(0);
      const r = EXP[i];
      for (let j = 0; j < p.length; j++) {
        next[j] ^= p[j];
        next[j + 1] ^= gfMul(p[j], r);
      }
      p = next;
    }
    return p;
  }

  function rsRemainder(data, ecLen) {
    const gen = rsGenPoly(ecLen);
    const res = new Array(ecLen).fill(0);
    for (const b of data) {
      const factor = b ^ res[0];
      res.shift();
      res.push(0);
      if (factor !== 0) {
        for (let i = 0; i < ecLen; i++) res[i] ^= gfMul(gen[i + 1], factor);
      }
    }
    return res;
  }

  function encodeBits(bytes, verInfo) {
    const [, dataCap, ecLen, blocks] = verInfo;
    const bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(0b0100, 4); // modo byte
    push(bytes.length, 8);
    for (const b of bytes) push(b, 8);
    const totalBits = dataCap * 8;
    push(0, Math.min(4, totalBits - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);
    let padIdx = 0;
    while (bits.length < totalBits) {
      push(padIdx % 2 === 0 ? 0xec : 0x11, 8);
      padIdx++;
    }
    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      codewords.push(v);
    }
    const perBlock = Math.floor(dataCap / blocks);
    const dataBlocks = [], ecBlocks = [];
    for (let b = 0; b < blocks; b++) {
      const slice = codewords.slice(b * perBlock, (b + 1) * perBlock);
      dataBlocks.push(slice);
      ecBlocks.push(rsRemainder(slice, ecLen));
    }
    const outBits = [];
    const pushByte = (byteVal) => { for (let i = 7; i >= 0; i--) outBits.push((byteVal >>> i) & 1); };
    for (let i = 0; i < perBlock; i++) for (let b = 0; b < blocks; b++) pushByte(dataBlocks[b][i]);
    for (let i = 0; i < ecLen; i++) for (let b = 0; b < blocks; b++) pushByte(ecBlocks[b][i]);
    return outBits;
  }

  function makeMatrix(text) {
    const bytes = new TextEncoder().encode(text);
    const verInfo = TABLA_L.find(([, cap]) => bytes.length + 2 <= cap);
    if (!verInfo) return null;
    const ver = verInfo[0];
    const size = ver * 4 + 17;
    const mod = Array.from({ length: size }, () => new Int8Array(size));
    const func = Array.from({ length: size }, () => new Uint8Array(size));

    const setFunc = (r, c, v) => {
      if (r >= 0 && r < size && c >= 0 && c < size) { mod[r][c] = v ? 1 : 0; func[r][c] = 1; }
    };
    const drawFinder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
          setFunc(r0 + dr, c0 + dc, dist === 3 || dist <= 1);
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    const align = ALINEACION[ver] || [];
    for (const r of align) {
      for (const c of align) {
        if (func[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            setFunc(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
          }
        }
      }
    }

    for (let i = 8; i < size - 8; i++) {
      setFunc(6, i, i % 2 === 0);
      setFunc(i, 6, i % 2 === 0);
    }
    setFunc(size - 8, 8, 1);

    // Reserva bits de formato (EC L + Mask 0 => 0b111011111000100, MSB=14 .. LSB=0)
    const fmt = 0b111011111000100;
    for (let i = 0; i < 15; i++) {
      const b = (fmt >>> i) & 1;
      if (i < 6) { setFunc(i, 8, b); setFunc(8, size - 1 - i, b); }
      else if (i === 6) { setFunc(7, 8, b); setFunc(8, size - 7, b); }
      else if (i === 7) { setFunc(8, 8, b); setFunc(8, size - 8, b); }
      else if (i === 8) { setFunc(size - 7, 8, b); setFunc(8, 7, b); }
      else { setFunc(size - 15 + i, 8, b); setFunc(8, 14 - i, b); }
    }

    const bits = encodeBits(bytes, verInfo);
    let idx = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          const upward = ((right + 1) & 2) === 0;
          const r = upward ? size - 1 - vert : vert;
          if (!func[r][c] && idx < bits.length) {
            const bit = bits[idx++] ^ ((r + c) % 2 === 0 ? 1 : 0); // Mask 0
            mod[r][c] = bit;
          } else if (!func[r][c]) {
            mod[r][c] = ((r + c) % 2 === 0 ? 1 : 0);
          }
        }
      }
    }
    return { size, mod };
  }

  function renderQR() {
    const caja = document.getElementById("qr-caja");
    if (!caja) return;
    const url = caja.dataset.url || location.href;
    const qr = makeMatrix(url);
    if (!qr) return;
    const quiet = 2;
    const total = qr.size + quiet * 2;
    let paths = "";
    for (let r = 0; r < qr.size; r++) {
      for (let c = 0; c < qr.size; c++) {
        if (qr.mod[r][c]) paths += `M${c + quiet},${r + quiet}h1v1h-1z`;
      }
    }
    caja.innerHTML = `<svg viewBox="0 0 ${total} ${total}" width="210" height="210" role="img" aria-label="Código QR para descargar Unexuam"><rect width="${total}" height="${total}" fill="#fff"/><path d="${paths}" fill="#0B2A4A"/></svg>`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderQR();
    const btnCopiar = document.getElementById("btn-copiar-link");
    if (btnCopiar) {
      btnCopiar.addEventListener("click", async () => {
        const txt = document.getElementById("url-apk-texto")?.textContent || "";
        try {
          await navigator.clipboard.writeText(txt);
          btnCopiar.textContent = "Enlace copiado";
          setTimeout(() => { btnCopiar.textContent = "Copiar enlace"; }, 1800);
        } catch (_) {}
      });
    }
  });
})();
