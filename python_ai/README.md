This folder contains a script to train a small classifier from `colormodel.json` and produce a TFLite model and labels file.

Setup (Windows PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Train and convert (example):

```powershell
python train_color_model.py --label_field family --samples_per_class 300 --epochs 40 --batch_size 64 --quantize --output_dir output
```

Outputs in `python_ai/output`:
- color_model.h5
- color_model.tflite
- labels.json
- label_encoder.pkl

Integration notes:
- Copy `color_model.tflite` and `labels.json` into your app assets (Android: `app/src/main/assets/`, iOS: add to bundle).
- On-device, compute Lab for the sampled pixel, scale as L/100, a/128, b/128 and run the TFLite interpreter with input shape [1,3] float32 (or int8 if quantized). Map argmax index to `labels.json`.
