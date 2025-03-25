const winston = require("winston");
const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf } = format;
const moment = require("moment");
const fs = require("fs");
const path = require("path");
require("winston-daily-rotate-file");

const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const baseLogger = createLogger({
  format: combine(
    winston.format.colorize(),
    winston.format.simple(),
    timestamp(),
    printf(
      ({ level, message, timestamp }) =>
        `${moment(timestamp).format("YYYY-MM-DD HH:mm:ss")} ${message}`
    )
  ),
  transports: [
    new transports.Console({
      handleExceptions: true,
      level: "debug",
      json: true,
      prettyPrint: true,
    }),
    new transports.DailyRotateFile({
      filename: path.join(logsDir, "%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      json: true,
      maxFiles: "30d",
    }),
  ],
  exitOnError: false,
});

const logger = (level, comment, message) => {
  baseLogger[level](`[ ${comment} ]: ${message}`);
};

module.exports = logger;
