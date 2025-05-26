import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 日志级别定义
const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

// 日志颜色（控制台输出用）
const LOG_COLORS = {
  ERROR: '\x1b[31m', // 红色
  WARN: '\x1b[33m',  // 黄色
  INFO: '\x1b[36m',  // 青色
  DEBUG: '\x1b[32m', // 绿色
  RESET: '\x1b[0m'   // 重置颜色
};

class Logger {
  constructor(options = {}) {
    this.options = {
      logToFile: options.logToFile !== undefined ? options.logToFile : true,
      logToConsole: options.logToConsole !== undefined ? options.logToConsole : true,
      logLevel: options.logLevel || LOG_LEVELS.INFO,
      logDir: options.logDir || path.join(__dirname, 'logs'),
      logFileName: options.logFileName || 'app.log',
      maxLogFileSize: options.maxLogFileSize || 10 * 1024 * 1024, // 默认10MB
      colorize: options.colorize !== undefined ? options.colorize : true
    };

    // 确保日志目录存在
    if (this.options.logToFile) {
      if (!fs.existsSync(this.options.logDir)) {
        fs.mkdirSync(this.options.logDir, { recursive: true });
      }
    }

    this.logFilePath = path.join(this.options.logDir, this.options.logFileName);
  }

  /**
   * 格式化日志消息
   * @param {string} level 日志级别
   * @param {string} message 日志消息
   * @param {Object} meta 元数据
   * @returns {string} 格式化后的日志消息
   */
  formatLogMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const { requestType = '-', ip = '-', duration = '-', ...restMeta } = meta;
    
    // 基本日志格式: [时间] [级别] [请求类型] [IP] [耗时ms] 消息 {其他元数据}
    let logMessage = `[${timestamp}] [${level}] [${requestType}] [${ip}] [${duration}ms] ${message}`;
    
    // 如果有其他元数据，添加到日志末尾
    if (Object.keys(restMeta).length > 0) {
      logMessage += ` ${JSON.stringify(restMeta)}`;
    }
    
    return logMessage;
  }

  /**
   * 写入日志到文件
   * @param {string} message 日志消息
   */
  writeToFile(message) {
    if (!this.options.logToFile) return;

    try {
      // 检查日志文件大小，如果超过最大大小，进行轮转
      if (fs.existsSync(this.logFilePath)) {
        const stats = fs.statSync(this.logFilePath);
        if (stats.size > this.options.maxLogFileSize) {
          const timestamp = new Date().toISOString().replace(/:/g, '-');
          const newFileName = `${this.options.logFileName}.${timestamp}`;
          fs.renameSync(
            this.logFilePath,
            path.join(this.options.logDir, newFileName)
          );
        }
      }

      // 追加日志到文件
      fs.appendFileSync(this.logFilePath, message + '\n');
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  /**
   * 输出日志到控制台
   * @param {string} level 日志级别
   * @param {string} message 日志消息
   */
  writeToConsole(level, message) {
    if (!this.options.logToConsole) return;

    if (this.options.colorize && LOG_COLORS[level]) {
      console.log(`${LOG_COLORS[level]}${message}${LOG_COLORS.RESET}`);
    } else {
      console.log(message);
    }
  }

  /**
   * 检查是否应该记录该级别的日志
   * @param {string} level 日志级别
   * @returns {boolean} 是否应该记录
   */
  shouldLog(level) {
    const levels = Object.values(LOG_LEVELS);
    const currentLevelIndex = levels.indexOf(this.options.logLevel);
    const targetLevelIndex = levels.indexOf(level);
    
    return targetLevelIndex <= currentLevelIndex;
  }

  /**
   * 记录日志
   * @param {string} level 日志级别
   * @param {string} message 日志消息
   * @param {Object} meta 元数据
   */
  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatLogMessage(level, message, meta);
    
    if (this.options.logToFile) {
      this.writeToFile(formattedMessage);
    }
    
    if (this.options.logToConsole) {
      this.writeToConsole(level, formattedMessage);
    }
  }

  /**
   * 记录错误日志
   * @param {string} message 日志消息
   * @param {Object} meta 元数据
   */
  error(message, meta = {}) {
    this.log(LOG_LEVELS.ERROR, message, meta);
  }

  /**
   * 记录警告日志
   * @param {string} message 日志消息
   * @param {Object} meta 元数据
   */
  warn(message, meta = {}) {
    this.log(LOG_LEVELS.WARN, message, meta);
  }

  /**
   * 记录信息日志
   * @param {string} message 日志消息
   * @param {Object} meta 元数据
   */
  info(message, meta = {}) {
    this.log(LOG_LEVELS.INFO, message, meta);
  }

  /**
   * 记录调试日志
   * @param {string} message 日志消息
   * @param {Object} meta 元数据
   */
  debug(message, meta = {}) {
    this.log(LOG_LEVELS.DEBUG, message, meta);
  }

  /**
   * 创建请求日志中间件
   * @returns {Function} Express中间件
   */
  requestLogger() {
    return (req, res, next) => {
      // 记录请求开始时间
      const startTime = Date.now();
      
      // 获取IP地址
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '-';
      
      // 请求类型
      const requestType = `${req.method} ${req.originalUrl}`;
      
      // 记录请求信息
      this.info(`Request started`, { 
        requestType, 
        ip, 
        headers: req.headers,
        body: req.method !== 'GET' ? req.body : undefined
      });
      
      // 在响应完成后记录响应信息
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        const level = res.statusCode >= 400 ? LOG_LEVELS.ERROR : LOG_LEVELS.INFO;
        
        this.log(level, `Request completed with status ${res.statusCode}`, {
          requestType,
          ip,
          duration,
          statusCode: res.statusCode
        });
      });
      
      next();
    };
  }
}

// 创建默认日志实例
const logger = new Logger();

export { logger, Logger, LOG_LEVELS };
