// server.js (REVISED - RAILWAY / DOCKER FRIENDLY)

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { Parser } = require('json2csv');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcrypt');
const { spawn } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;
const saltRounds = 10;

// --- ADMIN & CONFIG ---
const DEFAULT_ADMIN_USERNAME = 'admin_satu';
const DEFAULT_ADMIN_PASSWORD_HASH = '$2b$10$AHDo3Blp/n2MCWWq2m/RCecYChxHJ1n4/xfY21aC6osSRyeJB18ca';
const ADMIN_ACCESS_KEY = process.env.ADMIN_PASS || 'admin123';
const ADMIN_KEY_STORAGE = 'adminAccessKey';

// --- DATABASE CONNECTION ---
// Prefer env var MONGO_URI (Railway variable name). Provide helpful log if missing.
// --- DATABASE CONNECTION (REVISI TERBARU) ---
const DB_URL = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/skriningTBDB';
if (!process.env.MONGO_URI && !process.env.MONGODB_URI) {
  console.warn('⚠️  Warning: Menggunakan fallback MongoDB URL (localhost). Set MONGO_URI di environment hosting.');
}

mongoose.connect(DB_URL)
  .then(() => console.log('✅ Terkoneksi ke MongoDB'))
  .catch(err => {
    console.error('❌ Gagal koneksi ke MongoDB:', err);
    process.exit(1); // hentikan server jika gagal koneksi
  });

mongoose.connection.on('error', err => console.error('MongoDB connection error:', err));
mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB disconnected'));


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
  audioFilePath: String,
  aiProbability: String,
  aiAnalysis: String,
  tanggalSkrining: { type: Date, default: Date.now }
});
const SkriningResult = mongoose.model('SkriningResult', SkriningSchema);

