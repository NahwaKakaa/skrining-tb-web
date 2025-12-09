// public/script.js (FINAL FULL VERSION - NO CUTS)

const USER_ID_KEY = 'currentUserId';
const USER_NAME_KEY = 'currentUserName';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inisialisasi Tampilan Awal
    updateAuthButtons();
    initCustomDropdowns();
    setupHamburger();
    setupInfoModal();
    
    // 2. Setup Logika Inti
    setupAuthListeners();
    setupAudioLogic();
    setupFormSubmit();
    
    // 3. Cek Sesi Login (Auto-fill jika sudah login)
    const userId = localStorage.getItem(USER_ID_KEY);
    if (userId) fillSkriningForm(userId);

    // ============================================================
    // ★ GLOBAL EVENT DELEGATION (CRITICAL FIX) ★
    // Menangani klik pada elemen dinamis (tombol login/logout yang dibuat via JS)
    // ============================================================
    document.body.addEventListener('click', function(e) {
        const target = e.target;

        // 1. Handle Tombol Login (Navbar)
        if (target.id === 'loginButton' || target.closest('#loginButton')) {
            e.preventDefault();
            e.stopPropagation();
            showAuthModal('login');
            closeHamburger();
        }
        
        // 2. Handle Tombol Register (Navbar)
        else if (target.id === 'registerButton' || target.closest('#registerButton')) {
            e.preventDefault();
            e.stopPropagation();
            showAuthModal('register');
            closeHamburger();
        }

        // 3. Handle Tombol Logout (Navbar)
        else if (target.id === 'logoutButton' || target.closest('#logoutButton')) {
            e.preventDefault();
            e.stopPropagation();
            handleLogout();
            closeHamburger();
        }

        // 4. Handle Link Text di dalam Modal ("Belum punya akun? Daftar")
        else if (target.closest('.modal-switch a')) {
            e.preventDefault();
            e.stopPropagation();
            const text = target.innerText.toLowerCase();
            if(text.includes('daftar')) showAuthModal('register');
            else showAuthModal('login');
        }

        // 5. Handle Tutup Modal saat klik Overlay (Luar kotak)
        else if (target.classList.contains('modal')) {
            if (target.id !== 'loadingModal') { // Jangan tutup loading modal sembarangan
                target.classList.remove('show');
                setTimeout(() => target.style.display = 'none', 300);
            }
        }

        // 6. Handle Tombol Close (X) di Modal
        else if (target.classList.contains('close-button') || target.classList.contains('close-info-button')) {
            const modal = target.closest('.modal');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => modal.style.display = 'none', 300);
            }
        }
    });
});


/* =========================================
   1. AUTHENTICATION & UI LOGIC
   ========================================= */

