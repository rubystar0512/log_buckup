const express = require("express");
const axios = require("axios");
const nodemailer = require("nodemailer");
const moment = require("moment");
const logger = require("./utils/logger");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(express.json());

// Email configuration
const transporter = nodemailer.createTransport({
  host: process.env.FROM_MAIL_IP,
  port: process.env.FROM_MAIL_PORT,
  auth: {
    user: process.env.FROM_EMAIL,
    pass: process.env.FROM_MAIL_PASSPORT,
  },
});

// Function to check if log is from today
const isLogFromToday = (date) => {
  return moment(date).isSame(moment(), "day");
};

// Function to send notification email
async function sendEmail(logData) {
  if (process.env.ENABLE_AUTO_EMAIL !== "true") return;

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: process.env.CC_EMAIL,
    subject: "New Certificate Alert",
    text: `New certificate detected:\nIdentity: ${logData.identity_header}\nExpiry: ${logData.not_after}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger("info", "Email", "Alert email sent successfully");
  } catch (error) {
    logger("error", "Email", `Failed to send email: ${error.message}`);
  }
}

// Function to send Mattermost notification
async function notifyMattermost(logData) {
  try {
    await axios.post(process.env.MATTERMOST_URL, {
      text: `New Certificate Alert:\nIdentity: ${logData.identity_header}\nExpiry: ${logData.not_after}`,
    });
    logger("info", "Mattermost", "Alert sent to Mattermost");
  } catch (error) {
    logger(
      "error",
      "Mattermost",
      `Failed to send Mattermost notification: ${error.message}`
    );
  }
}

// Replace Pool import with Sequelize models
const Certificate = require("./models/Certificate");
const EmailPreference = require("./models/EmailPreference");
const sequelize = require("./models/index");

// Function to process certificate data asynchronously
async function processCertificateData(logData) {
  try {
    logger(
      "info",
      "Receive",
      `Receive error log ${logData.identity_header}. Assign UUID ${logData.uuid}`
    );

    // Insert log into database using Sequelize
    const result = await Certificate.create(logData);

    // Check if the log is from today and process notifications
    if (isLogFromToday(logData.not_after)) {
      logger(
        "info",
        "Process",
        `UUID ${logData.uuid} is a new log for ${moment().format("YYYY-MM-DD")}`
      );

      // Send email notification
      if (process.env.ENABLE_AUTO_EMAIL === "true") {
        const mailOptions = {
          from: process.env.FROM_EMAIL,
          to: process.env.CC_EMAIL,
          subject: "New Certificate Alert",
          text: `New certificate detected:\nIdentity: ${logData.identity_header}\nExpiry: ${logData.not_after}`,
        };

        try {
          await transporter.sendMail(mailOptions);
          logger(
            "info",
            "Email",
            `Send Notification Email to ${process.env.CC_EMAIL} | subject: New Certificate Alert | Content: Identity ${logData.identity_header}`
          );

          // Log email event to database
          await EmailPreference.create({
            email: process.env.CC_EMAIL,
            notification_type: "certificate_alert",
            certificate_uuid: logData.uuid,
          });
          logger("info", "Database", "Insert email event to Postgres");
        } catch (error) {
          logger("error", "Email", `Failed to send email: ${error.message}`);
        }
      }

      // Send Mattermost notification
      try {
        await axios.post(process.env.MATTERMOST_URL, {
          text: `New Certificate Alert:\nIdentity: ${logData.identity_header}\nExpiry: ${logData.not_after}`,
        });
        logger("info", "Mattermost", "Push Notification to Mattermost");
      } catch (error) {
        logger(
          "error",
          "Mattermost",
          `Failed to send Mattermost notification: ${error.message}`
        );
      }
    } else {
      logger(
        "info",
        "Process",
        `UUID ${logData.uuid} is not a new log for ${moment().format(
          "YYYY-MM-DD"
        )}. Insert to DB and ignore.`
      );
    }

    return result;
  } catch (error) {
    logger(
      "error",
      "Processing",
      `Error processing certificate data: ${error.message}`
    );
    throw error;
  }
}

// Update the /api/logs endpoint to be non-blocking
app.post("/api/logs", async (req, res) => {
  const logData = req.body;

  try {
    // Generate UUID if not provided
    if (!logData.uuid) {
      logData.uuid = crypto.randomUUID();
    }

    // Immediately return the UUID
    res.json({
      success: true,
      uuid: logData.uuid,
      message: "Request accepted for processing",
    });

    // Process the data asynchronously
    processCertificateData(logData).catch((error) => {
      logger(
        "error",
        "Async Processing",
        `Failed to process certificate ${logData.uuid}: ${error.message}`
      );
    });
  } catch (error) {
    logger("error", "API", `Error accepting request: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update the opt-out endpoint
app.post("/api/notifications/opt-out", async (req, res) => {
  const { email } = req.body;

  try {
    await EmailPreference.upsert({
      email,
      opted_out: true,
    });
    logger("info", "Opt-out", `Email ${email} opted out of notifications`);
    res.json({ success: true });
  } catch (error) {
    logger("error", "Opt-out", `Error processing opt-out: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;

// Initialize database before starting server
sequelize.sync().then(() => {
  app.listen(PORT, () => {
    logger("info", "Server", `Server is running on port ${PORT}`);
  });
});
