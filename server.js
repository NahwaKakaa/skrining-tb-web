// server.js (CLOUDINARY EDITION - FINAL)

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { Parser } = require('json2csv');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcrypt');
const { spawn } = require('child_process');
const cors = require('cors');

// --- 1. IMPORT CLOUDINARY ---
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 8080;
const saltRounds = 10;

// --- KONFIGURASI CLOUDINARY ---
// Pastikan Env Vars ini diisi di Render nanti!
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- ADMIN & CONFIG ---
const DEFAULT_ADMIN_USERNAME = 'admin_satu';
const DEFAULT_ADMIN_PASSWORD_HASH = '$2b$10$AHDo3Blp/n2MCWWq2m/RCecYChxHJ1n4/xfY21aC6osSRyeJB18ca';
const ADMIN_ACCESS_KEY = process.env.ADMIN_PASS || 'admin123';
const ADMIN_KEY_STORAGE = 'adminAccessKey';

// --- DATABASE CONNECTION ---
const DB_URL = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/skriningTBDB';

mongoose.connect(DB_URL)
  .then(() => console.log('✅ Terkoneksi ke MongoDB'))
  .catch(err => {
    console.error('❌ Gagal koneksi ke MongoDB:', err);
  });

// --- SCHEMAS ---
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  namaLengkap: String,
  no_telp: String,
  usia: Number,
  tinggiBadan: Number,
  beratBadan: Number,
  pendidikan: String,
  pekerjaan: String,
  jumlahAnggotaKeluarga: Number
});
const User = mongoose.model('User', UserSchema);

const SkriningSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  nama: { type: String, required: true },
  usia: { type: Number, required: false },
  no_telp: String,
  dataSkrining: Object,
  totalScore: Number,
  pitaLila: String,
  rekomendasi: String,
  // audioFilePath sekarang akan berisi URL Cloudinary (https://...)
  audioFilePath: String,
  // filename disimpan untuk keperluan hapus file nanti
  audioPublicId: String, 
  aiProbability: String,
  aiAnalysis: String,
  tanggalSkrining: { type: Date, default: Date.now }
});
const SkriningResult = mongoose.model('SkriningResult', SkriningSchema);

// --- 2. GANTI MULTER STORAGE KE CLOUDINARY ---
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'tb-care-uploads',
    
    // PENTING: Ubah ke 'video' agar Cloudinary menerima mp4/wav/mp3
    resource_type: 'video', 
    
    // Tambahkan 'mp4' ke daftar format yang diizinkan
    allowed_formats: ['wav', 'mp3', 'm4a', 'webm', 'ogg', 'mp4'],
    
    public_id: (req, file) => {
        const name = (req.body.nama || 'unknown').toString();
        // Hapus karakter aneh agar aman
        const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const timestamp = Date.now();
        return `${safeName}_${timestamp}`;
    }
  }
});

const upload = multer({ storage: storage });

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- HELPERS ---
const safeParseInt = (value) => {
  if (value === null || typeof value === 'undefined' || String(value).trim() === '') return null;
  const parsed = parseInt(value);
  return isNaN(parsed) ? null : parsed;
};

// --- PYTHON SETUP ---
const PYTHON_BIN = process.env.PYTHON_PATH || 'python3';
const PYTHON_SCRIPT = path.join(__dirname, 'predict_cough.py'); 

const spawnPythonPredict = (audioUrl, userAge, timeoutMs = 45000) => {
  return new Promise((resolve) => {
    // Cek file script python saja, audioUrl sekarang adalah URL internet
    if (!fs.existsSync(PYTHON_SCRIPT)) {
      console.error('Python script TIDAK DITEMUKAN di:', PYTHON_SCRIPT);
      return resolve({ success: false, message: 'File predict_cough.py hilang!' });
    }

    const tryBins = [PYTHON_BIN, 'python'];
    
    const tryStart = (index) => {
      if (index >= tryBins.length) {
        return resolve({ success: false, message: 'Python tidak terinstall di server.' });
      }
      
      const bin = tryBins[index];
      let output = '';
      let stderr = '';
      
      try {
        console.log(`Menjalankan AI pada URL: ${audioUrl}`);
        const proc = spawn(bin, [PYTHON_SCRIPT, audioUrl, String(userAge)]);
        
        // Timeout diperpanjang karena download dari URL butuh waktu
        const timer = setTimeout(() => {
            proc.kill();
            resolve({ success: false, message: 'AI Timeout (Download/Proses terlalu lama)' });
        }, timeoutMs);

        proc.stdout.on('data', (d) => { output += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0 && !output) {
                console.error(`Python Error (${bin}):`, stderr);
                if (index === 0) return tryStart(index + 1);
                return resolve({ success: false, message: 'Gagal menjalankan Python', stderr });
            }
            
            try {
                const jsonMatch = output.match(/\{.*\}/s);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);
                    resolve({ success: true, result });
                } else {
                    resolve({ success: false, message: 'Output AI bukan JSON valid', raw: output });
                }
            } catch (e) {
                resolve({ success: false, message: 'JSON Parse Error', raw: output });
            }
        });
        
        proc.on('error', (err) => {
            clearTimeout(timer);
            tryStart(index + 1);
        });

      } catch (err) {
        tryStart(index + 1);
      }
    };

    tryStart(0);
  });
};

