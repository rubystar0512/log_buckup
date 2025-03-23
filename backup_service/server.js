const express = require("express");
const axios = require("axios");
const nodemailer = require("nodemailer");
const moment = require("moment");
const logger = require("./utils/logger");
const crypto = require("crypto");
const { exec } = require("child_process");
const util = require("util");
const fs = require("fs").promises;
const execPromise = util.promisify(exec);
require("dotenv").config();
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json({ limit: "50mb", extended: true }));

const transporter = nodemailer.createTransport({
  host: process.env.FROM_MAIL_IP,
  port: process.env.FROM_MAIL_PORT,
  auth: {
    user: process.env.FROM_EMAIL,
    pass: process.env.FROM_MAIL_PASSPORT,
  },
});

const isLogFromToday = (date) => {
  return moment(date).isSame(moment(), "day");
};

async function sendEmail(logData) {
  if (process.env.ENABLE_AUTO_EMAIL !== "true") return;

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: process.env.CC_EMAIL,
    subject: "New Certificate Alert",
    text: `New certificate detected:\nIdentity: ${logData.identity}\nExpiry: ${logData.not_after}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger("info", "Email", "Alert email sent successfully");
  } catch (error) {
    logger("error", "Email", `Failed to send email: ${error.message}`);
  }
}

async function notifyMattermost(logData) {
  try {
    await axios.post(process.env.MATTERMOST_URL, {
      text: `New Certificate Alert:\nIdentity: ${logData.identity}\nExpiry: ${logData.not_after}`,
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

const Sti_Error = require("./models/Sti_Error");
const EmailPreference = require("./models/EmailPreference");
const sequelize = require("./models/index");

async function processCertificateData(logData) {
  try {
    logger(
      "info",
      "Receive",
      `Receive error log ${logData.identity}. Assign UUID ${logData.uuid}`
    );

    const cert_url = extractCertUrl(logData.identity);
    let cert_url_found = false;
    let certificate = null;
    let clear_text_cert = null;
    if (cert_url) {
      try {
        const response = await axios.get(cert_url);
        certificate = response.data;
        cert_url_found = true;

        clear_text_cert = await parseCertificate(certificate);

        const certFields = extractCertificateFields(clear_text_cert);

        console.log(certFields);

        // // const result = await Sti_Error.create({
        // //   uuid: logData.uuid,
        // //   identity_header: logData.identity,
        // //   err1: logData.err1,
        // //   err2: logData.err2,
        // //   err3: logData.err3,
        // //   cert_url: cert_url,
        // //   cert_url_found: cert_url_found,
        // //   certificate: certificate,
        // //   clear_text_cert: clear_text_cert,
        // //   signature: certFields.signature,
        // //   ani: certFields.ani,
        // //   dnis: certFields.dnis,
        // //   CA: certFields.CA,
        // //   not_after: certFields.not_after,
        // //   not_before: certFields.not_before,
        // //   OCN: certFields.OCN,
        // //   Origination: certFields.Origination,
        // //   Country: certFields.Country,
        // //   Identity_error: certFields.Identity_error,
        // //   is_repeated: false,
        // // });

        // // const isRepeated = await checkIfRepeated(cert_url, logData.uuid);
        // // if (isRepeated) {
        // //   await result.update({ is_repeated: true });
        // // }

        // // if (isLogFromToday(certFields.not_after) && !isRepeated) {
        // //   await sendEmail(logData);
        // //   await notifyMattermost(logData);

        // //   if (process.env.ENABLE_AUTO_EMAIL === "true") {
        // //     await EmailPreference.create({
        // //       email: process.env.CC_EMAIL,
        // //       notification_type: "certificate_alert",
        // //       certificate_uuid: logData.uuid,
        // //     });
        // //     logger("info", "Database", "Insert email event to Postgres");
        // //   }
        // // }

        // return result;
      } catch (error) {
        logger(
          "error",
          "Certificate",
          `Failed to process certificate: ${error.message}`
        );
        // return await Sti_Error.create({
        //   uuid: logData.uuid,
        //   identity_header: logData.identity,
        //   err1: logData.err1,
        //   err2: logData.err2,
        //   err3: logData.err3,
        //   cert_url: cert_url,
        //   cert_url_found: false,
        //   Identity_error: error.message,
        // });
      }
    } else {
      //   return await Sti_Error.create({
      //     uuid: logData.uuid,
      //     identity_header: logData.identity,
      //     err1: logData.err1,
      //     err2: logData.err2,
      //     err3: logData.err3,
      //     cert_url_found: false,
      //     Identity_error: "No certificate URL found in identity header",
      //   });
    }
  } catch (error) {
    logger(
      "error",
      "Processing",
      `Error processing certificate data: ${error.message}`
    );
    throw error;
  }
}

function extractCertUrl(identityHeader) {
  const urlMatch = identityHeader.match(/info=<(https:\/\/[^>]+)>/);
  return urlMatch ? urlMatch[1] : null;
}

async function parseCertificate(certData) {
  try {
    const tempFile = `.s/tmp/cert_${Date.now()}.pem`;

    await fs.writeFile(tempFile, certData);

    const { stdout } = await execPromise(
      `openssl x509 -text -noout -in ${tempFile}`
    );
    await fs.unlink(tempFile);

    return stdout;
  } catch (error) {
    throw new Error(`Failed to parse certificate: ${error.message}`);
  }
}

function extractCertificateFields(clearTextCert) {
  const fields = {
    signature: "",
    ani: "",
    dnis: "",
    CA: "",
    not_after: "",
    not_before: "",
    OCN: "",
    Origination: "",
    Country: "",
    Identity_error: "",
  };

  try {
    const sigMatch = clearTextCert.match(/Signature Algorithm:\s*([\w-]+)/);
    fields.signature = sigMatch ? sigMatch[1] : "";

    const caMatch = clearTextCert.match(/Issuer:.*?CN\s*=\s*([^,\n]+)/);
    fields.CA = caMatch ? caMatch[1].trim() : "";

    const notBeforeMatch = clearTextCert.match(/Not Before:\s*([^G\n]+)/);
    const notAfterMatch = clearTextCert.match(/Not After\s*:\s*([^G\n]+)/);

    if (notBeforeMatch) {
      fields.not_before = moment
        .utc(notBeforeMatch[1].trim(), "MMM D HH:mm:ss YYYY")
        .format();
    }
    if (notAfterMatch) {
      fields.not_after = moment
        .utc(notAfterMatch[1].trim(), "MMM D HH:mm:ss YYYY")
        .format();
    }

    const subjectMatch = clearTextCert.match(/Subject:([^\n]+)/);
    if (subjectMatch) {
      const subject = subjectMatch[1];

      const ocnMatch = subject.match(/O\s*=\s*([^,/]+)/);
      fields.OCN = ocnMatch ? ocnMatch[1].trim() : "";

      const countryMatch = subject.match(/C\s*=\s*([^,/]+)/);
      fields.Country = countryMatch ? countryMatch[1].trim() : "";
    }

    const shakenMatch = clearTextCert.match(/SHAKEN\s+(\w+)/);
    if (shakenMatch) {
      fields.ani = shakenMatch[1].trim();
    }

    const tnAuthMatch = clearTextCert.match(/TNAuthList:([^\n]+)/);
    if (tnAuthMatch) {
      fields.dnis = tnAuthMatch[1].trim();
    }

    fields.Origination = fields.OCN || "";

    const errorMatches = clearTextCert.match(/ERROR:([^\n]+)/);
    const criticalExtMatch = clearTextCert.match(
      /Critical Extensions:([^\n]+)/
    );

    fields.Identity_error = errorMatches
      ? errorMatches[1].trim()
      : criticalExtMatch
      ? criticalExtMatch[1].trim()
      : "";

    return fields;
  } catch (error) {
    logger(
      "error",
      "Certificate",
      `Failed to extract certificate fields: ${error.message}`
    );
    fields.Identity_error = error.message;
    return fields;
  }
}

async function checkIfRepeated(certUrl, currentUuid) {
  const today = moment().startOf("day");
  const count = await Sti_Error.count({
    where: {
      cert_url: certUrl,
      uuid: { [Op.ne]: currentUuid },
      createdAt: { [Op.gte]: today.toDate() },
    },
  });
  return count > 0;
}

app.post("/api/logs", async (req, res) => {
  const errors = req.body?.errors;

  try {
    if (!Array.isArray(errors)) {
      return res.status(400).json({
        success: false,
        message: "Expected errors to be an array",
      });
    }

    const processedErrors = errors.map((logData) => ({
      ...logData,
      uuid: logData.uuid || crypto.randomUUID(),
    }));

    res.json({
      success: true,
      uuids: processedErrors.map((error) => error.uuid),
      message: "Requests accepted for processing",
    });

    // Process each error asynchronously
    processedErrors.forEach((logData) => {
      processCertificateData(logData).catch((error) => {
        logger(
          "error",
          "Async Processing",
          `Failed to process certificate ${logData.uuid}: ${error.message}`
        );
      });
    });
  } catch (error) {
    logger("error", "API", `Error accepting request: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

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

app.listen(PORT, () => {
  logger("info", "Server", `Server is running on port ${PORT}`);
});
// sequelize.sync().then(() => {
//   app.listen(PORT, () => {
//     logger("info", "Server", `Server is running on port ${PORT}`);
//   });
// });
