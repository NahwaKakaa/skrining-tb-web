// public/script.js (FINAL VERSION: Fixed Help Button & All Features)

const USER_ID_KEY = "currentUserId";
const USER_NAME_KEY = "currentUserName";

document.addEventListener("DOMContentLoaded", () => {
  updateAuthButtons();
  setupAuthListeners();
  setupAudioLogic();
  setupFormSubmit();
  initCustomDropdowns();

  // Panggil fungsi setup modal bantuan (Tanda Tanya)
  setupInfoModal();

  const userId = localStorage.getItem(USER_ID_KEY);
  if (userId) fillSkriningForm(userId);
});

// --- FUNGSI MODAL BANTUAN (TANDA TANYA) ---
function setupInfoModal() {
  const helpBtn = document.getElementById("helpButton");
  const infoModal = document.getElementById("infoModal");
  // Seleksi tombol close khusus untuk modal info (class .close-info-button)
  // Jika di HTML menggunakan class biasa .close-button, sesuaikan selectornya
  const closeBtn =
    document.querySelector("#infoModal .close-info-button") ||
    document.querySelector("#infoModal .close-button");

  if (helpBtn && infoModal) {
    // Buka modal saat tombol ? diklik
    helpBtn.addEventListener("click", (e) => {
      e.preventDefault(); // Mencegah perilaku default
      infoModal.style.display = "block";
    });

    // Tutup modal saat tombol X diklik
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        infoModal.style.display = "none";
      });
    }

    // Tutup modal saat klik di luar area konten (Overlay)
    // Kita tambahkan listener khusus ke window untuk menangani semua penutupan modal
    window.addEventListener("click", (event) => {
      if (event.target === infoModal) {
        infoModal.style.display = "none";
      }
      // Handle modal lain juga di sini agar tidak bentrok
      const authModal = document.getElementById("authModal");
      const msgModal = document.getElementById("messageAlertModal");

      if (event.target === authModal) closeAuthModal();
      if (event.target === msgModal) msgModal.style.display = "none";
    });
  }
}

// --- CUSTOM ALERT FUNCTION ---
function customAlert(message, title = "Informasi") {
  const modal = document.getElementById("messageAlertModal");
  const titleEl = document.getElementById("alertTitle");
  const msgEl = document.getElementById("alertMessage");
  const closeBtn = document.getElementById("alertCloseButton");

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;

  if (modal) {
    modal.style.display = "block";
    if (closeBtn) {
      closeBtn.onclick = () => {
        modal.style.display = "none";
      };
    }
  } else {
    // Fallback jika modal belum siap
    alert(message);
  }
}

// --- UTILITY & UI ---
function updateAuthButtons() {
  const userId = localStorage.getItem(USER_ID_KEY);
  const authContainer = document.getElementById("authContainer");
  const namaInput = document.getElementById("nama");
  const usiaInput = document.getElementById("usia");
  const telpInput = document.getElementById("no_telp");

  if (userId && authContainer) {
    authContainer.innerHTML = `
            <span style="font-weight: 500; margin-right:10px;">Halo, ${localStorage.getItem(
              USER_NAME_KEY
            )}!</span>
            <button id="logoutButton" class="auth-button" style="border-color:#e74c3c; color:#e74c3c;">Logout</button>
        `;
    document
      .getElementById("logoutButton")
      .addEventListener("click", handleLogout);

    const histLink = document.getElementById("historyLink");
    const profLink = document.getElementById("profileLink");
    if (histLink) histLink.style.display = "inline-block";
    if (profLink) profLink.style.display = "inline-block";

    if (namaInput) namaInput.readOnly = true;
    if (usiaInput) usiaInput.readOnly = true;
    if (telpInput) telpInput.readOnly = true;
  } else if (authContainer) {
    authContainer.innerHTML = `
            <button id="loginButton" class="auth-button">Login</button>
            <button id="registerButton" class="auth-button">Daftar</button>
        `;
    document
      .getElementById("loginButton")
      .addEventListener("click", () => showAuthModal("login"));
    document
      .getElementById("registerButton")
      .addEventListener("click", () => showAuthModal("register"));

    const histLink = document.getElementById("historyLink");
    const profLink = document.getElementById("profileLink");
    if (histLink) histLink.style.display = "none";
    if (profLink) profLink.style.display = "none";

    if (namaInput) namaInput.readOnly = false;
    if (usiaInput) usiaInput.readOnly = false;
    if (telpInput) telpInput.readOnly = false;
  }
}

