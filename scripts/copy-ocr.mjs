// Copy the OCR engine and Turkish/English language data next to the app, so screenshot
// reading works without third-party CDNs (and offline once the service worker cached it).
import fs from 'fs';
import path from 'path';
const out = 'public/ocr';
fs.mkdirSync(out, { recursive: true });
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/tur/4.0.0_best_int/tur.traineddata.gz', 'tur.traineddata.gz'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
];
for (const [from, to] of files) fs.copyFileSync(from, path.join(out, to));
console.log('ocr files copied to', out);
