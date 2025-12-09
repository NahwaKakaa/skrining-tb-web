# Base image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Install Python and dependencies
RUN apt-get update && apt-get install -y python3 python3-pip
COPY requirements.txt .
RUN pip3 install -r requirements.txt

# Copy the entire project
COPY . .

# Expose port for Render (Render will inject PORT env)
EXPOSE 10000

# Start server
CMD ["node", "server.js"]
