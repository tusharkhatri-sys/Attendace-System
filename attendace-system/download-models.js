const fs = require('fs');
const https = require('https');
const path = require('path');

const modelsDir = path.join(__dirname, 'public', 'models');

if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';
const files = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2'
];

async function downloadFiles() {
  for (const file of files) {
    const dest = path.join(modelsDir, file);
    console.log(`Downloading ${file}...`);
    
    await new Promise((resolve, reject) => {
      const request = https.get(baseUrl + file, function(response) {
        if (response.statusCode === 302 || response.statusCode === 301) {
          https.get(response.headers.location, function(redirectResponse) {
             const fileStream = fs.createWriteStream(dest);
             redirectResponse.pipe(fileStream);
             fileStream.on('finish', () => { fileStream.close(); resolve(); });
          }).on('error', reject);
        } else {
             const fileStream = fs.createWriteStream(dest);
             response.pipe(fileStream);
             fileStream.on('finish', () => { fileStream.close(); resolve(); });
        }
      }).on('error', reject);
    });
  }
  console.log('All models downloaded successfully!');
}

downloadFiles();
