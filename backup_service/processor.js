const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const util = require("util");
const { processCertificateData } = require("./certificateProcessor");
const logger = require("./utils/logger");

const gunzip = util.promisify(zlib.gunzip);

const STI_ERROR_FILE_PATH = process.env.STI_ERROR_FILE_PATH || "./logs";
const PROCESSED_LOG_FILE = path.join(STI_ERROR_FILE_PATH, "processed_file.log");

const processedFiles = new Set();

/**
 * Load processed file names from processed_file.log into processedFiles set.
 */
function loadProcessedFiles() {
    try {
        if (fs.existsSync(PROCESSED_LOG_FILE)) {
            const data = fs.readFileSync(PROCESSED_LOG_FILE, "utf-8");
            data.split("\n").forEach((line) => {
                const parts = line.split(" - ");
                if (parts.length === 2) {
                    processedFiles.add(parts[1].trim());
                }
            });
        }
    } catch (err) {
        logger("error", "Processor", `Error loading processed files: ${err.message}`);
    }
}

/**
 * Append the processed file name with timestamp to processed_file.log.
 */
function logProcessedFile(fileName) {
    const timestamp = new Date().toISOString();
    const logLine = `${timestamp} - ${fileName}\n`;
    fs.appendFile(PROCESSED_LOG_FILE, logLine, (err) => {
        if (err) {
            logger("error", "Processor", `Error writing to processed_file.log: ${err.message}`);
        }
    });
}

/**
 * Decompress a .gz file and parse its content.
 * Assumes each line of the decompressed file is a separate JSON record.
 */
async function decompressAndParseFile(filePath) {
    try {
        const compressedData = await fs.promises.readFile(filePath);
        const buffer = await gunzip(compressedData);
        const content = buffer.toString("utf-8");
        const lines = content.split("\n").filter(Boolean);
        return lines.map((line) => JSON.parse(line));
    } catch (err) {
        logger("error", "Processor", `Error decompressing/parsing file ${filePath}: ${err.message}`);
        return [];
    }
}

/**
 * Scan STI_ERROR_FILE_PATH for new .gz (or .tar.gz) files, process them, and log the processed files.
 */
async function processLogFiles() {
    loadProcessedFiles();
    try {
        const files = await fs.promises.readdir(STI_ERROR_FILE_PATH);
        for (const file of files) {
            if ((file.endsWith(".gz") || file.endsWith(".tar.gz")) && !processedFiles.has(file)) {
                const filePath = path.join(STI_ERROR_FILE_PATH, file);
                logger("info", "Processor", `Found unprocessed file: ${file}`);

                const records = await decompressAndParseFile(filePath);

                for (const record of records) {
                    record.uuid = record.uuid || require("crypto").randomUUID();
                    try {
                        await processCertificateData(record);
                    } catch (err) {
                        logger("error", "Processor", `Error processing record from ${file}: ${err.message}`);
                    }
                }

                processedFiles.add(file);
                logProcessedFile(file);

                // Optionally, move the processed file to an archive folder here.
            }
        }
    } catch (err) {
        logger("error", "Processor", `Error scanning directory ${STI_ERROR_FILE_PATH}: ${err.message}`);
    }
}

module.exports = { processLogFiles };
