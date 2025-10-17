This folder contains a script to train a small classifier from `colormodel.json` and produce a TFLite model and labels file.

Setup (Windows PowerShell):

```powershell
py -3 -m venv .venv
. \.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Train and convert (example):

```powershell
py -3 train_color_model.py --label_field family --samples_per_class 300 --epochs 40 --batch_size 64 --quantize --output_dir output
```

Outputs in `python_ai/output`:
- color_model.h5
- color_model.tflite
- labels.json
- label_encoder.pkl

Integration notes:
- Copy `color_model.tflite` and `labels.json` into your app assets (Android: `app/src/main/assets/`, iOS: add to bundle).
- On-device, compute Lab for the sampled pixel, scale as L/100, a/128, b/128 and run the TFLite interpreter with input shape [1,3] float32 (or int8 if quantized). Map argmax index to `labels.json`.

Troubleshooting & alternative install
------------------------------------

1) TensorFlow wheel compatibility

 - The `requirements.txt` includes `tensorflow>=2.8.0`. Pre-built TensorFlow wheels may not exist for very new Python releases (for example Python 3.12/3.13). If `pip install -r requirements.txt` fails with errors mentioning wheel or unsupported Python version, use one of the alternatives below.

2) Quick attempt (virtualenv + pip)

```powershell
py -3 -m venv .venv
. \.venv\Scripts\Activate.ps1
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

If that succeeds, run the training command shown above.

3) If pip fails because TensorFlow wheel is not available for your Python version

Option A — use the CPU-only package (may have better availability):

```powershell
py -3 -m venv .venv
. \.venv\Scripts\Activate.ps1
pip install --upgrade pip setuptools wheel
pip install tensorflow-cpu
pip install -r requirements.txt --no-deps
```

Option B — recommended: create a Conda environment with a supported Python (3.10 or 3.11) and install there:

```powershell
# (PowerShell - requires conda/miniconda installed)
conda create -n colorlens python=3.10 -y
conda activate colorlens
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

4) Run training

```powershell
# from python_ai folder, with your env active
py -3 train_color_model.py --label_field family --samples_per_class 300 --epochs 40 --batch_size 64 --quantize --output_dir output
```

If training fails with an out-of-memory or long CPU time, reduce `--batch_size` (e.g. 32) and/or `--epochs`.

5) Copy artifacts into Android assets and rebuild APK

Use the helper scripts in the repository (paths are relative to the repo root):

```powershell
# from repo root
.\scripts\copy_model_to_assets.ps1
.\scripts\copy_labels_to_assets.ps1
```

Or manually:

```powershell
Copy-Item -Path .\python_ai\output\color_model.tflite -Destination .\android\app\src\main\assets\color_model.tflite -Force
Copy-Item -Path .\python_ai\output\labels.json -Destination .\android\app\src\main\assets\labels.json -Force
```

Then rebuild and install the debug APK:

```powershell
cd android
.\gradlew.bat clean
.\gradlew.bat :app:assembleDebug
# install (from repo root)
adb install -r .\android\app\build\outputs\apk\debug\app-debug.apk
```

6) If you hit install/build or TensorFlow errors

 - Paste the full `pip install` error output here and I'll analyze it. If `pip` complains about unsupported Python, the conda path is the quickest fix.
 - If training runs but the app still uses the old model, make sure the app assets were overwritten (check `android/app/src/main/assets/` contains the new `color_model.tflite` and `labels.json`) and re-install the APK with `adb install -r`.

If you'd like, I can also:

 - generate a small PowerShell script that automates venv/conda checks + install (non-destructive), or
 - try to run a minimal test of importing `tensorflow` in your environment if you paste the `pip install` logs or allow me to run commands here.
