import os
import urllib.request

models_dir = os.path.join(os.path.dirname(__file__), 'public', 'models')
os.makedirs(models_dir, exist_ok=True)

base_url = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/'
files = [
    'ssd_mobilenetv1_model-weights_manifest.json',
    'ssd_mobilenetv1_model-shard1',
    'ssd_mobilenetv1_model-shard2',
    'face_landmark_68_model-weights_manifest.json',
    'face_landmark_68_model-shard1',
    'face_recognition_model-weights_manifest.json',
    'face_recognition_model-shard1',
    'face_recognition_model-shard2'
]

for file in files:
    dest = os.path.join(models_dir, file)
    print(f"Downloading {file}...")
    urllib.request.urlretrieve(base_url + file, dest)

print("All models downloaded successfully!")
