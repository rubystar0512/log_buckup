require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const crypto = require("crypto");
const logger = require("./utils/logger");
const sequelize = require("./models/index");
const { processCertificateData, sendEmail } = require("./certificateProcessor");
const { Sequelize, Op } = require("sequelize");
const path = require("path");
const AdminAuth = require("./models/AdminAuth");
const jwt = require("jsonwebtoken");
const moment = require("moment");

const stilogDB = new Sequelize(process.env.STILOG_DATABASE_URL, {
  logging: false,
  dialectOptions: {},
});

const shakenDB = new Sequelize(process.env.SHAKEN_DATABASE_URL, {
  logging: false,
  dialectOptions: {},
});

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(bodyParser.json({ limit: "50mb", extended: true }));

app.use(express.static(path.join(__dirname, "public")));

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, "log_event");
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: "Invalid token" });
  }
};

app.post("/api/notifications/opt-out", async (req, res) => {
  const { email, company, subject, content } = req.body;

  const EmailPreference = require("./models/EmailPreference");
  const OptOutCompany = require("./models/OptOutCompany");

  try {
    if (email) {
      await EmailPreference.upsert({
        uuid: crypto.randomUUID(),
        email,
        subject,
        content,
        opted_out: true,
      });
      logger("info", "Opt-out", `Email ${email} opted out of notifications`);
    }

    if (company) {
      await OptOutCompany.create({
        uuid: crypto.randomUUID(),
        company,
        timestamp: new Date(),
      });
      logger(
        "info",
        "Opt-out",
        `Company ${company} opted out of notifications`
      );
    }

    res.json({ success: true });
  } catch (error) {
    logger("error", "Opt-out", `Error processing opt-out: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
};

// Helper function for password verification
const verifyPassword = (password, hashedPassword) => {
  const [salt, hash] = hashedPassword.split(":");
  const verifyHash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex");
  return hash === verifyHash;
};

// Update login endpoint
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;

  const admin = await AdminAuth.findOne({ where: { email } });
  if (!admin) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials" });
  }

  if (!verifyPassword(password, admin.password)) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials" });
  }

  // Generate JWT token
  const token = jwt.sign(
    { id: admin.id, email: admin.email },
    process.env.JWT_SECRET,
    {
      expiresIn: "2h",
    }
  );

  res.json({
    success: true,
    message: "Login successful",
    token,
  });
});

// Update signup endpoint
app.post("/api/admin/signup", async (req, res) => {
  // const { email, password } = req.body;

  try {
    // Check if admin already exists
    const existingAdmin = await AdminAuth.findOne({
      where: { email: "admin@gmail.com" },
    });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "Admin with this email already exists",
      });
    }

    // Hash the password using our new method
    const hashedPassword = hashPassword("admin");

    // Create new admin
    const admin = await AdminAuth.create({
      uuid: crypto.randomUUID(),
      email: "admin@gmail.com",
      password: hashedPassword,
    });

    // Generate JWT token
    const token = jwt.sign(
      { id: admin.id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(201).json({
      success: true,
      message: "Admin account created successfully",
      token,
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create admin account",
    });
  }
});

// Get errors with filters
app.get("/api/admin/get_error", authenticateToken, async (req, res) => {
  try {
    const { start_time, end_time, unique } = req.query;
    let where = `WHERE "createdAt" BETWEEN :start AND :end`;
    if (unique === "true") where += ` AND is_repeated = false`;
    if (unique === "false") where += ` AND is_repeated = true`;

    const errors = await shakenDB.query(
      `SELECT "createdAt","identity_header","Identity_error","uuid" FROM sti_error ${where} ORDER BY "createdAt" DESC`,
      {
        replacements: {
          start: start_time || new Date(0),
          end: end_time || new Date(),
        },
        type: shakenDB.QueryTypes.SELECT,
      }
    );
    res.json({ success: true, data: errors });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Failed to fetch errors: ${error.message}`,
    });
  }
});

