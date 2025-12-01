// server.js (FINAL VERSION - With Delete Feature)

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const json2csv = require("json2csv").Parser;
const multer = require("multer");
const fs = require("fs");
const bcrypt = require("bcrypt");
const app = express(); // Inisialisasi app di sini

const PORT = process.env.PORT || 3000;
const saltRounds = 10;

// --- KONSTANTA ADMIN DEFAULT ---
const DEFAULT_ADMIN_USERNAME = "admin_satu";
const DEFAULT_ADMIN_PASSWORD_HASH =
  "$2b$10$WLJ7/AGaXsX8IEWn4cm34eqo5l4iMkRjsLyTSMczcvuMvAfFkQRmO";
const ADMIN_ACCESS_KEY = process.env.ADMIN_PASS || "admin123";
const ADMIN_KEY_STORAGE = "adminAccessKey";

// Variabel Lingkungan
const DB_URL =
  process.env.MONGODB_URI || "mongodb://localhost:27017/skriningTBDB";

// --- Koneksi ke MongoDB ---
mongoose
  .connect(DB_URL)
  .then(() => console.log("Terkoneksi ke MongoDB"))
  .catch((err) => console.error("Gagal koneksi ke MongoDB:", err));

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
  jumlahAnggotaKeluarga: Number,
});
const User = mongoose.model("User", UserSchema);

const SkriningSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  nama: { type: String, required: true },
  usia: { type: Number, required: false },
  no_telp: String,
  dataSkrining: Object,
  totalScore: Number,
  pitaLila: String,
  rekomendasi: String,
  audioFilePath: String,
  tanggalSkrining: { type: Date, default: Date.now },
});
const SkriningResult = mongoose.model("SkriningResult", SkriningSchema);

// --- KONFIGURASI MULTER ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync("uploads")) {
      fs.mkdirSync("uploads");
    }
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const name = req.body.nama || "unknown";
    cb(
      null,
      `${name.replace(/\s/g, "_")}_${Date.now()}${path.extname(
        file.originalname
      )}`
    );
  },
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- ENDPOINT HELPER ---
const safeParseInt = (value) => {
  if (
    value === null ||
    typeof value === "undefined" ||
    String(value).trim() === ""
  )
    return null;
  const parsed = parseInt(value);
  return isNaN(parsed) ? null : parsed;
};

// --- ENDPOINT USER & AUTH ---

app.post("/api/register", async (req, res) => {
  const { username, password, namaLengkap, no_telp } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newUser = new User({
      username,
      password: hashedPassword,
      namaLengkap,
      no_telp,
    });
    await newUser.save();
    res.status(201).json({
      status: "sukses",
      message: "Registrasi berhasil. Silakan login.",
    });
  } catch (error) {
    res
      .status(400)
      .json({ status: "gagal", message: "Username sudah digunakan." });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user)
    return res
      .status(401)
      .json({ status: "gagal", message: "Username/password salah." });

  const match = await bcrypt.compare(password, user.password);
  if (match) {
    res.json({
      status: "sukses",
      message: "Login berhasil",
      userId: user._id,
      nama: user.namaLengkap,
    });
  } else {
    res
      .status(401)
      .json({ status: "gagal", message: "Username/password salah." });
  }
});

// --- ENDPOINT HISTORY & PROFIL ---

app.get("/api/history/:userId", async (req, res) => {
  try {
    const history = await SkriningResult.find({
      userId: req.params.userId,
    }).sort({ tanggalSkrining: -1 });
    res.json({ status: "sukses", data: history });
  } catch (error) {
    res
      .status(500)
      .json({ status: "gagal", message: "Gagal mengambil riwayat." });
  }
});

// API BARU: DELETE RIWAYAT
app.delete("/api/skrining/:id", async (req, res) => {
  try {
    // Cari dan hapus data berdasarkan ID
    const result = await SkriningResult.findByIdAndDelete(req.params.id);

    if (result) {
      // Hapus file audio terkait jika ada
      if (result.audioFilePath) {
        // Pastikan path lengkap dan file ada sebelum menghapus
        const fullPath = path.join(__dirname, result.audioFilePath);
        if (fs.existsSync(fullPath)) {
          try {
            fs.unlinkSync(fullPath);
            console.log("File audio berhasil dihapus:", fullPath);
          } catch (err) {
            console.error("Gagal menghapus file audio:", err);
          }
        }
      }
      res.json({ status: "sukses", message: "Riwayat berhasil dihapus." });
    } else {
      res
        .status(404)
        .json({
          status: "gagal",
          message: "Data tidak ditemukan di database.",
        });
    }
  } catch (error) {
    console.error("Error saat menghapus:", error);
    res
      .status(500)
      .json({ status: "gagal", message: "Terjadi kesalahan internal server." });
  }
});

app.get("/api/profile/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password");
    user
      ? res.json({ status: "sukses", data: user })
      : res.status(404).json({ status: "gagal" });
  } catch (error) {
    res.status(500).json({ status: "gagal" });
  }
});

