const winston = require("winston");
const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf } = format;
const moment = require("moment");
require("winston-daily-rotate-file");

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
      filename: "logs/%DATE%.log",
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
