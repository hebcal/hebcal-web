FROM node:lts-bullseye as base

# Create a non-root user
RUN useradd -ms /bin/bash appuser

# Install sqlite3
RUN apt-get update && apt-get install -y sqlite3

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the application code
COPY . .

# Create hebcal-dot-com.ini file
RUN mkdir -p /etc && touch /etc/hebcal-dot-com.ini

# Install additional dependencies
RUN npm install @hebcal/geo-sqlite

# Download and make databases
RUN ./node_modules/.bin/download-and-make-dbs

# Create a directory for logs
RUN mkdir -p /var/log/hebcal/
# Grant write permissions to the non-root user
RUN chown -R appuser:appuser /var/log/hebcal

# Set the user
USER appuser

# Expose the port (if applicable)
EXPOSE 8080

# Start the application
CMD ["node", "src/app-www.js"]