app.post("/api/profile/update/:userId", async (req, res) => {
  const {
    namaLengkap,
    no_telp,
    usia,
    tinggiBadan,
    beratBadan,
    pendidikan,
    pekerjaan,
    jumlahAnggotaKeluarga,
  } = req.body;
  try {
    const updateData = {
      namaLengkap,
      no_telp,
      pendidikan,
      pekerjaan,
      usia: safeParseInt(usia),
      tinggiBadan: safeParseInt(tinggiBadan),
      beratBadan: safeParseInt(beratBadan),
      jumlahAnggotaKeluarga: safeParseInt(jumlahAnggotaKeluarga),
    };
    Object.keys(updateData).forEach(
      (key) => updateData[key] == null && delete updateData[key]
    );

    const user = await User.findByIdAndUpdate(req.params.userId, updateData, {
      new: true,
    });
    res.json({
      status: "sukses",
      message: "Profil diperbarui.",
      updatedName: user.namaLengkap,
    });
  } catch (error) {
    res.status(500).json({ status: "gagal", message: "Gagal update." });
  }
});

// --- ENDPOINT SKRINING ---
app.post("/api/skrining", upload.single("uploadBatuk"), async (req, res) => {
  const data = req.body;
  let totalScore = 0;
  let audioPath = req.file ? req.file.path : null;

  if (data.riwayatTB === "Ya") totalScore += 5;
  const gejalaKeys = [
    "batuk2minggu",
    "keringatMalam",
    "nafsuMakanKurang",
    "sesak",
    "dahakDarah",
    "malaise",
    "penurunanBB",
    "demamMenggigil",
  ];
  gejalaKeys.forEach((k) => {
    if (data[k] === "Ya") totalScore += 3;
  });
  const paparanKeys = [
    "paparanRumahTB",
    "paparanRuanganTertutup",
    "paparanRawatTanpaAPD",
    "paparanKeluargaTetangga",
    "paparanLingkunganPadat",
  ];
  paparanKeys.forEach((k) => {
    if (data[k] === "Ya") totalScore += 2;
  });
  const sikapKeys = [
    "sikapJarangCuciTangan",
    "sikapTidakMaskerBatuk",
    "sikapRuanganPadat",
    "sikapMenundaPeriksa",
  ];
  sikapKeys.forEach((k) => {
    if (data[k] === "Ya") totalScore += 1;
  });
  const lingKeys = [
    "lingkunganVentilasiKurang",
    "lingkunganRumahPadat",
    "lingkunganKurangMatahari",
    "lingkunganTerpaparAsap",
    "lingkunganSanitasiRendah",
  ];
  lingKeys.forEach((k) => {
    if (data[k] === "Ya") totalScore += 1;
  });

  let hasilPitaLila = "Hijau";
  let rekomendasi =
    "RISIKO RENDAH. Fokus pada pencegahan dan gaya hidup sehat.";
  if (totalScore >= 33) {
    hasilPitaLila = "Merah";
    rekomendasi =
      "RISIKO TINGGI. Segera lakukan pemeriksaan medis ke fasilitas kesehatan terdekat.";
  } else if (totalScore >= 17) {
    hasilPitaLila = "Kuning";
    rekomendasi =
      "RISIKO SEDANG. Lakukan observasi mandiri ketat selama 1-2 minggu ke depan.";
  }

  const newResult = new SkriningResult({
    userId: data.currentUserId || null,
    nama: data.nama,
    usia: safeParseInt(data.usia),
    no_telp: data.no_telp,
    dataSkrining: data,
    totalScore,
    pitaLila: hasilPitaLila,
    rekomendasi,
    audioFilePath: audioPath,
  });

  try {
    await newResult.save();
    res.json({
      status: "sukses",
      pitaLila: hasilPitaLila,
      rekomendasi,
      totalScore,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "gagal", message: "Gagal menyimpan data." });
  }
});

// --- ENDPOINT ADMIN ---
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;
  if (username !== DEFAULT_ADMIN_USERNAME)
    return res.status(401).json({ status: "gagal" });
  const match = await bcrypt.compare(password, DEFAULT_ADMIN_PASSWORD_HASH);
  match
    ? res.json({ status: "sukses" })
    : res.status(401).json({ status: "gagal" });
});

app.get("/admin/data/json", async (req, res) => {
  if (req.query.password !== ADMIN_ACCESS_KEY)
    return res.status(401).json({ status: "gagal" });
  const results = await SkriningResult.find()
    .populate("userId", "username")
    .sort({ tanggalSkrining: -1 });
  res.json({ status: "sukses", results });
});

app.get("/admin/download", async (req, res) => {
  if (req.query.password !== ADMIN_ACCESS_KEY)
    return res.status(401).send("Akses Ditolak");
  try {
    const results = await SkriningResult.find().lean();
    const csv = new json2csv({
      fields: [
        "nama",
        "totalScore",
        "pitaLila",
        "rekomendasi",
        "tanggalSkrining",
      ],
    }).parse(results);
    res.header("Content-Type", "text/csv");
    res.attachment(
      `data_skrining.${req.query.format === "excel" ? "xlsx" : "csv"}`
    );
    res.send(csv);
  } catch (e) {
    res.status(500).send("Error");
  }
});

app.get("/admin", async (req, res) => {
  if (req.query.password === ADMIN_ACCESS_KEY) {
    res.send(
      `<script>localStorage.setItem('${ADMIN_KEY_STORAGE}', '${req.query.password}'); window.location.href = 'admin.html';</script>`
    );
  } else {
    res.redirect("/index.html");
  }
});

app.listen(PORT, () => {
  console.log(`Server siap di http://localhost:${PORT}`);
});
