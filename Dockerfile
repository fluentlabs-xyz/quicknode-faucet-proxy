# Dockerfile

FROM oven/bun:1.1

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --production

# Copy source code (including prisma/)
COPY . .

# Optional: Generate Prisma client (makes "npx prisma migrate deploy" much faster)
RUN npx prisma generate

# Expose the port (change if your app uses another port)
EXPOSE 8080

# Run migrations and start app
CMD npx prisma migrate deploy && bun start
