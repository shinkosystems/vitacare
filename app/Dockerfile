FROM node:20-alpine

WORKDIR /app

# Copia dependências e instala
COPY package*.json ./
RUN npm install --production --no-audit --no-fund

# Copia código da aplicação
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
