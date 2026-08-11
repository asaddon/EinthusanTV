# Use the official Node.js image as the base image
FROM node:alpine

# Set the working directory in the container
WORKDIR /app

# Create a non-root user as required by Hugging Face Spaces (UID 1000)
RUN adduser -D -u 1000 appuser

# Copy package.json and package-lock.json
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy all source code
COPY . .

# Change ownership of the app directory to the new user
RUN chown -R appuser:appuser /app

# Switch to the non-root user
USER appuser

# Expose port 7860 (Hugging Face Spaces default port)
EXPOSE 7860

# Command to run the Node.js application
ENTRYPOINT ["node", "server.js"]