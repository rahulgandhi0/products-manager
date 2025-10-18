type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'PERF' | 'HTTP';

interface LogMetadata {
  [key: string]: unknown;
}

interface LogContext {
  component: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: LogMetadata;
  stack?: string;
}

class Logger {
  private component: string;
  private static isDev = process.env.NODE_ENV !== 'production';

  constructor(component: string) {
    this.component = component;
  }

  private formatLog(level: LogLevel, message: string, metadata?: LogMetadata): LogContext {
    return {
      component: this.component,
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
    };
  }

  private log(level: LogLevel, message: string, metadata?: LogMetadata): void {
    const logContext = this.formatLog(level, message, metadata);
    const prefix = `[${logContext.timestamp}] [${level.padEnd(5)}] [${this.component}]`;

    switch (level) {
      case 'ERROR':
        console.error(prefix, message, metadata || '');
        break;
      case 'WARN':
        console.warn(prefix, message, metadata || '');
        break;
      case 'DEBUG':
        if (Logger.isDev) {
          console.debug(prefix, message, metadata || '');
        }
        break;
      default:
        console.log(prefix, message, metadata || '');
    }
  }

  info(message: string, metadata?: LogMetadata): void {
    this.log('INFO', message, metadata);
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.log('WARN', message, metadata);
  }

  error(message: string, error?: Error | unknown, metadata?: LogMetadata): void {
    const errorMetadata: LogMetadata = {
      ...metadata,
    };

    if (error instanceof Error) {
      errorMetadata.error = {
        name: error.name,
        message: error.message,
        stack: Logger.isDev ? error.stack : undefined,
      };
    } else if (error) {
      errorMetadata.error = error;
    }

    this.log('ERROR', message, errorMetadata);
  }

  debug(message: string, metadata?: LogMetadata): void {
    this.log('DEBUG', message, metadata);
  }

  http(method: string, path: string, statusCode: number, durationMs: number): void {
    this.log('HTTP', `${method} ${path} ${statusCode} ${durationMs}ms`);
  }

  perf(operation: string, durationMs: number, metadata?: LogMetadata): void {
    const perfMetadata = { ...metadata, durationMs };
    this.log('PERF', `${operation} completed in ${durationMs}ms`, perfMetadata);
  }

  async measure<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: LogMetadata
  ): Promise<T> {
    const startTime = Date.now();
    this.debug(`Starting ${operation}`, metadata);

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      this.perf(operation, duration, metadata);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.error(`${operation} failed after ${duration}ms`, error, metadata);
      throw error;
    }
  }

  context(additionalContext: Record<string, unknown>): Logger {
    const contextLogger = new Logger(`${this.component}:${additionalContext.context || 'unknown'}`);
    return contextLogger;
  }
}

export default Logger;

