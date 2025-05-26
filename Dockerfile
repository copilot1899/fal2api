# 构建阶段
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 生产阶段
FROM node:18-alpine

# 安装 tini
RUN apk add --no-cache tini

# 创建非 root 用户
RUN addgroup -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nodejs

# 设置工作目录
WORKDIR /app

# 从构建阶段复制文件
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/src ./src

# 创建日志目录并设置权限
RUN mkdir -p logs && chown -R nodejs:nodejs logs

# 切换到非 root 用户
USER nodejs

# 设置环境变量
ENV NODE_ENV=production \
    PORT=3001 \
    DEBUG=false

# 暴露端口
EXPOSE 3001

# 使用 tini 作为 init 进程
ENTRYPOINT ["/sbin/tini", "--"]

# 启动命令
CMD ["node", "src/app.js"]

# 健康检查
HEALTHCHECK --interval=60s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/v1/models || exit 1
