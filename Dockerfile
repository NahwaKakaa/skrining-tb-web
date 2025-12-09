# Gunakan base image Node + Python
FROM node:18-bullseye

# Install Python dan dependency dasar
RUN apt-get update && apt-get install -y python3 python3-pip

# Set direktori kerja
WORKDIR /app

# Copy file Node.js dependencies
COPY package*.json ./
RUN npm install

# Copy Python dependencies lalu install (paksa untuk menghindari PEP-668)
COPY requirements.txt ./
RUN pip3 install --break-system-packages -r requirements.txt

# Copy seluruh project
COPY . .

# Variabel environment PORT dari Railway
ENV PORT=3000
EXPOSE 3000

# Jalankan server
CMD ["npm", "start"]
