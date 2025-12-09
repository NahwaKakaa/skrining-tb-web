// server.js (FINAL VERSION - FIX & FULL FEATURES)

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const json2csv = require('json2csv').Parser;
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcrypt');
const { spawn } = require('child_process'); // Modul untuk memanggil Python
const app = express(); 

const PORT = process.env.PORT || 3000;
const saltRounds = 10; 

// --- KONFIGURASI ADMIN ---
const DEFAULT_ADMIN_USERNAME = 'admin_satu';
// Hash untuk password 'default123'
const DEFAULT_ADMIN_PASSWORD_HASH = '$2b$10$AHDo3Blp/n2MCWWq2m/RCecYChxHJ1n4/xfY21aC6osSRyeJB18ca'; 
const ADMIN_ACCESS_KEY = process.env.ADMIN_PASS || 'admin123'; 
const ADMIN_KEY_STORAGE = 'adminAccessKey'; // Variable ini penting untuk login admin

// --- KONEKSI DATABASE ---
const DB_URL = process.env.MONGODB_URI || 'mongodb://localhost:27017/skriningTBDB'; 

mongoose.connect(DB_URL)
    .then(() => console.log('✅ Terkoneksi ke MongoDB'))
    .catch(err => console.error('❌ Gagal koneksi ke MongoDB:', err));


// --- DEFINISI SCHEMA ---

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
    aiProbability: String, // Menyimpan nilai probabilitas AI
    aiAnalysis: String,    // Menyimpan label hasil AI
    tanggalSkrining: { type: Date, default: Date.now }
});
const SkriningResult = mongoose.model('SkriningResult', SkriningSchema);


