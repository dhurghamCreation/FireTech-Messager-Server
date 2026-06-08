# Use the official lightweight Node image
FROM node:lts-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package config files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your server code
COPY . .

# Expose Hugging Face's mandatory port
EXPOSE 7860

# Command to start your Express server
CMD ["node", "server.js"]