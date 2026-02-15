FROM node:22-alpine

WORKDIR /app

# 1. Instalar dependências (Agora vai instalar o Prisma 6)
COPY package*.json ./
RUN npm install

# 2. Copiar a pasta Prisma
COPY prisma ./prisma/

# 3. Gerar o Cliente (Vai funcionar porque Prisma 6 aceita a URL no schema)
RUN npx prisma generate

# 4. Copiar o resto do código
COPY . .

# 5. Compilar
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
