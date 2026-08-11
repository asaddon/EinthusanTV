# Use the official Node.js image as the base image
FROM node:alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy all source code to the working directory
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Command to run the Node.js application
ENTRYPOINT ["node", "server.js"]