function updateAuthButtons() {
    const userId = localStorage.getItem(USER_ID_KEY);
    const container = document.getElementById('authContainer');
    const inputs = ['nama', 'usia', 'no_telp'].map(id => document.getElementById(id));
    
    if (!container) return;

    if (userId) {
        // KONDISI: SUDAH LOGIN
        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-weight:500; font-size:0.9rem; color:#555;">Halo, ${localStorage.getItem(USER_NAME_KEY)}!</span>
                <button id="logoutButton" class="auth-button" style="border-color:var(--danger); color:var(--danger); padding:8px 20px;">Logout</button>
            </div>
        `;
        
        const histLink = document.getElementById('historyLink');
        const profLink = document.getElementById('profileLink');
        if(histLink) histLink.style.display = 'block';
        if(profLink) profLink.style.display = 'block';
        
        // Kunci input biodata agar konsisten
        inputs.forEach(i => { if(i) i.readOnly = true; });

    } else {
        // KONDISI: BELUM LOGIN (GUEST)
        container.innerHTML = `
            <button id="loginButton" class="auth-button">Masuk</button>
            <button id="registerButton" class="auth-button" style="margin-left:10px;">Daftar</button>
        `;
        
        const histLink = document.getElementById('historyLink');
        const profLink = document.getElementById('profileLink');
        if(histLink) histLink.style.display = 'none';
        if(profLink) profLink.style.display = 'none';
        
        inputs.forEach(i => { if(i) i.readOnly = false; });
    }
}

// --- MODAL AUTHENTICATION ---
function showAuthModal(mode) {
    const modal = document.getElementById('authModal');
    const lForm = document.getElementById('loginForm');
    const rForm = document.getElementById('registerForm');
    const title = document.getElementById('modalTitle');
    
    // Reset Form
    if(lForm) lForm.reset(); 
    if(rForm) rForm.reset();

    if (mode === 'login') {
        if(lForm) lForm.style.display = 'block';
        if(rForm) rForm.style.display = 'none';
        if(title) title.textContent = 'Masuk Akun';
    } else {
        if(lForm) lForm.style.display = 'none';
        if(rForm) rForm.style.display = 'block';
        if(title) title.textContent = 'Daftar Akun Baru';
    }
    
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if(modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }
}

function handleLogout() {
    localStorage.removeItem(USER_ID_KEY); 
    localStorage.removeItem(USER_NAME_KEY);
    updateAuthButtons();
    closeHamburger();
    
    // Reset form fields
    ['nama', 'usia', 'no_telp'].forEach(id => { 
        const el = document.getElementById(id); 
        if(el) { el.value=''; el.readOnly=false; } 
    });
    
    customAlert('Anda telah logout.', 'Sesi Berakhir');
}

// --- API LOGIN ---
async function attemptLogin(username, password, endpoint, role) {
    try {
        const res = await fetch(endpoint, { 
            method: 'POST', headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify({username, password}) 
        });
        
        if (res.ok) {
            const result = await res.json();
            if (role === 'admin') {
                window.location.href = '/admin?password=admin123'; 
            } else {
                localStorage.setItem(USER_ID_KEY, result.userId);
                localStorage.setItem(USER_NAME_KEY, result.nama);
                updateAuthButtons();
                closeAuthModal();
                fillSkriningForm(result.userId);
                customAlert(`Selamat datang, ${result.nama}!`, 'Login Berhasil');
            }
            return true;
        }
    } catch(e) { console.error("Login Err:", e); }
    return false;
}

async function handleLoginSubmit(username, password) {
    const btn = document.getElementById('btnLoginSubmit');
    const oldText = btn ? btn.innerText : 'Masuk';
    if(btn) { btn.innerText = 'Memuat...'; btn.disabled = true; }

    let success = false;
    // Cek User dulu, lalu Cek Admin
    if (await attemptLogin(username, password, '/api/login', 'user')) success = true;
    else if (await attemptLogin(username, password, '/api/admin/login', 'admin')) success = true;

    if(btn) { btn.innerText = oldText; btn.disabled = false; }

    if (!success) customAlert('Username atau Password salah.', 'Login Gagal');
}

// --- API REGISTER ---
async function handleRegisterSubmit(u, p, n, t) {
    const btn = document.querySelector('#registerForm button');
    const oldText = btn ? btn.innerText : 'Daftar';
    if(btn) { btn.innerText = 'Proses...'; btn.disabled = true; }

    try {
        const res = await fetch('/api/register', { 
            method: 'POST', headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify({username:u, password:p, namaLengkap:n, no_telp:t}) 
        });
        const json = await res.json();
        
        if (json.status === 'sukses') {
            closeAuthModal(); 
            customAlert(json.message, 'Registrasi Berhasil');
            setTimeout(() => showAuthModal('login'), 1500); 
        } else {
            customAlert(json.message, 'Gagal');
        }
    } catch(e) { customAlert('Koneksi bermasalah.', 'Error'); }
    finally { if(btn) { btn.innerText = oldText; btn.disabled = false; } }
}

function setupAuthListeners() {
    const lForm = document.getElementById('loginForm'); 
    if(lForm) lForm.onsubmit = (e) => { e.preventDefault(); handleLoginSubmit(e.target.username.value, e.target.password.value); };
    
    const rForm = document.getElementById('registerForm');
    if(rForm) rForm.onsubmit = (e) => { e.preventDefault(); handleRegisterSubmit(e.target.reg_username.value, e.target.reg_password.value, e.target.reg_namaLengkap.value, e.target.reg_no_telp.value); };
}


/* =========================================
   2. FORM SKRINING (SUBMIT & VALIDASI)
   ========================================= */

// --- FUNGSI UTAMA YANG DIPERBAIKI (MENGATASI MULTER ERROR) ---
function setupFormSubmit() {
    const form = document.getElementById('skriningForm');
    if(!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault(); // Mencegah reload halaman
        
        // 1. VALIDASI INPUT (Wajib Diisi)
        // Bersihkan error lama
        document.querySelectorAll('.error-msg').forEach(el => el.remove());
        document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
        document.querySelectorAll('.custom-select-trigger.error').forEach(el => el.classList.remove('error'));

        let isValid = true;
        let firstInvalid = null;
        const requiredInputs = form.querySelectorAll('[required]');
        
        requiredInputs.forEach(input => {
            const val = input.value;
            if (!val || val.trim() === "") {
                isValid = false;
                if (!firstInvalid) firstInvalid = input;
                
                // Style Error
                if (input.tagName === 'SELECT') {
                    const wrapper = input.previousElementSibling;
                    if(wrapper?.classList.contains('custom-select-wrapper')) {
                        wrapper.querySelector('.custom-select-trigger').classList.add('error');
                    }
                } else {
                    input.classList.add('input-error');
                }
            }
        });

        if (!isValid) {
            if(firstInvalid) {
                const target = firstInvalid.tagName === 'SELECT' ? firstInvalid.previousElementSibling : firstInvalid;
                target.scrollIntoView({behavior: 'smooth', block: 'center'});
            }
            return customAlert("Mohon lengkapi semua pertanyaan yang berwarna merah.", "Data Belum Lengkap");
        }

        // 2. PERSIAPAN DATA (PENYEBAB ERROR DIPERBAIKI DISINI)
        // Gunakan konstruktor FormData langsung dari elemen form. 
        // Ini otomatis menangkap file yang ada di input[type="file"] dengan benar.
        const formData = new FormData(form);
        
        // Tambahkan user ID jika ada (ini data tambahan, bukan file)
        const uid = localStorage.getItem(USER_ID_KEY);
        if(uid) formData.append('currentUserId', uid);
        
        // Cek apakah ada file audio untuk mengatur teks loading
        const fileInput = document.getElementById('uploadBatuk');
        const hasFile = fileInput && fileInput.files.length > 0;

        // 3. UI LOADING STATE
        const btn = form.querySelector('button[type="submit"]');
        const oldText = btn.innerText;
        btn.innerText = hasFile ? '🤖 Menganalisis Audio...' : '⏳ Memproses Data...';
        btn.disabled = true;
        btn.style.opacity = '0.7';

        // 4. KIRIM DATA
        try {
            const res = await fetch('/api/skrining', { 
                method: 'POST', 
                body: formData // Kirim langsung FormData murni
            });
            
            if(!res.ok) throw new Error(`HTTP Error: ${res.status}`);
            
            const result = await res.json();
            displayResult(result);
            
        } catch(err) {
            console.error(err);
            customAlert('Gagal memproses data. Pastikan server berjalan.', 'Error Server');
        } finally {
            // Reset Tombol
            btn.innerText = oldText;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    };
}

function displayResult(result) {
    const div = document.getElementById('hasilSkrining');
    let color = result.pitaLila === 'Merah' ? '#e74c3c' : result.pitaLila === 'Kuning' ? '#f1c40f' : '#2ecc71';
    
    // Tampilan Hasil AI
    let aiHtml = '';
    if(result.aiResult && result.aiResult.analysis && result.aiResult.analysis !== '-' && result.aiResult.analysis !== 'Tidak Terdeteksi') {
        let prob = (parseFloat(result.aiResult.prob)*100).toFixed(0)+'%';
        aiHtml = `<div style="margin-top:20px; padding:15px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; text-align:left;">
                    <div style="font-weight:600; color:#0369a1; margin-bottom:5px;">🎙️ Analisis Suara AI</div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span>Prediksi: <strong>${result.aiResult.analysis}</strong></span>
                        <span style="font-size:0.9rem; color:#64748b;">Keyakinan: ${prob}</span>
                    </div>
                  </div>`;
    }

    div.innerHTML = `
        <div style="background:white; padding:40px; border-radius:20px; box-shadow:0 15px 50px rgba(0,0,0,0.1); text-align:center; margin-top:40px; border-top:5px solid ${color};">
            <h2 style="color:${color}; margin-bottom:10px; font-size:2rem;">Status: ${result.pitaLila}</h2>
            
            <div style="background:${color}15; color:${color}; display:inline-block; padding:5px 15px; border-radius:50px; font-weight:700; font-size:0.9rem; margin-bottom:20px;">
                Total Skor: ${result.totalScore}
            </div>
            
            <p style="font-size:1.1rem; margin-bottom:20px; color:#333;">${result.rekomendasi}</p>
            ${aiHtml}
            
            <div style="margin-top:30px; padding-top:20px; border-top:1px solid #f1f5f9;">
                <p style="color:#94a3b8; font-size:0.85rem; margin-bottom:15px;">⚠️ <strong>Disclaimer:</strong> Hasil ini adalah skrining awal dan bukan diagnosis medis final.</p>
                <button onclick="location.reload()" style="padding:12px 30px; background:var(--primary); color:white; border:none; border-radius:50px; font-weight:600; cursor:pointer; box-shadow:0 4px 10px rgba(0,0,0,0.1);">Ulangi Skrining</button>
            </div>
        </div>`;
    div.scrollIntoView({behavior:'smooth', block:'center'});
}


/* =========================================
   3. COMPONENTS & UTILS
   ========================================= */

function setupHamburger() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.header-controls');
    if (hamburger && navMenu) {
        hamburger.onclick = (e) => {
            e.stopPropagation();
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        };
    }
}

function closeHamburger() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.header-controls');
    if (hamburger && navMenu) {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
    }
}

function setupInfoModal() {
    const helpBtn = document.getElementById('helpButton');
    const infoModal = document.getElementById('infoModal');
    const closeBtn = document.querySelector('.close-info-button');
    if (helpBtn && infoModal) {
        helpBtn.onclick = (e) => { 
            e.preventDefault(); 
            e.stopPropagation(); 
            infoModal.style.display = 'flex'; 
            setTimeout(() => infoModal.classList.add('show'), 10);
        };
        
        if (closeBtn) closeBtn.onclick = () => { 
            infoModal.classList.remove('show');
            setTimeout(() => infoModal.style.display = 'none', 300);
        };
    }
}

function customAlert(message, title='Informasi') {
    const modal = document.getElementById('messageAlertModal');
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertMessage').textContent = message;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    
    document.getElementById('alertCloseButton').onclick = () => { 
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    };
}

async function fillSkriningForm(userId) {
    try {
        const res = await fetch(`/api/profile/${userId}`);
        const result = await res.json();
        if (result.status === 'sukses' && result.data) {
            const d = result.data;
            if(document.getElementById('nama')) document.getElementById('nama').value = d.namaLengkap || '';
            if(document.getElementById('usia')) document.getElementById('usia').value = d.usia || '';
            if(document.getElementById('no_telp')) document.getElementById('no_telp').value = d.no_telp || '';
        }
    } catch(e){}
}

// --- AUDIO LOGIC ---
function setupAudioLogic() {
    const select = document.getElementById('bersediaScanBatuk');
    const div = document.getElementById('audioControls');
    const start = document.getElementById('startRecord');
    const stop = document.getElementById('stopRecord');
    const status = document.getElementById('recordingStatus');
    const preview = document.getElementById('audioPreview');
    const upload = document.getElementById('uploadBatuk');
    let mediaRecorder; let chunks = [];

    if(!select) return;

    select.addEventListener('change', () => { div.style.display = select.value === 'Ya' ? 'block' : 'none'; });

    start.onclick = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            let options = { mimeType: 'audio/webm' };
            if (MediaRecorder.isTypeSupported('audio/mp4')) options = { mimeType: 'audio/mp4' };
            else if (MediaRecorder.isTypeSupported('audio/ogg')) options = { mimeType: 'audio/ogg' };

            mediaRecorder = new MediaRecorder(stream, options);
            chunks = [];
            
            mediaRecorder.ondataavailable = e => { if(e.data.size > 0) chunks.push(e.data); };
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
                let ext = mediaRecorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
                const file = new File([blob], `rekaman_batuk.${ext}`, { type: mediaRecorder.mimeType });
                
                const dt = new DataTransfer(); dt.items.add(file); upload.files = dt.files;
                preview.src = URL.createObjectURL(blob); preview.style.display = 'block'; preview.load();
                status.textContent = 'Selesai. Siap dikirim.'; start.disabled = false; stop.disabled = true;
                stream.getTracks().forEach(t => t.stop());
            };

            mediaRecorder.start();
            status.textContent = 'Merekam...'; start.disabled = true; stop.disabled = false; preview.style.display = 'none';
            setTimeout(() => { if(mediaRecorder.state === 'recording') mediaRecorder.stop(); }, 5000);
        } catch(e) { customAlert('Gagal akses mikrofon. Pastikan izin diberikan.', 'Error Mic'); }
    };
    stop.onclick = () => { if(mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop(); };
}

// --- CUSTOM DROPDOWN ---
function initCustomDropdowns() {
    document.querySelectorAll('.question-item select').forEach(select => {
        select.style.display = 'none';
        const wrapper = document.createElement('div'); wrapper.className = 'custom-select-wrapper';
        const trigger = document.createElement('div'); trigger.className = 'custom-select-trigger';
        
        const selectedOpt = select.options[select.selectedIndex];
        trigger.textContent = (!selectedOpt || selectedOpt.value === "") ? '-- Pilih --' : selectedOpt.text;
        
        const options = document.createElement('div'); options.className = 'custom-options';
        
        Array.from(select.options).forEach(opt => {
            if (opt.value === "") return; 
            const span = document.createElement('span'); span.className = 'custom-option';
            span.dataset.value = opt.value; span.textContent = opt.text;
            
            span.onclick = () => {
                trigger.textContent = span.textContent; select.value = span.dataset.value;
                trigger.classList.add('active-selection'); trigger.classList.remove('error');
                const msg = wrapper.parentNode.querySelector('.error-msg'); if(msg) msg.remove();
                
                wrapper.classList.remove('open'); select.dispatchEvent(new Event('change'));
            };
            options.appendChild(span);
        });
        
        wrapper.append(trigger, options);
        select.parentNode.insertBefore(wrapper, select);
        
        trigger.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-select-wrapper').forEach(w => w!==wrapper && w.classList.remove('open'));
            wrapper.classList.toggle('open');
        };
    });
    
    document.addEventListener('click', (e) => {
        if(!e.target.closest('.custom-select-wrapper')) 
            document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
    });
}