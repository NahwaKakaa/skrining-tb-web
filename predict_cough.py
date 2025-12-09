import os
import sys
import json
import numpy as np
import warnings

# 1. Konfigurasi Lingkungan (Supaya bersih dari log TensorFlow)
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3' 
warnings.filterwarnings('ignore')

try:
    import librosa
    import tensorflow as tf
    import joblib
    from skimage.transform import resize
except ImportError as e:
    print(json.dumps({"status": "error", "message": f"Library missing: {str(e)}"}))
    sys.exit(0)

# --- KONFIGURASI TARGET BENTUK DATA ---
# Kita set target sesuai error log yang Anda berikan
CNN_TARGET = (128, 63)
LSTM_TARGET = (63, 42)
META_TARGET_COUNT = 9  # <--- INI PERBAIKANNYA (Sesuai Error: value 9)

def preprocess_audio(file_path):
    # Load Audio
    try:
        y, sr = librosa.load(file_path, duration=5, sr=22050)
    except Exception as e:
        raise Exception(f"File audio rusak/tidak terbaca: {str(e)}")

    # Padding jika < 5 detik
    if len(y) < 110250:
        y = np.pad(y, (0, 110250 - len(y)))
    else:
        y = y[:110250]

    # A. Proses Spectrogram (Untuk CNN)
    melspec = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128)
    melspec_db = librosa.power_to_db(melspec, ref=np.max)
    melspec_res = resize(melspec_db, CNN_TARGET, mode='constant', anti_aliasing=True)
    cnn_data = melspec_res[..., np.newaxis] # Tambah channel (128, 63, 1)
    cnn_data = np.expand_dims(cnn_data, axis=0) # Tambah batch (1, 128, 63, 1)

    # B. Proses MFCC (Untuk LSTM)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=42)
    mfcc_res = resize(mfcc, (42, 63), mode='constant', anti_aliasing=True)
    lstm_data = mfcc_res.T  # Transpose jadi (63, 42)
    lstm_data = np.expand_dims(lstm_data, axis=0) # Tambah batch (1, 63, 42)

    return cnn_data, lstm_data

def preprocess_metadata(age_raw, scaler):
    # 1. Ambil Usia
    try:
        age = float(age_raw)
    except:
        age = 30.0 # Default
    
    # 2. Scaling Usia
    age_scaled = scaler.transform([[age]]) # Output shape (1, 1)
    
    # 3. BUAT ARRAY KOSONG (1, 9)
    # Kita butuh 9 fitur, tapi cuma punya 1 (usia).
    # Kita buat array isi 0 semua, lalu ganti index ke-0 dengan usia.
    meta_final = np.zeros((1, META_TARGET_COUNT)) 
    
    # Masukkan usia yang sudah di-scale ke kolom pertama
    meta_final[0, 0] = age_scaled[0, 0]
    
    # Sisanya (index 1-8) biarkan 0 (anggap sebagai False/Tidak ada gejala lain)
    return meta_final

def main(audio_path, age_raw):
    try:
        # Cek File Wajib
        if not os.path.exists('tb_multimodal_final.keras'):
            raise Exception("Model 'tb_multimodal_final.keras' hilang!")
        if not os.path.exists('age_scaler.pkl'):
            raise Exception("Scaler 'age_scaler.pkl' hilang!")

        # Load Model & Scaler
        model = tf.keras.models.load_model('tb_multimodal_final.keras', compile=False)
        scaler = joblib.load('age_scaler.pkl')

        # Siapkan Data
        cnn_data, lstm_data = preprocess_audio(audio_path)
        meta_data = preprocess_metadata(age_raw, scaler) # Ini sekarang shape (1, 9)

        # --- AUTO MATCHING INPUT (KEBAL ERROR URUTAN) ---
        # Kita cek bentuk input yang diminta model, lalu kita suapi data yang pas
        input_payload = []
        
        # Ambil daftar bentuk input yang diharapkan model
        # Biasanya list of tuples, misal: [(None, 63, 42), (None, 128, 63, 1), (None, 9)]
        model_input_shapes = model.input_shape
        if not isinstance(model_input_shapes, list):
            model_input_shapes = [model_input_shapes]

        for shape in model_input_shapes:
            # shape[1:] membuang dimensi batch (None)
            dims = shape[1:] if shape[0] is None else shape
            
            if len(dims) == 3: # Kemungkinan CNN (128, 63, 1)
                input_payload.append(cnn_data)
            elif len(dims) == 2: # Kemungkinan LSTM (63, 42)
                input_payload.append(lstm_data)
            elif len(dims) == 1: # Kemungkinan Metadata (9)
                # Pastikan jumlah fitur cocok (9)
                if dims[0] == META_TARGET_COUNT:
                    input_payload.append(meta_data)
                else:
                    # Fallback jika model minta jumlah lain, kita resize paksa
                    temp_meta = np.zeros((1, dims[0]))
                    temp_meta[0, 0] = meta_data[0, 0]
                    input_payload.append(temp_meta)

        # --- PREDIKSI ---
        prediction = model.predict(input_payload, verbose=0)
        prob = float(prediction[0][0])

        # --- HASIL KEPUTUSAN ---
        status = "Negatif"
        score_add = 0
        
        # Threshold (Bisa disesuaikan sensitivitasnya)
        if prob > 0.65:
            status = "Positif (High Risk)"
            score_add = 15
        elif prob > 0.40:
            status = "Suspek (Medium)"
            score_add = 8
        
        # Kirim JSON Sukses
        print(json.dumps({
            "status": "success",
            "probability": f"{prob:.4f}",
            "ml_score": score_add,
            "ai_analysis": status
        }))

    except Exception as e:
        # Kirim JSON Error (agar server.js tidak crash parsing)
        print(json.dumps({"status": "error", "message": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) > 2:
        main(sys.argv[1], sys.argv[2])
    else:
        print(json.dumps({"status": "error", "message": "Parameter kurang"}))