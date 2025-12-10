// server.js (OPTIMAL FINAL VERSION - RAILWAY/RENDER READY)

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { Parser } = require('json2csv');
const multer = require('multer');
const fs = require('fs');
const https = require('https'); // Modul native untuk download file
const bcrypt = require('bcrypt');
const { spawn } = require('child_process');
const cors = require('cors');

// --- 1. IMPORT CLOUDINARY ---
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 8080;
const saltRounds = 10;

// --- 2. KONFIGURASI CLOUDINARY ---
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
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  namaLengkap: String,
  no_telp: String,
  usia: Number,
  tinggiBadan: Number, beratBadan: Number,
  pendidikan: String, pekerjaan: String, jumlahAnggotaKeluarga: Number
}));

const SkriningResult = mongoose.model('SkriningResult', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  nama: String, usia: Number, no_telp: String,
  dataSkrining: Object, totalScore: Number, pitaLila: String, rekomendasi: String,
  audioFilePath: String, // Berisi URL Cloudinary
  audioPublicId: String, // ID untuk hapus file di Cloudinary
  aiProbability: String, aiAnalysis: String,
  tanggalSkrining: { type: Date, default: Date.now }
}));

// --- 3. STORAGE CONFIG (CLOUDINARY) ---
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'tb-care-uploads',
    resource_type: 'video', // Wajib 'video' agar menerima mp4/audio
    allowed_formats: ['wav', 'mp3', 'm4a', 'webm', 'ogg', 'mp4'],
    public_id: (req, file) => {
        const name = (req.body.nama || 'unknown').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        return `${name}_${Date.now()}`;
    }
  }
});
const upload = multer({ storage });

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Buat folder lokal sementara untuk transit file AI
const tempDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// --- 4. HELPER: DOWNLOAD FILE (STRATEGI KESTABILAN AI) ---
const downloadFile = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) return reject(new Error(`Download gagal: ${response.statusCode}`));
            response.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
};

// --- 5. PYTHON AI HANDLER ---
// Script Python ada di root folder (sejajar server.js)
const PYTHON_SCRIPT = path.join(__dirname, 'predict_cough.py');

const spawnPythonPredict = (localFilePath, userAge) => {
    return new Promise((resolve) => {
        if (!fs.existsSync(PYTHON_SCRIPT)) return resolve({ success: false, message: 'Script Python tidak ditemukan' });

        // Gunakan 'python3' karena Railway/Docker berbasis Linux
        const proc = spawn('python3', [PYTHON_SCRIPT, localFilePath, String(userAge)]);
        
        let output = '';
        let stderr = '';

        // Timeout 40 detik untuk mencegah server hang
        const timer = setTimeout(() => {
            proc.kill();
            resolve({ success: false, message: 'AI Timeout (Proses terlalu lama)' });
        }, 40000);

        proc.stdout.on('data', d => output += d.toString());
        proc.stderr.on('data', d => stderr += d.toString());

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0 && !output) {
                console.error("Python Error:", stderr);
                return resolve({ success: false, message: 'Python Crash/Error', stderr });
            }
            try {
                // Cari JSON valid dalam output
                const jsonMatch = output.match(/\{.*\}/s);
                if (jsonMatch) {
                    resolve({ success: true, result: JSON.parse(jsonMatch[0]) });
                } else {
                    resolve({ success: false, message: 'Output AI bukan JSON valid', raw: output });
                }
            } catch (e) {
                resolve({ success: false, message: 'Gagal parsing JSON AI', raw: output });
            }
        });
        
        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({ success: false, message: 'Gagal menjalankan command python3' });
        });
    });
};

// --- ROUTES ---

// 1. Register & Login
app.post('/api/register', async (req, res) => {
  const { username, password, namaLengkap, no_telp } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    await new User({ username, password: hashedPassword, namaLengkap, no_telp }).save();
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

// 2. Profile & History
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
    // Hapus file di Cloudinary juga
    if (result && result.audioPublicId) {
        cloudinary.uploader.destroy(result.audioPublicId, { resource_type: 'video' }, ()=>{});
    }
    res.json({ status: 'sukses' });
  } catch (e) { res.status(500).json({ status: 'gagal' }); }
});

