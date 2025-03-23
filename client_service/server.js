const axios = require("axios");
const dotenv = require("dotenv");
const fs = require("fs");

const log = require("./utils/logger");

dotenv.config();

const serverUrl = process.env.SERVER_URL;
const logDir = process.env.SRC_LOG_PATH;

function parseShakenErrorBlock(block) {
  const lines = block.split("\n").filter((line) => line.trim());
  if (lines.length < 5) return null;

  const identityMatch = lines[0].match(/Identity: '(.+)'/);
  if (!identityMatch) return null;

  const errors = lines
    .slice(1)
    .filter((line) => line.startsWith("[ERR"))
    .map((line) => {
      const match = line.match(/\[ERR \d+\] (.+)/);
      return match ? match[1] : null;
    })
    .filter((err) => err !== null);

  if (errors.length !== 3) return null;

  return {
    identity: identityMatch[1],
    err0: errors[0],
    err1: errors[1],
    err2: errors[2],
  };
}

async function processShakenErrors(logContent, filename) {
  const blocks = logContent.split("==========\n==========\n");

  const errorRecords = blocks
    .map((block) => parseShakenErrorBlock(block))
    .filter((record) => record !== null);

  try {
    const response = await axios.post(`${serverUrl}/api/logs`, {
      errors: errorRecords,
      timestamp: new Date().toISOString(),
      filename: filename,
    });

    const logMessage = `Found error log ${filename}. Push to server. Receive UUID: ${response.data.uuid}`;
    log("info", "SHAKEN verification errors sent to backend", logMessage);
  } catch (error) {
    const errorMessage = `Failed to send SHAKEN errors from ${filename} to backend: ${error}`;
    log("error", "Failed to send SHAKEN errors to backend", errorMessage);
  }
}

async function scanAndProcessLogs() {
  const files = fs
    .readdirSync(logDir)
    .filter((file) =>
      file.match(/^\d{4}_\d{2}_\d{2}_shaken_verif_error\.log$/)
    );

  for (const file of files) {
    try {
      const logContent = fs.readFileSync(`${logDir}/${file}`, "utf8");
      await processShakenErrors(logContent, file);
    } catch (error) {
      log(
        "error",
        "Error processing log file",
        `Failed to process ${file}: ${error.message}`
      );
    }
  }
}

scanAndProcessLogs();

// setInterval(scanAndProcessLogs, 24 * 60 * 60 * 1000);
