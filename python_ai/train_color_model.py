from pathlib import Path
import json
import numpy as np
import tensorflow as tf
from sklearn.preprocessing import LabelEncoder
from tensorflow.keras.utils import to_categorical
import argparse
import pickle

BASE = Path(__file__).resolve().parent
COLORMODEL = BASE.parent.joinpath('colormodel.json')

parser = argparse.ArgumentParser()
parser.add_argument('--label_field', choices=['family','name'], default='family')
parser.add_argument('--samples_per_class', type=int, default=1000)
parser.add_argument('--sigma', nargs=3, type=float, default=[1.5,3.0,3.0])
parser.add_argument('--epochs', type=int, default=100)
parser.add_argument('--batch_size', type=int, default=32)
parser.add_argument('--quantize', action='store_true')
parser.add_argument('--output_dir', default=str(BASE.joinpath('output')))
args = parser.parse_args()

out_dir = Path(args.output_dir)
out_dir.mkdir(parents=True, exist_ok=True)

with open(COLORMODEL, 'r', encoding='utf-8') as f:
    data = json.load(f)

label_field = args.label_field
labs = []
labels = []
for item in data:
    lab = item.get('lab')
    if lab and isinstance(lab, list) and len(lab) >= 3:
        labs.append(np.array(lab, dtype=np.float32))
        labels.append(item.get(label_field) or item.get('name'))

labs = np.array(labs, dtype=np.float32)
labels = np.array(labels, dtype=object)
if labs.shape[0] == 0:
    raise SystemExit('no lab entries found in colormodel.json')

N = args.samples_per_class
sigma = np.array(args.sigma, dtype=np.float32)
X_list = []
y_list = []
for lab_vec, lab_name in zip(labs, labels):
    noise = np.random.normal(0.0, sigma, size=(N, 3)).astype(np.float32)
    samples = lab_vec + noise
    X_list.append(samples)
    y_list.extend([lab_name] * N)

X = np.vstack(X_list).astype(np.float32)
y = np.array(y_list)

le = LabelEncoder()
y_idx = le.fit_transform(y)
y_cat = to_categorical(y_idx)

X_scaled = np.empty_like(X)
X_scaled[:,0] = X[:,0] / 100.0
X_scaled[:,1] = X[:,1] / 128.0
X_scaled[:,2] = X[:,2] / 128.0

num_classes = y_cat.shape[1]
model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(3,)),
    tf.keras.layers.Dense(64, activation='relu'),
    tf.keras.layers.BatchNormalization(),
    tf.keras.layers.Dropout(0.3),
    tf.keras.layers.Dense(64, activation='relu'),
    tf.keras.layers.BatchNormalization(),
    tf.keras.layers.Dropout(0.3),
    tf.keras.layers.Dense(32, activation='relu'),
    tf.keras.layers.Dropout(0.2),
    tf.keras.layers.Dense(num_classes, activation='softmax')
])
model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])

model.fit(X_scaled, y_cat, epochs=args.epochs, batch_size=args.batch_size, validation_split=0.2, verbose=1)

model_path = out_dir.joinpath('color_model.h5')
model.save(str(model_path))

labels_out = out_dir.joinpath('labels.json')
with open(labels_out, 'w', encoding='utf-8') as f:
    json.dump(list(le.classes_), f, ensure_ascii=False)

with open(out_dir.joinpath('label_encoder.pkl'), 'wb') as f:
    pickle.dump(le, f)

converter = tf.lite.TFLiteConverter.from_keras_model(model)
if args.quantize:
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    def representative_dataset():
        for i in range(min(100, X_scaled.shape[0])):
            idx = np.random.randint(0, X_scaled.shape[0])
            yield [X_scaled[idx:idx+1].astype(np.float32)]
    converter.representative_dataset = representative_dataset

try:
    tflite_model = converter.convert()
    with open(out_dir.joinpath('color_model.tflite'), 'wb') as f:
        f.write(tflite_model)
except Exception as e:
    raise

print('saved', str(model_path))
print('saved', str(labels_out))
print('saved', str(out_dir.joinpath('color_model.tflite')))
