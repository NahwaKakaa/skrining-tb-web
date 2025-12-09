# Use Node + Python base image
FROM node:18-bullseye

# Install Python environment
RUN apt-get update && apt-get install -y python3 python3-pip

# Set working directory
WORKDIR /app

# Copy Node.js deps
COPY package*.json ./
RUN npm install

# Copy Python deps and install
COPY requirements.txt ./
RUN python3 -m pip install --upgrade pip
RUN pip3 install -r requirements.txt

# Copy all project files
COPY . .

# Set environment
ENV PORT=3000
EXPOSE 3000

# Start server
CMD ["npm", "start"]