// ==========================================
// ROUTES
// ==========================================

app.post('/api/register', async (req, res) => {
  const { username, password, namaLengkap, no_telp } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newUser = new User({ username, password: hashedPassword, namaLengkap, no_telp });
    await newUser.save();
    res.status(201).json({ status: 'sukses', message: 'Registrasi berhasil.' });
  } catch (error) {
    res.status(400).json({ status: 'gagal', message: 'Username sudah digunakan.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ status: 'gagal', message: 'Akun tidak ditemukan.' });
  
  const match = await bcrypt.compare(password, user.password);
  if (match) res.json({ status: 'sukses', message: 'Login berhasil', userId: user._id, nama: user.namaLengkap });
  else res.status(401).json({ status: 'gagal', message: 'Password salah.' });
});

app.get('/api/profile/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    user ? res.json({ status: 'sukses', data: user }) : res.status(404).json({ status: 'gagal' });
  } catch (e) { res.status(500).json({ status: 'gagal' }); }
});

app.get('/api/history/:userId', async (req, res) => {
  try {
    const history = await SkriningResult.find({ userId: req.params.userId }).sort({ tanggalSkrining: -1 });
    res.json({ status: 'sukses', data: history });
  } catch (e) { res.status(500).json({ status: 'gagal' }); }
});

app.delete('/api/skrining/:id', async (req, res) => {
  try {
    const result = await SkriningResult.findByIdAndDelete(req.params.id);
    // Hapus file dari Cloudinary jika ada public_id
    if (result && result.audioPublicId) {
        cloudinary.uploader.destroy(result.audioPublicId, { resource_type: 'video' }, (err, result) => {
            if(err) console.error("Cloudinary delete error:", err);
        });
    }
    res.json({ status: 'sukses' });
  } catch (e) { res.status(500).json({ status: 'gagal' }); }
});

