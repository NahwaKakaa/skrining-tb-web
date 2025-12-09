FROM node:18-bullseye

# Install Python + pip
RUN apt-get update && apt-get install -y python3 python3-pip

# Set working directory
WORKDIR /app

# Copy Node.js dependencies
COPY package*.json ./
RUN npm install

# Copy AI model and Python dependencies
COPY requirements.txt ./
RUN pip3 install --break-system-packages -r requirements.txt

# Copy the rest of the app
COPY . .

# Expose dynamic port
ENV PORT=3000
EXPOSE 3000

# Start server
CMD ["npm", "start"]
