FROM oven/bun:1-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

RUN bunx prisma generate

EXPOSE 4001

CMD ["sh", "-c", "bunx prisma migrate deploy && bun run src/main.ts"]