// --- MULTER (UPLOAD) ---
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const name = (req.body.nama || 'unknown').toString();
    // sanitasi: huruf, angka, underscore
    const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase() || '.wav';
    cb(null, `${safeName}_${timestamp}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// --- HELPERS ---
const safeParseInt = (value) => {
  if (value === null || typeof value === 'undefined' || String(value).trim() === '') return null;
  const parsed = parseInt(value);
  return isNaN(parsed) ? null : parsed;
};

// Resolve python executable (allow override with env var)
const PYTHON_BIN = process.env.PYTHON_PATH || 'python3';

// Path to predict script (adjust if your script is in another folder)
const PYTHON_SCRIPT = path.join(__dirname, 'python', 'predict_cough.py');

// spawn python with timeout (ms)
const spawnPythonPredict = (audioPath, userAge, timeoutMs = 20000) => {
  return new Promise((resolve) => {
    // If script doesn't exist, return failure immediately
    if (!fs.existsSync(PYTHON_SCRIPT)) {
      console.error('Python script tidak ditemukan di:', PYTHON_SCRIPT);
      return resolve({ success: false, message: 'predict_cough.py not found' });
    }

    // Try python3, fallback to python
    const tryBins = [PYTHON_BIN, 'python'];
    let started = false;
    let proc;
    let lastError = null;

    const tryStart = (index) => {
      if (index >= tryBins.length) {
        return resolve({ success: false, message: 'No python executable found', error: lastError });
      }
      const bin = tryBins[index];
      try {
        proc = spawn(bin, [PYTHON_SCRIPT, audioPath, String(userAge)], { stdio: ['ignore', 'pipe', 'pipe'] });
        started = true;
      } catch (err) {
        lastError = err;
        return tryStart(index + 1);
      }

      let output = '';
      let stderr = '';
      const timer = setTimeout(() => {
        try { proc.kill(); } catch (e) {}
        resolve({ success: false, message: 'Python process timeout' , stderr });
      }, timeoutMs);

      proc.stdout.on('data', (d) => { output += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); console.error('Python stderr:', d.toString()); });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (!output) {
          return resolve({ success: false, message: 'No output from python', stderr });
        }
        try {
          const j = JSON.parse(output);
          resolve({ success: true, result: j });
        } catch (e) {
          console.error('Failed parse python output:', e);
          resolve({ success: false, message: 'Invalid JSON from python', raw: output, stderr });
        }
      });

      proc.on('error', (err) => {
        lastError = err;
        // try next binary
        tryStart(index + 1);
      });
    };

    tryStart(0);
  });
};

// ==========================================
// ROUTES: AUTHENTICATION
// ==========================================
app.post('/api/register', async (req, res) => {
  const { username, password, namaLengkap, no_telp } = req.body;
  if (!username || !password) return res.status(400).json({ status: 'gagal', message: 'username & password wajib' });
  try {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newUser = new User({ username, password: hashedPassword, namaLengkap, no_telp });
    await newUser.save();
    res.status(201).json({ status: 'sukses', message: 'Registrasi berhasil. Silakan login.' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(400).json({ status: 'gagal', message: 'Username sudah digunakan atau data tidak valid.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ status: 'gagal', message: 'username & password wajib' });
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ status: 'gagal', message: 'Username atau password salah.' });
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      return res.json({ status: 'sukses', message: 'Login berhasil', userId: user._id, nama: user.namaLengkap });
    } else {
      return res.status(401).json({ status: 'gagal', message: 'Username atau password salah.' });
    }
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ status: 'gagal', message: 'Server error' });
  }
});

// ==========================================
// PROFILE & HISTORY
// ==========================================
app.get('/api/profile/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    user ? res.json({ status: 'sukses', data: user }) : res.status(404).json({ status: 'gagal' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'gagal' });
  }
});

app.post('/api/profile/update/:userId', async (req, res) => {
  const { namaLengkap, no_telp, usia, tinggiBadan, beratBadan, pendidikan, pekerjaan, jumlahAnggotaKeluarga } = req.body;
  const parseNumber = (value) => (!value || String(value).trim() === '') ? null : (isNaN(Number(value)) ? null : Number(value));
  try {
    const updateData = {
      namaLengkap, no_telp, pendidikan, pekerjaan,
      usia: parseNumber(usia), tinggiBadan: parseNumber(tinggiBadan),
      beratBadan: parseNumber(beratBadan), jumlahAnggotaKeluarga: parseNumber(jumlahAnggotaKeluarga)
    };
    Object.keys(updateData).forEach(key => updateData[key] == null && delete updateData[key]);
    const user = await User.findByIdAndUpdate(req.params.userId, updateData, { new: true });
    res.json({ status: 'sukses', message: 'Profil berhasil diperbarui.', updatedName: user ? user.namaLengkap : null });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ status: 'gagal', message: 'Gagal memperbarui profil.' });
  }
});

app.get('/api/history/:userId', async (req, res) => {
  try {
    const history = await SkriningResult.find({ userId: req.params.userId }).sort({ tanggalSkrining: -1 });
    res.json({ status: 'sukses', data: history });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ status: 'gagal', message: 'Gagal mengambil riwayat.' });
  }
});

app.delete('/api/skrining/:id', async (req, res) => {
  try {
    const result = await SkriningResult.findByIdAndDelete(req.params.id);
    if (result) {
      if (result.audioFilePath) {
        const fullPath = path.join(__dirname, result.audioFilePath);
        if (fs.existsSync(fullPath)) {
          try { fs.unlinkSync(fullPath); } catch (e) { console.error('Gagal hapus file:', e); }
        }
      }
      res.json({ status: 'sukses', message: 'Riwayat berhasil dihapus.' });
    } else res.status(404).json({ status: 'gagal', message: 'Data tidak ditemukan.' });
  } catch (error) {
    console.error('Delete skrining error:', error);
    res.status(500).json({ status: 'gagal', message: 'Terjadi kesalahan server.' });
  }
});

// ==========================================
// SKRINING & AI
// ==========================================
app.post('/api/skrining', upload.single('uploadBatuk'), async (req, res) => {
  const data = req.body || {};
  let totalScore = 0;
  let audioPath = req.file ? req.file.path : null;

  // Rule-based scoring
  if (data.riwayatTB === 'Ya') totalScore += 5;
  const gejalaKeys = ['batuk2minggu', 'keringatMalam', 'nafsuMakanKurang', 'sesak', 'dahakDarah', 'malaise', 'penurunanBB', 'demamMenggigil'];
  gejalaKeys.forEach(k => { if (data[k] === 'Ya') totalScore += 3; });
  const paparanKeys = ['paparanRumahTB', 'paparanRuanganTertutup', 'paparanRawatTanpaAPD', 'paparanKeluargaTetangga', 'paparanLingkunganPadat'];
  paparanKeys.forEach(k => { if (data[k] === 'Ya') totalScore += 2; });
  const sikapKeys = ['sikapJarangCuciTangan', 'sikapTidakMaskerBatuk', 'sikapRuanganPadat', 'sikapMenundaPeriksa'];
  sikapKeys.forEach(k => { if (data[k] === 'Ya') totalScore += 1; });
  const lingKeys = ['lingkunganVentilasiKurang', 'lingkunganRumahPadat', 'lingkunganKurangMatahari', 'lingkunganTerpaparAsap', 'lingkunganSanitasiRendah'];
  lingKeys.forEach(k => { if (data[k] === 'Ya') totalScore += 1; });

  // AI prediction
  const processAudioPrediction = async () => {
    if (!audioPath) return { score: 0, prob: "0", analysis: "-" };
    const userAge = data.usia || 30;
    try {
      const out = await spawnPythonPredict(audioPath, userAge, 25000);
      if (!out.success) {
        console.warn('AI predict failed:', out.message || out.stderr || out.raw);
        return { score: 0, prob: "0", analysis: "Gagal" };
      }
      const result = out.result;
      // Expecting JSON with fields: status, probability, ml_score, ai_analysis
      if (result && result.status === 'success') {
        const prob = typeof result.probability !== 'undefined' ? String(result.probability) : "0";
        const ml_score = Number(result.ml_score || 0);
        return { score: ml_score, prob, analysis: result.ai_analysis || '-' };
      } else {
        return { score: 0, prob: "0", analysis: result && result.message ? result.message : "Gagal" };
      }
    } catch (e) {
      console.error('Exception in AI prediction:', e);
      return { score: 0, prob: "0", analysis: "Error" };
    }
  };

  const aiResult = await processAudioPrediction();
  totalScore += aiResult.score;

  // Final label & recommendation
  let hasilPitaLila = 'Hijau';
  let rekomendasi = 'RISIKO RENDAH. Fokus pada pencegahan dan gaya hidup sehat.';
  if (totalScore >= 33) {
    hasilPitaLila = 'Merah';
    rekomendasi = 'RISIKO TINGGI. Segera lakukan pemeriksaan medis ke fasilitas kesehatan terdekat.';
  } else if (totalScore >= 17) {
    hasilPitaLila = 'Kuning';
    rekomendasi = 'RISIKO SEDANG. Lakukan observasi mandiri ketat selama 1-2 minggu ke depan.';
  }

  const userId = data.currentUserId || null;
  const newResult = new SkriningResult({
    userId,
    nama: data.nama || 'Unknown',
    usia: safeParseInt(data.usia),
    no_telp: data.no_telp,
    dataSkrining: data,
    totalScore,
    pitaLila: hasilPitaLila,
    rekomendasi,
    audioFilePath: audioPath,
    aiProbability: aiResult.prob,
    aiAnalysis: aiResult.analysis
  });

  try {
    await newResult.save();
    res.json({
      status: 'sukses',
      pitaLila: hasilPitaLila,
      rekomendasi,
      totalScore,
      aiResult
    });
  } catch (error) {
    console.error('Save skrining error:', error);
    res.status(500).json({ status: 'gagal', message: 'Gagal menyimpan data.' });
  }
});

// ==========================================
// ADMIN DASHBOARD
// ==========================================
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (username !== DEFAULT_ADMIN_USERNAME) return res.status(401).json({ status: 'gagal' });
  try {
    const match = await bcrypt.compare(password, DEFAULT_ADMIN_PASSWORD_HASH);
    return match ? res.json({ status: 'sukses' }) : res.status(401).json({ status: 'gagal' });
  } catch (e) {
    console.error('Admin login error:', e);
    res.status(500).json({ status: 'gagal' });
  }
});

app.get('/admin/data/json', async (req, res) => {
  if (req.query.password !== ADMIN_ACCESS_KEY) return res.status(401).json({ status: 'gagal', message: 'Akses Ditolak' });
  try {
    const results = await SkriningResult.find().populate('userId', 'username namaLengkap').sort({ tanggalSkrining: -1 }).lean();
    res.json({ status: 'sukses', results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: 'gagal' });
  }
});

app.delete('/api/admin/skrining/:id', async (req, res) => {
  if (req.query.password !== ADMIN_ACCESS_KEY) return res.status(401).json({ status: 'gagal' });
  try {
    const result = await SkriningResult.findByIdAndDelete(req.params.id);
    if (result && result.audioFilePath) {
      const fullPath = path.join(__dirname, result.audioFilePath);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (e) { console.error(e); }
      }
    }
    res.json({ status: 'sukses' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: 'gagal' });
  }
});

app.delete('/api/admin/skrining/batch', async (req, res) => {
  const { password, ids } = req.body;
  if (password !== ADMIN_ACCESS_KEY) return res.status(401).json({ status: 'gagal' });
  try {
    const docs = await SkriningResult.find({ _id: { $in: ids } });
    for (const doc of docs) {
      if (doc.audioFilePath) {
        try {
          const fullPath = path.join(__dirname, doc.audioFilePath);
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        } catch (e) { console.error(e); }
      }
    }
    await SkriningResult.deleteMany({ _id: { $in: ids } });
    res.json({ status: 'sukses', message: `${ids.length} data dihapus.` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: 'gagal' });
  }
});

app.get('/admin/download', async (req, res) => {
  if (req.query.password !== ADMIN_ACCESS_KEY) return res.status(401).send('Akses Ditolak');
  try {
    const results = await SkriningResult.find().lean();
    const fields = ['nama', 'totalScore', 'pitaLila', 'tanggalSkrining'];
    const parser = new Parser({ fields });
    const csv = parser.parse(results);
    res.attachment(`data.csv`);
    res.send(csv);
  } catch (e) {
    console.error('CSV export error:', e);
    res.status(500).send('Error');
  }
});

app.get('/admin', async (req, res) => {
  if (req.query.password === ADMIN_ACCESS_KEY) {
    res.send(`<script>localStorage.setItem('${ADMIN_KEY_STORAGE}', '${req.query.password}'); window.location.href = 'admin.html';</script>`);
  } else {
    res.redirect('/index.html');
  }
});

// --- START SERVER ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server siap di port ${PORT}`);
});
