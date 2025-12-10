# Use Node + Python base image
FROM node:18-bullseye

# --- PERBAIKAN DI SINI ---
# Tambahkan 'ffmpeg' dan 'libsndfile1' agar librosa bisa baca audio
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy Node.js deps
COPY package*.json ./
RUN npm install

# Copy Python deps and install
COPY requirements.txt ./
# Pastikan pip terupdate
RUN python3 -m pip install --upgrade pip
# Gunakan --no-cache-dir agar image lebih ringan
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy all project files
COPY . .

# Set environment
ENV PORT=3000
EXPOSE 3000

# Start server
CMD ["node", "server.js"]