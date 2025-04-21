FROM node:20-slim AS builder

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json (如果存在)
COPY package*.json ./

# 安装依赖
RUN npm install --omit=dev

# 从构建阶段复制到最终镜像
FROM node:20-slim

# 设置工作目录
WORKDIR /app

# 从构建阶段复制依赖
COPY --from=builder /app/node_modules ./node_modules

# 复制应用代码
COPY server.js .
COPY package.json .

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3001
ENV FAL_KEY=""
ENV API_KEY=""
ENV HTTP_PROXY=""
ENV HTTPS_PROXY=""

# 暴露端口 (默认3001，但可以通过环境变量覆盖)
EXPOSE ${PORT}

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); const options = { hostname: 'localhost', port: process.env.PORT || 3001, path: '/v1/models', timeout: 2000 }; const req = http.request(options, (res) => { process.exit(res.statusCode >= 200 && res.statusCode < 400 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.end();"

# 启动命令
CMD ["node", "server.js"]
