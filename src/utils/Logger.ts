export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
}

export class Logger {
  private readonly appName: string;
  private readonly timestamp: boolean;

  constructor(appName = 'octocode-mcp', timestamp = true) {
    this.appName = appName;
    this.timestamp = timestamp;
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    ...args: unknown[]
  ): string {
    const timestamp = this.timestamp ? `[${new Date().toISOString()}] ` : '';
    const prefix = `${timestamp}[${this.appName}] [${level}]`;

    const formattedArgs =
      args.length > 0
        ? ' ' +
          args
            .map(arg => {
              if (arg instanceof Error) {
                return `${arg.message}\n${arg.stack}`;
              }
              return typeof arg === 'object'
                ? JSON.stringify(arg, null, 2)
                : String(arg);
            })
            .join(' ')
        : '';

    return `${prefix} ${message}${formattedArgs}`;
  }

  error(message: string, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.error(this.formatMessage(LogLevel.ERROR, message, ...args));
  }

  warn(message: string, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn(this.formatMessage(LogLevel.WARN, message, ...args));
  }

  info(message: string, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.log(this.formatMessage(LogLevel.INFO, message, ...args));
  }

  debug(message: string, ...args: unknown[]): void {
    if (
      process.env.DEBUG === 'true' ||
      process.env.NODE_ENV === 'development'
    ) {
      // eslint-disable-next-line no-console
      console.log(this.formatMessage(LogLevel.DEBUG, message, ...args));
    }
  }
}

// Singleton instance
export const logger = new Logger();