// --- SKRINING CORE (MODIFIED) ---
app.post('/api/skrining', upload.single('uploadBatuk'), async (req, res) => {
    const data = req.body;
    let totalScore = 0;
    
    // Cloudinary URL
    const audioUrl = req.file ? req.file.path : null; 
    const audioPublicId = req.file ? req.file.filename : null;

    // Rule-based Scoring
    if (data.riwayatTB === 'Ya') totalScore += 5;
    ['batuk2minggu', 'keringatMalam', 'nafsuMakanKurang', 'sesak', 'dahakDarah', 'malaise', 'penurunanBB', 'demamMenggigil'].forEach(k => { if (data[k] === 'Ya') totalScore += 3; });
    ['paparanRumahTB', 'paparanRuanganTertutup', 'paparanRawatTanpaAPD', 'paparanKeluargaTetangga', 'paparanLingkunganPadat'].forEach(k => { if (data[k] === 'Ya') totalScore += 2; });
    ['sikapJarangCuciTangan', 'sikapTidakMaskerBatuk', 'sikapRuanganPadat', 'sikapMenundaPeriksa', 'lingkunganVentilasiKurang', 'lingkunganRumahPadat', 'lingkunganKurangMatahari', 'lingkunganTerpaparAsap', 'lingkunganSanitasiRendah'].forEach(k => { if (data[k] === 'Ya') totalScore += 1; });

    // AI PROCESS WITH DOWNLOAD STRATEGY
    const aiResult = await (async () => {
        if (!audioUrl) return { score: 0, prob: "0", analysis: "-" };

        // 1. Tentukan path file lokal sementara
        const tempFileName = `temp_${Date.now()}.mp4`;
        const tempFilePath = path.join(tempDir, tempFileName);

        try {
            console.log(`Downloading audio from: ${audioUrl}`);
            // 2. Download file dari Cloudinary ke server lokal
            await downloadFile(audioUrl, tempFilePath);
            
            // 3. Proses file lokal dengan Python
            console.log(`Processing local file: ${tempFilePath}`);
            const out = await spawnPythonPredict(tempFilePath, data.usia || 30);
            
            // 4. Hapus file sementara (Cleanup)
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

            if (out.success && out.result && out.result.status === 'success') {
                return {
                    score: Number(out.result.ml_score || 0),
                    prob: String(out.result.probability || "0"),
                    analysis: out.result.ai_analysis || '-'
                };
            }
            
            // Log detail error dari Python result jika ada
            console.warn('AI Logic Gagal:', out.result || out.message || out.stderr);
            return { score: 0, prob: "0", analysis: "Gagal" };

        } catch (e) {
            console.error("AI Exception:", e);
            // Pastikan file terhapus jika error
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            return { score: 0, prob: "0", analysis: "Error" };
        }
    })();

    totalScore += aiResult.score;

    // Labeling
    let pitaLila = 'Hijau', rekomendasi = 'RISIKO RENDAH. Jaga kesehatan.';
    if (totalScore >= 33) { pitaLila = 'Merah'; rekomendasi = 'RISIKO TINGGI. Segera periksa ke dokter.'; }
    else if (totalScore >= 17) { pitaLila = 'Kuning'; rekomendasi = 'RISIKO SEDANG. Observasi mandiri.'; }

    try {
        await new SkriningResult({
            userId: data.currentUserId || null,
            nama: data.nama || 'Guest',
            usia: Number(data.usia) || 0,
            no_telp: data.no_telp,
            dataSkrining: data,
            totalScore, pitaLila, rekomendasi,
            audioFilePath: audioUrl,
            audioPublicId: audioPublicId,
            aiProbability: aiResult.prob,
            aiAnalysis: aiResult.analysis
        }).save();
        
        res.json({ status: 'sukses', pitaLila, rekomendasi, totalScore, aiResult });
    } catch (e) { 
        res.status(500).json({ status: 'gagal', message: 'Gagal Simpan DB' });
    }
});

// --- ADMIN ROUTES ---
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    if(username !== DEFAULT_ADMIN_USERNAME) return res.status(401).json({status:'gagal'});
    const match = await bcrypt.compare(password, DEFAULT_ADMIN_PASSWORD_HASH);
    match ? res.json({status:'sukses'}) : res.status(401).json({status:'gagal'});
});

app.get('/admin/data/json', async (req, res) => {
    if(req.query.password !== ADMIN_ACCESS_KEY) return res.status(401).json({status:'gagal'});
    const results = await SkriningResult.find().populate('userId', 'username').sort({tanggalSkrining:-1});
    res.json({status:'sukses', results});
});

app.delete('/api/admin/skrining/:id', async (req, res) => {
    if(req.query.password !== ADMIN_ACCESS_KEY) return res.status(401).json({status:'gagal'});
    try {
        const result = await SkriningResult.findByIdAndDelete(req.params.id);
        if (result && result.audioPublicId) {
            cloudinary.uploader.destroy(result.audioPublicId, { resource_type: 'video' }, (err) => {});
        }
        res.json({ status: 'sukses' });
    } catch(e) { res.status(500).json({ status: 'gagal' }); }
});

app.delete('/api/admin/skrining/batch', async (req, res) => {
    if(req.body.password !== ADMIN_ACCESS_KEY) return res.status(401).json({status:'gagal'});
    const docs = await SkriningResult.find({ _id: { $in: req.body.ids } });
    for (const doc of docs) {
        if (doc.audioPublicId) {
            cloudinary.uploader.destroy(doc.audioPublicId, { resource_type: 'video' }, (err) => {});
        }
    }
    await SkriningResult.deleteMany({ _id: { $in: req.body.ids } });
    res.json({status:'sukses'});
});

app.get('/admin', (req, res) => {
    if (req.query.password === ADMIN_ACCESS_KEY) {
        res.send(`<script>localStorage.setItem('${ADMIN_KEY_STORAGE}', '${req.query.password}'); window.location.href = 'admin.html';</script>`);
    } else res.redirect('/index.html');
});

app.use((err, req, res, next) => {
    console.error("🔥 ERROR LOG:", JSON.stringify(err, null, 2)); // Ini akan membuka isi [object Object]
    
    if (err instanceof multer.MulterError) {
        return res.status(500).json({ status: 'gagal', message: `Multer Error: ${err.message}` });
    } else if (err) {
        return res.status(500).json({ status: 'gagal', message: `Server Error: ${err.message}` });
    }
    next();
});

// --- START SERVER ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server siap di port ${PORT}`);
});