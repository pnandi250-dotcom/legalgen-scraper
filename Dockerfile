# Use the official Microsoft Playwright container image
FROM mcr.microsoft.com/playwright:v1.34.0-jammy 

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8080
CMD ["node", "server.js"]