// --- 6. SKRINING CORE (DENGAN LOGIKA DOWNLOAD) ---
app.post('/api/skrining', upload.single('uploadBatuk'), async (req, res) => {
    const data = req.body;
    let totalScore = 0;
    
    // Cloudinary memberikan URL di file.path dan ID di file.filename
    const audioUrl = req.file ? req.file.path : null; 
    const audioPublicId = req.file ? req.file.filename : null;

    // Hitung Rule-based Score
    if (data.riwayatTB === 'Ya') totalScore += 5;
    ['batuk2minggu', 'keringatMalam', 'nafsuMakanKurang', 'sesak', 'dahakDarah', 'malaise', 'penurunanBB', 'demamMenggigil'].forEach(k => { if (data[k] === 'Ya') totalScore += 3; });
    ['paparanRumahTB', 'paparanRuanganTertutup', 'paparanRawatTanpaAPD', 'paparanKeluargaTetangga', 'paparanLingkunganPadat'].forEach(k => { if (data[k] === 'Ya') totalScore += 2; });
    ['sikapJarangCuciTangan', 'sikapTidakMaskerBatuk', 'sikapRuanganPadat', 'sikapMenundaPeriksa', 'lingkunganVentilasiKurang', 'lingkunganRumahPadat', 'lingkunganKurangMatahari', 'lingkunganTerpaparAsap', 'lingkunganSanitasiRendah'].forEach(k => { if (data[k] === 'Ya') totalScore += 1; });

    // PROSES AI (Download URL -> Local -> Python -> Delete Local)
    const aiResult = await (async () => {
        if (!audioUrl) return { score: 0, prob: "0", analysis: "-" };

        // Tentukan nama file sementara di server
        const tempFileName = `temp_${Date.now()}.mp4`;
        const tempFilePath = path.join(tempDir, tempFileName);

        try {
            console.log(`[AI] Downloading audio: ${audioUrl}`);
            await downloadFile(audioUrl, tempFilePath);
            
            console.log(`[AI] Processing local file: ${tempFilePath}`);
            const out = await spawnPythonPredict(tempFilePath, data.usia || 30);
            
            // Hapus file sementara setelah diproses
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

            if (out.success && out.result && out.result.status === 'success') {
                return {
                    score: Number(out.result.ml_score || 0),
                    prob: String(out.result.probability || "0"),
                    analysis: out.result.ai_analysis || '-'
                };
            }
            
            console.warn('[AI] Warning:', out.message || out.stderr);
            return { score: 0, prob: "0", analysis: "Gagal" };

        } catch (e) {
            console.error("[AI] Exception:", e);
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); // Cleanup jika error
            return { score: 0, prob: "0", analysis: "Error" };
        }
    })();

    totalScore += aiResult.score;

    // Labeling Hasil
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
            audioFilePath: audioUrl, // Simpan URL Cloudinary
            audioPublicId: audioPublicId,
            aiProbability: aiResult.prob,
            aiAnalysis: aiResult.analysis
        }).save();
        
        res.json({ status: 'sukses', pitaLila, rekomendasi, totalScore, aiResult });
    } catch (e) { 
        res.status(500).json({ status: 'gagal', message: 'Gagal Simpan Database' });
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

app.delete('/api/admin/skrining/batch', async (req, res) => {
    if(req.body.password !== ADMIN_ACCESS_KEY) return res.status(401).json({status:'gagal'});
    const docs = await SkriningResult.find({ _id: { $in: req.body.ids } });
    // Hapus file audio massal di Cloudinary
    for (const doc of docs) {
        if (doc.audioPublicId) cloudinary.uploader.destroy(doc.audioPublicId, { resource_type: 'video' }, ()=>{}).catch(()=>{});
    }
    await SkriningResult.deleteMany({ _id: { $in: req.body.ids } });
    res.json({status:'sukses'});
});

app.delete('/api/admin/skrining/:id', async (req, res) => {
    if(req.query.password !== ADMIN_ACCESS_KEY) return res.status(401).json({status:'gagal'});
    const doc = await SkriningResult.findByIdAndDelete(req.params.id);
    if(doc && doc.audioPublicId) cloudinary.uploader.destroy(doc.audioPublicId, { resource_type: 'video' }, ()=>{}).catch(()=>{});
    res.json({status:'sukses'});
});

app.get('/admin', (req, res) => {
    if (req.query.password === ADMIN_ACCESS_KEY) {
        res.send(`<script>localStorage.setItem('${ADMIN_KEY_STORAGE}', '${req.query.password}'); window.location.href = 'admin.html';</script>`);
    } else res.redirect('/index.html');
});

// --- ERROR HANDLER (Agar tidak crash "object Object") ---
app.use((err, req, res, next) => {
    console.error("🔥 ERROR LOG:", JSON.stringify(err, null, 2));
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