// Get specific error by UUID
app.get("/api/admin/error/:error_uuid", authenticateToken, async (req, res) => {
  try {
    const error = await shakenDB.query(
      `SELECT "certificate","uuid" FROM sti_error WHERE "uuid" = :uuid`,
      {
        replacements: {
          uuid: req.params.error_uuid,
        },
        type: shakenDB.QueryTypes.SELECT,
      }
    );
    if (!error) {
      return res.status(404).json({
        success: false,
        message: "Error not found",
      });
    }

    res.json({ success: true, data: error });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Failed to fetch error: ${error.message}`,
    });
  }
});

const isLogFromToday = (date) => {
  return moment(date).isSame(moment(), "day");
};
// Get email details for specific error
app.get(
  "/api/admin/error/:error_uuid/email",
  authenticateToken,
  async (req, res) => {
    try {
      const [error] = await shakenDB.query(
        `SELECT "Origination" FROM sti_error WHERE "uuid" = :uuid`,
        {
          replacements: {
            uuid: req.params.error_uuid,
          },
          type: shakenDB.QueryTypes.SELECT,
        }
      );
      if (!error) {
        return res.status(404).json({
          success: false,
          message: "Error not found",
        });
      }

      // Get recipient email from stilog database
      const [recipient] = await stilogDB.query(
        "SELECT DISTINCT email, first_name FROM sp WHERE status = :status AND company = :company AND email IS NOT NULL LIMIT 1",
        {
          replacements: {
            status: "Active",
            company: error.Origination,
          },
          type: stilogDB.QueryTypes.SELECT,
        }
      );

      let subject = "";
      let content = "";

      // Generate email content based on error type
      if (!error.cert_url_found) {
        subject = `Notification: Certificate Not Downloaded for OCN ${error.Origination}`;
        content = `Certificate URL could not be accessed for OCN ${error.Origination}`;
      } else if (error.Identity_error.includes("Signature validation failed")) {
        subject = `Notification: Invalid Identity SHAKEN for OCN ${error.Origination}`;
        content = `Hi ${recipient?.first_name || ""},

        This is a courtesy email to inform you that we have detected your OCN ${
          error.Origination
        } is generating an invalid identity header. The identity header in question is:

        ${error.identity_header}

        Error:
        🚨 ${error.Identity_error}

        As Peeringhub is a certified STIR/SHAKEN CA, we can generate a valid certificate for you to resolve this issue.

        Pricing:
        $75/month
        $450/year (Save $150)

        During your subscription, you can generate unlimited certificates and enjoy our free Certificate Repository service to host your certificate. You can also use Peeringhub's auto-renewal feature to prevent the risk of using an expired certificate on your calls.

        Getting started is simple! Just register at www.peeringhub.io, and you'll be able to use our automatic tool to generate your certificate in just a few clicks.

        If you need assistance, feel free to contact us at akwong@peeringhub.io, and we'll be happy to help!

        Best regards,
        Peeringhub Team`;
      } else if (isLogFromToday(error.not_after)) {
        subject = `Notification: Expired Certificate for OCN ${error.Origination}`;
        content = `Certificate has expired for OCN ${error.Origination}\nExpiry date: ${error.not_after}`;
      } else {
        subject = `Notification: Invalid Certificate for OCN ${error.Origination}`;
        content = `Invalid certificate detected for OCN ${error.Origination}\nError: ${error.Identity_error}`;
      }

      res.json({
        success: true,
        data: {
          to_email: recipient?.email || process.env.DEFAULT_NOTIFICATION_EMAIL,
          subject,
          content,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: `Failed to generate email details: ${error.message}`,
      });
    }
  }
);

// Send alert for specific error
app.post(
  "/api/admin/error/:error_uuid/send_alert",
  authenticateToken,
  async (req, res) => {
    try {
      //   const error = await Sti_Error.findOne({
      //     where: { uuid: req.params.error_uuid },
      //   });
      const error = await shakenDB.query(
        `SELECT "uuid","identity_header","cert_url_found" FROM sti_error WHERE "uuid" = :uuid`,
        {
          replacements: {
            uuid: req.params.error_uuid,
          },
          type: shakenDB.QueryTypes.SELECT,
        }
      );

      if (!error) {
        return res.status(404).json({
          success: false,
          message: "Error not found",
        });
      }

      // Reuse existing sendEmail function with the error data
      await sendEmail(
        {
          uuid: error.uuid,
          identity: error.identity_header,
          cert_url_found: error.cert_url_found,
        },
        error
      );
      res.json({
        success: true,
        message: "Alert sent successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: `Failed to send alert: ${error.message}`,
      });
    }
  }
);

const PORT = process.env.PORT || 3000;

app.get("*", (req, res) => {
  console.log("Catch-all route hit for path:", req.path);
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

sequelize.sync().then(() => {
  app.listen(PORT, () => {
    logger("info", "Server", `Server is running on port ${PORT}`);
  });
});

const logDir = process.env.SRC_LOG_PATH;

function parseShakenErrorBlock(block) {
  const lines = block.split("\n").filter((line) => line.trim());
  if (lines.length < 5) return null;

  const identityMatch = lines[0].match(/Identity: '(.+)'/);
  if (!identityMatch) return null;

  const errors = lines
    .slice(2)
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

function processShakenErrors(logContent, filename) {
  const blocks = logContent.split("==========\n==========\n");

  const errorRecords = blocks
    .map((block) => parseShakenErrorBlock(block))
    .filter((record) => record !== null);
  return errorRecords;
}

let processedFiles = new Set();

function scanAndProcessLogs() {
  const files = fs
    .readdirSync(logDir)
    .filter((file) =>
      file.match(/^\d{4}_\d{2}_\d{2}_shaken_verif_error\.log$/)
    );

  const newFiles = files.filter((file) => !processedFiles.has(file));

  for (const file of newFiles) {
    try {
      processedFiles.add(file);
      const logContent = fs.readFileSync(`${logDir}/${file}`, "utf8");
      const errors = processShakenErrors(logContent, file);
      try {
        const processedErrors = errors.map((logData) => ({
          ...logData,
          uuid: logData.uuid || crypto.randomUUID(),
        }));

        // Process in background with proper error handling
        Promise.all(
          processedErrors.map(async (logData) => {
            try {
              await processCertificateData(logData);
            } catch (error) {
              logger(
                "error",
                "ProcessingError",
                `Failed to process log ${logData.uuid}: ${error.message}`
              );
            }
          })
        ).catch((error) => {
          logger(
            "error",
            "BatchProcessingError",
            `Batch processing failed: ${error.message}`
          );
        });
      } catch (error) {
        logger("error", "ProcessingError", error.message);
      }
    } catch (error) {
      logger(
        "error",
        "Error processing log file",
        `Failed to process ${file}: ${error.message}`
      );
    }
  }
}

scanAndProcessLogs();
setInterval(scanAndProcessLogs, 5 * 60 * 1000);

const { processLogFiles } = require("./processor");

processLogFiles();
setInterval(processLogFiles, 5 * 60 * 1000);
