const fs = require('fs');
const path = require('path');
const https = require('https');

const libDir = path.join(__dirname, 'src', 'lib', 'mediapipe');
const wasmDir = path.join(libDir, 'wasm');
const modelsDir = path.join(__dirname, 'src', 'assets', 'models');

// Ensure directories exist
fs.mkdirSync(wasmDir, { recursive: true });
fs.mkdirSync(modelsDir, { recursive: true });

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url} -> ${dest}...`);
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: status code ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Finished downloading ${dest}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  try {
    // 1. Copy vision bundle from node_modules
    const pkgDir = path.join(__dirname, 'node_modules', '@mediapipe', 'tasks-vision');
    const bundleSrc = path.join(pkgDir, 'vision_bundle.mjs');
    const bundleDest = path.join(libDir, 'vision_bundle.mjs');
    fs.copyFileSync(bundleSrc, bundleDest);
    console.log(`Copied vision_bundle.mjs to ${bundleDest}`);

    // 2. Copy wasm folder files
    const wasmSrcDir = path.join(pkgDir, 'wasm');
    const wasmFiles = fs.readdirSync(wasmSrcDir);
    for (const file of wasmFiles) {
      fs.copyFileSync(path.join(wasmSrcDir, file), path.join(wasmDir, file));
      console.log(`Copied wasm file: ${file}`);
    }

    // 3. Download model files
    const handModelUrl = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';
    const faceModelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';

    await downloadFile(handModelUrl, path.join(modelsDir, 'hand_landmarker.task'));
    await downloadFile(faceModelUrl, path.join(modelsDir, 'face_landmarker.task'));

    console.log('All models and MediaPipe assets successfully set up offline!');
  } catch (err) {
    console.error('Error running setup:', err);
    process.exit(1);
  }
}

run();
