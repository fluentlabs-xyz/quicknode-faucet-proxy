FROM oven/bun:1.2.7

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production

COPY . .

EXPOSE 8080

CMD bun start
