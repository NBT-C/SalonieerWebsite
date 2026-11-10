/*
 * Standards-compliant QR encoder for the local platform share card.
 *
 * The launcher only needs to encode short ASCII deep links such as
 * salonieer://salon/ELITE-001. A fixed version-5 / error-correction-L
 * symbol keeps this dependency small while still leaving room for a 106-byte
 * payload. The implementation follows ISO/IEC 18004's byte mode, BCH format
 * information, Reed–Solomon arithmetic over GF(256), finder/alignment
 * patterns, and the zig-zag data placement rules. No payload is sent to a
 * third-party QR service.
 */
(function () {
  "use strict";

  const VERSION = 5;
  const SIZE = VERSION * 4 + 17; // 37 modules
  const DATA_CODEWORDS = 108; // version 5-L, one RS block
  const EC_CODEWORDS = 26;
  const MAX_BYTES = 106;

  // GF(256), primitive polynomial x^8+x^4+x^3+x^2+1 (0x11d).
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < EXP.length; i++) EXP[i] = EXP[i - 255];

  function gexp(n) {
    while (n < 0) n += 255;
    while (n >= 255) n -= 255;
    return EXP[n];
  }

  function gmul(a, b) {
    return a === 0 || b === 0 ? 0 : gexp(LOG[a] + LOG[b]);
  }

  function multiplyPolynomial(a, b) {
    const out = new Uint8Array(a.length + b.length - 1);
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) out[i + j] ^= gmul(a[i], b[j]);
    }
    return Array.from(out);
  }

  function generatorPolynomial(degree) {
    let result = [1];
    for (let i = 0; i < degree; i++) result = multiplyPolynomial(result, [1, gexp(i)]);
    return result;
  }

  function errorCorrection(data) {
    const generator = generatorPolynomial(EC_CODEWORDS);
    const remainder = new Uint8Array(EC_CODEWORDS);
    for (const byte of data) {
      const factor = byte ^ remainder[0];
      remainder.copyWithin(0, 1);
      remainder[EC_CODEWORDS - 1] = 0;
      for (let i = 0; i < EC_CODEWORDS; i++) remainder[i] ^= gmul(generator[i + 1], factor);
    }
    return Array.from(remainder);
  }

  function utf8Bytes(value) {
    if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(value));
    // All production deep links are ASCII. This fallback also handles UTF-8
    // correctly in older embedded browsers without TextEncoder.
    const encoded = unescape(encodeURIComponent(value));
    return Array.from(encoded, ch => ch.charCodeAt(0));
  }

  function dataCodewords(value) {
    const bytes = utf8Bytes(String(value));
    if (bytes.length > MAX_BYTES) throw new Error("رمز طويل جداً");
    const bits = [];
    const push = (number, count) => {
      for (let i = count - 1; i >= 0; i--) bits.push((number >>> i) & 1);
    };
    push(0b0100, 4); // byte mode
    push(bytes.length, 8);
    bytes.forEach(byte => push(byte, 8));
    if (bits.length + 4 <= DATA_CODEWORDS * 8) push(0, 4);
    while (bits.length % 8) bits.push(0);
    const result = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      result.push(byte);
    }
    let pad = 0;
    while (result.length < DATA_CODEWORDS) result.push((pad++ & 1) ? 0x11 : 0xec);
    return result;
  }

  function bchDigit(number) {
    let digit = 0;
    while (number !== 0) { digit++; number >>>= 1; }
    return digit;
  }

  function bchTypeInfo(data) {
    const generator = 0x537;
    let value = data << 10;
    while (bchDigit(value) - bchDigit(generator) >= 0) {
      value ^= generator << (bchDigit(value) - bchDigit(generator));
    }
    return ((data << 10) | value) ^ 0x5412;
  }

  function matrixFor(value) {
    const data = dataCodewords(value);
    const codewords = data.concat(errorCorrection(data));
    const matrix = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    const set = (row, col, dark) => {
      if (row >= 0 && row < SIZE && col >= 0 && col < SIZE) matrix[row][col] = !!dark;
    };

    function finder(row, col) {
      for (let r = -1; r <= 7; r++) {
        if (row + r < 0 || row + r >= SIZE) continue;
        for (let c = -1; c <= 7; c++) {
          if (col + c < 0 || col + c >= SIZE) continue;
          const dark = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
            (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          set(row + r, col + c, dark);
        }
      }
    }

    finder(0, 0); finder(SIZE - 7, 0); finder(0, SIZE - 7);

    // Version 5 alignment locations are [6, 30]. Finder cells are already
    // occupied, so the three remaining centers are placed here.
    for (const row of [6, 30]) {
      for (const col of [6, 30]) {
        if (matrix[row][col] !== null) continue;
        for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
          set(row + r, col + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
        }
      }
    }

    for (let row = 8; row < SIZE - 8; row++) if (matrix[row][6] === null) matrix[row][6] = row % 2 === 0;
    for (let col = 8; col < SIZE - 8; col++) if (matrix[6][col] === null) matrix[6][col] = col % 2 === 0;

    // Error correction L (01) and mask pattern 0. A QR decoder can read any
    // valid mask; mask 0 is deterministic and keeps the generated SVG stable.
    const format = bchTypeInfo((1 << 3) | 0);
    const formatBit = bit => ((format >>> bit) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(i, 8, formatBit(i));
    set(7, 8, formatBit(6)); set(8, 8, formatBit(7)); set(8, 7, formatBit(8));
    for (let i = 9; i < 15; i++) set(8, 14 - i, formatBit(i));
    for (let i = 0; i < 8; i++) set(8, SIZE - 1 - i, formatBit(i));
    for (let i = 8; i < 15; i++) set(SIZE - 15 + i, 8, formatBit(i));
    set(SIZE - 8, 8, true);

    let row = SIZE - 1, direction = -1, byteIndex = 0, bitIndex = 7;
    for (let right = SIZE - 1; right > 0; right -= 2) {
      if (right === 6) right--;
      while (true) {
        for (let offset = 0; offset < 2; offset++) {
          const col = right - offset;
          if (matrix[row][col] !== null) continue;
          let dark = false;
          if (byteIndex < codewords.length) dark = ((codewords[byteIndex] >>> bitIndex) & 1) !== 0;
          // Mask 0: invert when (row + column) is even.
          matrix[row][col] = dark !== ((row + col) % 2 === 0);
          bitIndex--;
          if (bitIndex < 0) { byteIndex++; bitIndex = 7; }
        }
        row += direction;
        if (row < 0 || row >= SIZE) { row -= direction; direction = -direction; break; }
      }
    }
    // The seven remainder bits are light by definition.
    for (const line of matrix) for (let i = 0; i < line.length; i++) if (line[i] === null) line[i] = false;
    return matrix;
  }

  function svg(value) {
    const matrix = matrixFor(value);
    let path = "";
    matrix.forEach((line, row) => line.forEach((dark, col) => {
      if (dark) path += `M${col + 4},${row + 4}h1v1h-1z`;
    }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" role="img" aria-label="QR" shape-rendering="crispEdges"><rect width="45" height="45" fill="white"/><path d="${path}" fill="black"/></svg>`;
  }

  window.SalonQR = { encode: matrixFor, svg, version: VERSION };
})();