async function fillSkriningForm(userId) {
  try {
    const response = await fetch(`/api/profile/${userId}`);
    const result = await response.json();
    if (result.status === "sukses" && result.data) {
      const d = result.data;
      if (document.getElementById("nama"))
        document.getElementById("nama").value = d.namaLengkap || "";
      if (document.getElementById("usia"))
        document.getElementById("usia").value = d.usia || "";
      if (document.getElementById("no_telp"))
        document.getElementById("no_telp").value = d.no_telp || "";
    }
  } catch (e) {
    console.error(e);
  }
}

function showAuthModal(mode) {
  const modal = document.getElementById("authModal");
  const loginForm = document.getElementById("loginForm");
  const regForm = document.getElementById("registerForm");
  const title = document.getElementById("modalTitle");

  if (mode === "login") {
    loginForm.style.display = "block";
    regForm.style.display = "none";
    title.textContent = "Login Akun";
  } else {
    loginForm.style.display = "none";
    regForm.style.display = "block";
    title.textContent = "Daftar Akun Baru";
  }
  modal.style.display = "block";
}

function closeAuthModal() {
  document.getElementById("authModal").style.display = "none";
}

function handleLogout() {
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USER_NAME_KEY);
  updateAuthButtons();

  // Reset form fields
  if (document.getElementById("nama")) {
    document.getElementById("nama").readOnly = false;
    document.getElementById("nama").value = "";
  }
  if (document.getElementById("usia")) {
    document.getElementById("usia").readOnly = false;
    document.getElementById("usia").value = "";
  }
  if (document.getElementById("no_telp")) {
    document.getElementById("no_telp").readOnly = false;
    document.getElementById("no_telp").value = "";
  }

  customAlert("Anda telah logout dari sistem.", "Sesi Berakhir");
}

// --- HANDLERS ---
async function attemptLogin(username, password, endpoint, role) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (response.ok) {
      const result = await response.json();
      if (role === "admin") {
        window.location.href = "/admin?password=admin123";
      } else {
        localStorage.setItem(USER_ID_KEY, result.userId);
        localStorage.setItem(USER_NAME_KEY, result.nama);
        updateAuthButtons();
        closeAuthModal();
        fillSkriningForm(result.userId);
        customAlert(`Selamat datang, ${result.nama}!`, "Login Berhasil");
      }
      return true;
    }
  } catch (e) {}
  return false;
}

async function handleLoginSubmit(username, password) {
  if (await attemptLogin(username, password, "/api/login", "user")) return;
  if (await attemptLogin(username, password, "/api/admin/login", "admin"))
    return;
  customAlert("Username atau password salah.", "Login Gagal");
}

async function handleRegisterSubmit(username, password, nama, telp) {
  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      namaLengkap: nama,
      no_telp: telp,
    }),
  });
  const result = await res.json();

  if (result.status === "sukses") {
    closeAuthModal();
    customAlert(result.message, "Registrasi Berhasil");
    setTimeout(() => showAuthModal("login"), 1500);
  } else {
    customAlert(result.message, "Gagal");
  }
}

// --- LISTENERS ---
function setupAuthListeners() {
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.onsubmit = (e) => {
      e.preventDefault();
      handleLoginSubmit(e.target.username.value, e.target.password.value);
    };
  }

  const regForm = document.getElementById("registerForm");
  if (regForm) {
    regForm.onsubmit = (e) => {
      e.preventDefault();
      handleRegisterSubmit(
        e.target.reg_username.value,
        e.target.reg_password.value,
        e.target.reg_namaLengkap.value,
        e.target.reg_no_telp.value
      );
    };
  }

  const closeAuth = document.querySelector("#authModal .close-button");
  if (closeAuth) closeAuth.onclick = closeAuthModal;
}

function setupFormSubmit() {
  const skriningForm = document.getElementById("skriningForm");
  if (!skriningForm) return;

  skriningForm.onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    const rawData = Object.fromEntries(new FormData(e.target).entries());

    for (const key in rawData)
      if (key !== "uploadBatuk") formData.append(key, rawData[key]);

    const uid = localStorage.getItem(USER_ID_KEY);
    if (uid) formData.append("currentUserId", uid);

    const fileInput = document.getElementById("uploadBatuk");
    if (fileInput && fileInput.files[0])
      formData.append("uploadBatuk", fileInput.files[0]);

    try {
      const res = await fetch("/api/skrining", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(res.statusText);
      const result = await res.json();

      displayResult(result);
    } catch (err) {
      customAlert("Gagal memproses data. Coba lagi.", "Error Server");
    }
  };
}