// --- KONFIGURASI MULTER (UPLOAD) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync('uploads')) { fs.mkdirSync('uploads'); }
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const name = req.body.nama || 'unknown';
        // Sanitasi nama file agar aman
        const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        cb(null, `${safeName}_${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // Batas 10MB
});

// --- MIDDLEWARE ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// --- FUNGSI HELPER ---
const safeParseInt = (value) => {
    if (value === null || typeof value === 'undefined' || String(value).trim() === '') {
        return null;
    }
    const parsed = parseInt(value);
    return isNaN(parsed) ? null : parsed;
};


// ==========================================
// ROUTES: AUTHENTICATION (USER)
// ==========================================

app.post('/api/register', async (req, res) => {
    const { username, password, namaLengkap, no_telp } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUser = new User({ 
            username, password: hashedPassword, namaLengkap, no_telp 
        });
        await newUser.save();
        res.status(201).json({ status: 'sukses', message: 'Registrasi berhasil. Silakan login.' });
    } catch (error) {
        res.status(400).json({ status: 'gagal', message: 'Username sudah digunakan atau data tidak valid.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user) return res.status(401).json({ status: 'gagal', message: 'Username atau password salah.' });

    const match = await bcrypt.compare(password, user.password);
    if (match) {
        res.json({ status: 'sukses', message: 'Login berhasil', userId: user._id, nama: user.namaLengkap });
    } else {
        res.status(401).json({ status: 'gagal', message: 'Username atau password salah.' });
    }
});


// ==========================================
// ROUTES: PROFILE & HISTORY (USER)
// ==========================================

app.get('/api/profile/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('-password'); 
        user ? res.json({ status: 'sukses', data: user }) : res.status(404).json({ status: 'gagal' });
    } catch (error) { res.status(500).json({ status: 'gagal' }); }
});

app.post('/api/profile/update/:userId', async (req, res) => {
    const { namaLengkap, no_telp, usia, tinggiBadan, beratBadan, pendidikan, pekerjaan, jumlahAnggotaKeluarga } = req.body;
    
    const parseNumber = (value) => {
        if (!value || String(value).trim() === '') return null; 
        const parsed = parseFloat(value);
        return isNaN(parsed) ? null : parsed;
    };

    try {
        const updateData = {
            namaLengkap, no_telp, pendidikan, pekerjaan,
            usia: parseNumber(usia), tinggiBadan: parseNumber(tinggiBadan),
            beratBadan: parseNumber(beratBadan), jumlahAnggotaKeluarga: parseNumber(jumlahAnggotaKeluarga)
        };
        // Hapus key yang null
        Object.keys(updateData).forEach(key => updateData[key] == null && delete updateData[key]);

        const user = await User.findByIdAndUpdate(req.params.userId, updateData, { new: true });
        res.json({ status: 'sukses', message: 'Profil berhasil diperbarui.', updatedName: user.namaLengkap });
    } catch (error) {
        res.status(500).json({ status: 'gagal', message: 'Gagal memperbarui profil.' });
    }
});

app.get('/api/history/:userId', async (req, res) => {
    try {
        const history = await SkriningResult.find({ userId: req.params.userId }).sort({ tanggalSkrining: -1 });
        res.json({ status: 'sukses', data: history });
    } catch (error) { res.status(500).json({ status: 'gagal', message: 'Gagal mengambil riwayat.' }); }
});

app.delete('/api/skrining/:id', async (req, res) => {
    try {
        const result = await SkriningResult.findByIdAndDelete(req.params.id);
        if (result) {
            // Hapus file fisik jika ada
            if (result.audioFilePath) {
                const fullPath = path.join(__dirname, result.audioFilePath);
                if (fs.existsSync(fullPath)) {
                    try { fs.unlinkSync(fullPath); } catch (e) { console.error('Gagal hapus file:', e); }
                }
            }
            res.json({ status: 'sukses', message: 'Riwayat berhasil dihapus.' });
        } else {
            res.status(404).json({ status: 'gagal', message: 'Data tidak ditemukan.' });
        }
    } catch (error) {
        res.status(500).json({ status: 'gagal', message: 'Terjadi kesalahan server.' });
    }
});


// ==========================================
// ROUTES: SKRINING & AI PROCESSING
// ==========================================

app.post('/api/skrining', upload.single('uploadBatuk'), async (req, res) => {
    const data = req.body;
    let totalScore = 0;
    let audioPath = req.file ? req.file.path : null;

    // 1. LOGIKA SKOR RULE-BASED
    if (data.riwayatTB === 'Ya') totalScore += 5;
    
    const gejalaKeys = ['batuk2minggu', 'keringatMalam', 'nafsuMakanKurang', 'sesak', 'dahakDarah', 'malaise', 'penurunanBB', 'demamMenggigil'];
    gejalaKeys.forEach(k => { if (data[k] === 'Ya') totalScore += 3; });
    
    const paparanKeys = ['paparanRumahTB', 'paparanRuanganTertutup', 'paparanRawatTanpaAPD', 'paparanKeluargaTetangga', 'paparanLingkunganPadat'];
    paparanKeys.forEach(k => { if (data[k] === 'Ya') totalScore += 2; });
    
    const sikapKeys = ['sikapJarangCuciTangan', 'sikapTidakMaskerBatuk', 'sikapRuanganPadat', 'sikapMenundaPeriksa'];
    sikapKeys.forEach(k => { if (data[k] === 'Ya') totalScore += 1; });
    
    const lingKeys = ['lingkunganVentilasiKurang', 'lingkunganRumahPadat', 'lingkunganKurangMatahari', 'lingkunganTerpaparAsap', 'lingkunganSanitasiRendah'];
    lingKeys.forEach(k => { if (data[k] === 'Ya') totalScore += 1; });


    // 2. LOGIKA AI PYTHON
    const processAudioPrediction = () => {
        return new Promise((resolve) => {
            if (!audioPath) return resolve({ score: 0, prob: "0", analysis: "-" }); 

            const userAge = data.usia || 30; 
            
            // --- PERBAIKAN DI SINI ---
            // Tentukan jalur ke Python Venv secara eksplisit
            // Untuk Mac/Linux: 'venv/bin/python'
            // Untuk Windows: 'venv/Scripts/python.exe'
            const pythonExecutable = path.join(__dirname, 'venv/bin/python');

            // Gunakan variabel pythonExecutable, bukan string 'python3'
            const pythonProcess = spawn(pythonExecutable, ['predict_cough.py', audioPath, userAge]);
            // -------------------------
            
            let dataString = '';
            pythonProcess.stdout.on('data', (d) => dataString += d.toString());
            pythonProcess.stderr.on('data', (d) => console.error(`Python Log: ${d}`));

            pythonProcess.on('close', (code) => {
                try {
                    const result = JSON.parse(dataString);
                    if (result.status === 'success') {
                        console.log("Hasil AI:", result);
                        resolve({ 
                            score: result.ml_score || 0, 
                            prob: result.probability || "0",
                            analysis: result.ai_analysis || "Tidak Terdeteksi"
                        }); 
                    } else {
                        console.warn("AI Gagal:", result.message);
                        resolve({ score: 0, prob: "0", analysis: "Gagal" }); 
                    }
                } catch (e) { 
                    console.error("JSON Parse Error:", e);
                    resolve({ score: 0, prob: "0", analysis: "Error" }); 
                }
            });
        });
    };

    const aiResult = await processAudioPrediction();
    totalScore += aiResult.score;

    // 3. HASIL AKHIR
    let hasilPitaLila = 'Hijau';
    let rekomendasi = 'RISIKO RENDAH. Fokus pada pencegahan dan gaya hidup sehat.';
    
    if (totalScore >= 33) {
        hasilPitaLila = 'Merah';
        rekomendasi = 'RISIKO TINGGI. Segera lakukan pemeriksaan medis ke fasilitas kesehatan terdekat.';
    } else if (totalScore >= 17) {
        hasilPitaLila = 'Kuning';
        rekomendasi = 'RISIKO SEDANG. Lakukan observasi mandiri ketat selama 1-2 minggu ke depan.';
    }

    const userId = data.currentUserId ? data.currentUserId : null;
    
    // 4. SIMPAN
    const newResult = new SkriningResult({
        userId: userId, 
        nama: data.nama,
        usia: safeParseInt(data.usia), 
        no_telp: data.no_telp,
        dataSkrining: data,
        totalScore: totalScore,
        pitaLila: hasilPitaLila,
        rekomendasi: rekomendasi,
        audioFilePath: audioPath,
        aiProbability: aiResult.prob,
        aiAnalysis: aiResult.analysis
    });

    try {
        await newResult.save();
        res.json({
            status: 'sukses',
            pitaLila: hasilPitaLila,
            rekomendasi: rekomendasi,
            totalScore: totalScore,
            aiResult: aiResult
        });
    } catch (error) {
        res.status(500).json({ status: 'gagal', message: 'Gagal menyimpan data.' });
    }
});


// ==========================================
// ROUTES: ADMIN DASHBOARD
// ==========================================

app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    if (username !== DEFAULT_ADMIN_USERNAME) return res.status(401).json({ status: 'gagal' });
    const match = await bcrypt.compare(password, DEFAULT_ADMIN_PASSWORD_HASH);
    match ? res.json({ status: 'sukses' }) : res.status(401).json({ status: 'gagal' });
});

app.get('/admin/data/json', async (req, res) => {
    if (req.query.password !== ADMIN_ACCESS_KEY) return res.status(401).json({ status: 'gagal', message: 'Akses Ditolak' });
    try {
        const results = await SkriningResult.find().populate('userId', 'username namaLengkap').sort({ tanggalSkrining: -1 }).lean();
        res.json({ status: 'sukses', results });
    } catch (e) { res.status(500).json({ status: 'gagal' }); }
});

// Delete Single
app.delete('/api/admin/skrining/:id', async (req, res) => {
    if (req.query.password !== ADMIN_ACCESS_KEY) return res.status(401).json({ status: 'gagal' });
    
    try {
        const result = await SkriningResult.findByIdAndDelete(req.params.id);
        if (result && result.audioFilePath) {
             const fullPath = path.join(__dirname, result.audioFilePath);
             if (fs.existsSync(fullPath)) {
                try { fs.unlinkSync(fullPath); } catch(e){}
             }
        }
        res.json({ status: 'sukses' });
    } catch (e) { res.status(500).json({ status: 'gagal' }); }
});

// Delete Batch
app.delete('/api/admin/skrining/batch', async (req, res) => {
    const { password, ids } = req.body;
    if (password !== ADMIN_ACCESS_KEY) return res.status(401).json({ status: 'gagal' });
    
    try {
        const docs = await SkriningResult.find({ _id: { $in: ids } });
        docs.forEach(doc => {
            if(doc.audioFilePath) {
                try {
                    const fullPath = path.join(__dirname, doc.audioFilePath);
                    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
                } catch(e){}
            }
        });

        await SkriningResult.deleteMany({ _id: { $in: ids } });
        res.json({ status: 'sukses', message: `${ids.length} data dihapus.` });
    } catch (e) { res.status(500).json({ status: 'gagal' }); }
});

// Export CSV
app.get('/admin/download', async (req, res) => {
    if (req.query.password !== ADMIN_ACCESS_KEY) return res.status(401).send('Akses Ditolak');
    try {
        const results = await SkriningResult.find().lean();
        const csv = new json2csv({ fields: ['nama', 'totalScore', 'pitaLila'] }).parse(results);
        res.attachment(`data.csv`);
        res.send(csv);
    } catch (e) { res.status(500).send('Error'); }
});

// Admin Page Redirect
app.get('/admin', async (req, res) => {
    if (req.query.password === ADMIN_ACCESS_KEY) {
        res.send(`<script>localStorage.setItem('${ADMIN_KEY_STORAGE}', '${req.query.password}'); window.location.href = 'admin.html';</script>`);
    } else { 
        res.redirect('/index.html'); 
    }
});


// --- RUN SERVER ---
app.listen(PORT, () => {
    console.log(`Server siap di http://localhost:${PORT}`);
    console.log(`Akun Admin: ${DEFAULT_ADMIN_USERNAME} / default123`);
});