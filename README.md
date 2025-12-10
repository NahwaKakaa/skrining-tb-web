# TB Care - Sistem Skrining Tuberkulosis Berbasis Hybrid AI 🫁

**TB Care** adalah aplikasi berbasis web yang dirancang untuk melakukan deteksi dini (*pre-diagnosis*) risiko penyakit Tuberkulosis (TB). Sistem ini menggabungkan metode penilaian klinis (*Rule-Based*) berdasarkan kuesioner medis dengan kecerdasan buatan (*Artificial Intelligence*) yang menganalisis karakteristik suara batuk pengguna.

---

## 🌟 Fitur Utama

### 1. Sisi Pengguna (User)
* **Multimodal Skrining:** Penilaian risiko berdasarkan gejala klinis, paparan lingkungan, dan analisis audio batuk.
* **AI Cough Analysis:** Merekam atau mengunggah suara batuk untuk dianalisis oleh model *Deep Learning* (TensorFlow).
* **Real-time Results:** Hasil skrining instan dengan kategori risiko (Hijau/Kuning/Merah).
* **Riwayat & Laporan:** Pengguna dapat melihat riwayat tes dan mengunduh hasil dalam bentuk PDF.
* **Keamanan Data:** Sistem autentikasi pengguna yang aman (Password Hashing).

### 2. Sisi Admin (Dashboard)
* **Statistik Visual:** Ringkasan jumlah partisipan berdasarkan tingkat risiko.
* **Manajemen Data:** Tabel data responsif dengan fitur pencarian dan filter.
* **Verifikasi Audio:** Admin dapat memutar ulang rekaman batuk pengguna (terintegrasi dengan Cloud Storage).
* **Laporan Eksekutif:** Fitur ekspor data rekapitulasi ke Excel (.xlsx) dan PDF.
* **Aksi Massal:** Menghapus data dalam jumlah banyak sekaligus (*Bulk Delete*).

---

## 🛠️ Teknologi yang Digunakan (Tech Stack)

Aplikasi ini dibangun menggunakan arsitektur Monolithic dengan integrasi **Node.js** dan **Python**.

### Backend & Server
* **Runtime:** Node.js (Express.js)
* **Language:** JavaScript & Python 3.10
* **Integrasi:** `child_process` (untuk komunikasi Node.js ↔ Python)
* **Upload Handler:** Multer & Multer-Storage-Cloudinary

### Artificial Intelligence (AI)
* **Framework:** TensorFlow / Keras (CPU Version)
* **Audio Processing:** Librosa (Feature Extraction: MFCC & Mel-Spectrogram)
* **Data Processing:** NumPy, Scikit-learn (Joblib for Scaler)
* **Model:** `tb_multimodal_final.keras` (Hybrid CNN + LSTM)

### Database & Storage
* **Database:** MongoDB Atlas (Cloud NoSQL)
* **File Storage:** Cloudinary (Untuk penyimpanan file audio permanen)

### Frontend
* **Structure:** HTML5
* **Styling:** CSS3 (Modern Glassmorphism Design, Responsive Mobile-First)
* **Logic:** Vanilla JavaScript (DOM Manipulation, Fetch API)

### DevOps & Deployment
* **Containerization:** Docker
* **Cloud Platform:** Railway / Render

---

## 📂 Struktur Proyek

```text
SKRINING-TB-WEB/
├── node_modules/       # Dependencies Node.js
├── public/             # File statis Frontend (HTML, CSS, JS)
│   ├── admin.html
│   ├── history.html
│   ├── index.html
│   ├── script.js
│   └── style.css
├── uploads/            # Folder sementara untuk transit file audio
├── venv/               # Virtual Environment Python (Local)
├── age_scaler.pkl      # Scaler untuk normalisasi data usia
├── Dockerfile          # Konfigurasi Image Docker
├── package.json        # Manifes proyek Node.js
├── predict_cough.py    # Skrip Python untuk inferensi AI
├── requirements.txt    # Daftar library Python
├── server.js           # Server utama aplikasi
└── tb_multimodal_final.keras # Model AI yang sudah dilatihs
