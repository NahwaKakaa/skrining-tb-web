# 1. Gunakan image dasar yang sudah memiliki Python dan Node.js
FROM nikolaik/python-nodejs:python3.10-nodejs18

# 2. Update sistem dan instal library audio wajib (FFmpeg & libsndfile)
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 3. Buat folder kerja di dalam container
WORKDIR /app

# 4. Copy file requirements Python dulu agar cache efisien
COPY requirements.txt .

# 5. Instal library Python (gunakan versi CPU agar ringan)
RUN pip install --no-cache-dir -r requirements.txt

# 6. Copy file package.json Node.js
COPY package.json .

# 7. Instal library Node.js
RUN npm install

# 8. Copy seluruh sisa kode proyek ke dalam container
COPY . .

# 9. Buka port 3000 (sesuai server.js Anda)
EXPOSE 3000

# 10. Perintah untuk menyalakan server
CMD ["node", "server.js"]