FROM node:22-alpine

# Set working directory
WORKDIR /app

# Install dependencies needed for build
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Create uploads directory structure
RUN mkdir -p uploads/temp && chmod -R 777 uploads

# Build TypeScript
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5050

# Expose the application port
EXPOSE 5050

# Start the application
CMD ["node", "dist/app.js"]