function displayResult(result) {
  const div = document.getElementById("hasilSkrining");
  let color =
    result.pitaLila === "Merah"
      ? "#e74c3c"
      : result.pitaLila === "Kuning"
      ? "#f1c40f"
      : "#2ecc71";

  div.innerHTML = `
        <div style="background:white; padding:30px; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.1); text-align:center; margin-top:30px; animation:slideUp 0.5s;">
            <h2 style="color:${color}; border-bottom:2px solid #eee; padding-bottom:15px;">Hasil: ${result.pitaLila}</h2>
            <p style="font-size:1.1em; margin:20px 0;">${result.rekomendasi}</p>
            <p style="color:#7f8c8d; font-size:0.9em;">⚠️ Bukan diagnosis medis.</p>
        </div>
    `;
  div.scrollIntoView({ behavior: "smooth" });
}

function setupAudioLogic() {
  const bersediaSelect = document.getElementById("bersediaScanBatuk");
  const audioControlsDiv = document.getElementById("audioControls");
  const startRecordButton = document.getElementById("startRecord");
  const stopRecordButton = document.getElementById("stopRecord");
  const statusDiv = document.getElementById("recordingStatus");
  const audioPreview = document.getElementById("audioPreview");
  const uploadInput = document.getElementById("uploadBatuk");
  let mediaRecorder;
  let audioChunks = [];

  if (!bersediaSelect) return;

  // Custom dropdown trigger listener is handled inside initCustomDropdowns via manual dispatchEvent
  bersediaSelect.addEventListener("change", () => {
    audioControlsDiv.style.display =
      bersediaSelect.value === "Ya" ? "block" : "none";
  });
  // Initial state
  audioControlsDiv.style.display =
    bersediaSelect.value === "Ya" ? "block" : "none";

  startRecordButton.addEventListener("click", () => {
    if (uploadInput) uploadInput.disabled = true;
  });
  stopRecordButton.addEventListener("click", () => {
    if (uploadInput) uploadInput.disabled = false;
  });

  startRecordButton.addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        // Buat file dummy untuk dikirim via form
        const audioFile = new File([audioBlob], "rekaman_batuk.wav", {
          type: "audio/wav",
        });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(audioFile);
        if (uploadInput) uploadInput.files = dataTransfer.files;

        const audioUrl = URL.createObjectURL(audioBlob);
        if (audioPreview) {
          audioPreview.src = audioUrl;
          audioPreview.style.display = "block";
        }
        if (statusDiv) statusDiv.textContent = "Rekaman selesai. File siap.";

        startRecordButton.disabled = false;
        stopRecordButton.disabled = true;
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      if (statusDiv) statusDiv.textContent = "Merekam...";
      startRecordButton.disabled = true;
      stopRecordButton.disabled = false;
      if (audioPreview) audioPreview.style.display = "none";

      setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, 5000);
    } catch (err) {
      customAlert(
        "Gagal mengakses mikrofon. Pastikan Anda memberikan izin.",
        "Error Mic"
      );
      startRecordButton.disabled = false;
      stopRecordButton.disabled = true;
      if (uploadInput) uploadInput.disabled = false;
    }
  });

  stopRecordButton.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  });
}

// Custom Dropdown Logic
function initCustomDropdowns() {
  document.querySelectorAll(".question-item select").forEach((select) => {
    select.style.display = "none";
    const wrapper = document.createElement("div");
    wrapper.className = "custom-select-wrapper";
    const trigger = document.createElement("div");
    trigger.className = "custom-select-trigger";

    // Initial text
    trigger.textContent = select.options[select.selectedIndex]
      ? select.options[select.selectedIndex].text
      : "Pilih";

    const options = document.createElement("div");
    options.className = "custom-options";

    Array.from(select.options).forEach((opt) => {
      const span = document.createElement("span");
      span.className = "custom-option";
      span.dataset.value = opt.value;
      span.textContent = opt.text;
      if (opt.selected) span.classList.add("selected");

      span.onclick = function () {
        trigger.textContent = this.textContent;
        select.value = this.dataset.value;

        // Update visual selected state
        options
          .querySelectorAll(".custom-option")
          .forEach((el) => el.classList.remove("selected"));
        this.classList.add("selected");

        // Trigger change event manually so other listeners (like audio) react
        select.dispatchEvent(new Event("change"));
        wrapper.classList.remove("open");
      };
      options.appendChild(span);
    });

    wrapper.append(trigger, options);
    select.parentNode.insertBefore(wrapper, select);

    trigger.onclick = (e) => {
      document.querySelectorAll(".custom-select-wrapper").forEach((w) => {
        if (w !== wrapper) w.classList.remove("open");
      });
      wrapper.classList.toggle("open");
      e.stopPropagation();
    };
  });

  document.addEventListener("click", () => {
    document
      .querySelectorAll(".custom-select-wrapper")
      .forEach((w) => w.classList.remove("open"));
  });
}
