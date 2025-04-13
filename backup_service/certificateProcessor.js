require("dotenv").config();
const axios = require("axios");
const nodemailer = require("nodemailer");
const moment = require("moment");
const logger = require("./utils/logger");
const crypto = require("crypto");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
const { Sequelize, Op } = require("sequelize");

const Sti_Error = require("./models/Sti_Error");
const EmailPreference = require("./models/EmailPreference");
const OptOutCompany = require("./models/OptOutCompany");
const e = require("express");

const stilogDB = new Sequelize(process.env.STILOG_DATABASE_URL, {
  logging: false,
  dialectOptions: {},
});

const transporter = nodemailer.createTransport({
  host: process.env.FROM_MAIL_IP,
  port: process.env.FROM_MAIL_PORT,
  secure: false,
  auth: {
    user: process.env.FROM_EMAIL,
    pass: process.env.FROM_MAIL_PASSPORT,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const isLogFromToday = (date) => {
  return moment(date).isSame(moment(), "day");
};

async function sendEmail(logData, result) {
  try {
    let subject = "";
    let emailContent = "";
    const company = result.Origination;

    let recipient = null;
    try {
      [recipient] = await stilogDB.query(
        "SELECT DISTINCT email, first_name FROM sp WHERE status = :status AND company = :company AND email IS NOT NULL LIMIT 1",
        {
          replacements: { status: "Active", company: company },
          type: stilogDB.QueryTypes.SELECT,
        }
      );
    } catch (error) {
      logger(
        "error",
        "Database",
        `Failed to query stilog database: ${error.message}`
      );
      return;
    }

    if (!recipient) {
      return;
    }

    if (!logData.cert_url_found) {
      subject = `Notification: Certificate Not Downloaded for OCN ${company}`;
      emailContent = `Certificate URL could not be accessed for OCN ${company}`;
    } else if (result.Identity_error.includes("Signature validation failed")) {
      subject = `Notification: Invalid Identity SHAKEN for OCN ${company}`;
      const personalizedContent = `Hi ${recipient.first_name || ""},

                This is a courtesy email to inform you that we have detected your OCN ${company} is generating an invalid identity header. The identity header in question is:
                
                ${logData.identity}
                
                Error:
                🚨 ${result.Identity_error}
                
                As Peeringhub is a certified STIR/SHAKEN CA, we can generate a valid certificate for you to resolve this issue.
                
                Pricing:
                $75/month
                
                $450/year (Save $150)
                
                During your subscription, you can generate unlimited certificates and enjoy our free Certificate Repository service to host your certificate. You can also use Peeringhub's auto-renewal feature to prevent the risk of using an expired certificate on your calls.
                
                Getting started is simple! Just register at www.peeringhub.io, and you'll be able to use our automatic tool to generate your certificate in just a few clicks.
                
                If you need assistance, feel free to contact us at akwong@peeringhub.io, and we'll be happy to help!
                
                Best regards,
                Peeringhub Team`;

      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: recipient.email,
        subject: subject,
        text: personalizedContent,
      };

      try {
        await transporter.sendMail(mailOptions);
        logger(
          "info",
          "Email",
          `Alert email sent successfully to ${recipient.email}`
        );
      } catch (error) {
        logger(
          "error",
          "Email",
          `Failed to send email to ${recipient.email}: ${error.message}`
        );
      }

      if (process.env.ENABLE_AUTO_EMAIL === "true") {
        await EmailPreference.create({
          uuid: crypto.randomUUID(),
          email: recipient?.email,
          subject: `Certificate Alert for ${company}`,
          content: `Certificate alert for company ${company}: ${
            result.Identity_error || "No specific error"
          }`,
          notification_type: "certificate_alert",
          certificate_uuid: logData.uuid,
        });
        logger("info", "Database", "Inserted email event to Postgres");
      }
      return;
    } else if (isLogFromToday(result.not_after)) {
      subject = `Notification: Expired Certificate for OCN ${company}`;
      emailContent = `Certificate has expired for OCN ${company}\nExpiry date: ${result.not_after}`;
    } else {
      subject = `Notification: Invalid Certificate for OCN ${company}`;
      emailContent = `Invalid certificate detected for OCN ${company}\nError: ${result.Identity_error}`;
    }

    if (emailContent) {
      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: recipient.email,
        subject: subject,
        text: emailContent,
      };

      try {
        await transporter.sendMail(mailOptions);
        logger("info", "Email", "Alert email sent successfully");
      } catch (error) {
        logger("error", "Email", `Failed to send email: ${error.message}`);
      }
    }
  } catch (error) {
    logger("error", "Email", `Failed to send email: ${error.message}`);
  }
}

async function notifyMattermost(logData, result) {
  try {
    await axios.post(process.env.MATTERMOST_URL, {
      text: `New Certificate Alert:\nIdentity: ${logData.identity}\nExpiry: ${result.not_after}`,
    });
    logger("info", "Mattermost", "Push Notification Email to Mattermost");
  } catch (error) {
    logger(
      "error",
      "Mattermost",
      `Failed to post to Mattermost: ${error.message}`
    );
  }
}

function extractCertUrl(identityHeader) {
  const urlMatch = identityHeader.match(/info=<(https:\/\/[^>]+)>/);
  return urlMatch ? urlMatch[1] : null;
}

async function parseCertificate(certData) {
  try {
    const { stdout } = await execPromise(
      `echo "${certData}" | openssl x509 -text -noout`
    );
    return stdout;
  } catch (error) {
    console.error("Certificate parsing error:", error);
    throw new Error(`Failed to parse certificate: ${error.message}`);
  }
}

async function extractCertificateFields(clearTextCert, identityHeader) {
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
    const { stdout } = await execPromise(
      `/opt/stirshaken/scripts/parse_identity '${identityHeader}'`
    );

    const errorMatch = stdout.match(/\[errno: \d+] ([^\n]+)/);
    if (errorMatch) {
      fields.Identity_error = errorMatch[1].trim();
    }

    const aniMatch = stdout.match(/"orig":\s*{\s*"tn":\s*"(\d+)"/);
    fields.ani = aniMatch ? aniMatch[1] : "";

    const dnisMatch = stdout.match(/"dest":\s*{\s*"tn":\s*\[\s*"(\d+)"/);
    fields.dnis = dnisMatch ? dnisMatch[1] : "";

    const sigMatch = clearTextCert.match(/Signature Algorithm:\s*([\w-]+)/);
    fields.signature = sigMatch ? sigMatch[1] : "";

    const caMatch = clearTextCert.match(/Issuer:.*?O\s*=\s*([^,\n]+)/);
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

      const shakenMatch = subject.match(/CN=SHAKEN\s+([A-Za-z0-9]{3})/);
      fields.OCN = shakenMatch ? shakenMatch[1].trim() : "";

      const orgMatch = subject.match(/O\s*=\s*([^,]+)/);
      fields.Origination = orgMatch ? orgMatch[1].trim() : "";

      const countryMatch = subject.match(/C\s*=\s*([^,]+)/);
      fields.Country = countryMatch ? countryMatch[1].trim() : "";
    }

    return fields;
  } catch (error) {
    fields.Identity_error = error.message;
    return fields;
  }
}

async function checkIfRepeated(certUrl) {
  const today = moment().startOf("day");
  const count = await Sti_Error.count({
    where: {
      cert_url: certUrl,
      createdAt: { [Op.gte]: today.toDate() },
    },
  });
  return count > 0;
}

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

        const certFields = await extractCertificateFields(
          clear_text_cert,
          logData.identity
        );
        const data = {
          uuid: logData.uuid,
          identity_header: logData.identity,
          err1: logData.err0,
          err2: logData.err1,
          err3: logData.err2,
          cert_url: cert_url,
          cert_url_found: cert_url_found,
          certificate: certificate,
          clear_text_cert: clear_text_cert,
          signature: certFields.signature,
          ani: certFields.ani,
          dnis: certFields.dnis,
          CA: certFields.CA,
          not_after: certFields.not_after,
          not_before: certFields.not_before,
          OCN: certFields.OCN,
          Origination: certFields.Origination,
          Country: certFields.Country,
          Identity_error: certFields.Identity_error,
          is_repeated: false,
        };
        const isRepeated = await checkIfRepeated(cert_url);
        if (isRepeated) {
          data.is_repeated = true;
        }

        if (!isRepeated) {
          const company = certFields.Origination;
          if (company) {
            const hasOptedOut = await OptOutCompany.findOne({
              where: { company },
            });

            if (!hasOptedOut) {
              await sendEmail(logData, data);
              await notifyMattermost(logData, data);
            } else {
              logger(
                "info",
                "Opt-out",
                `Skipping notifications for opted-out company: ${company}`
              );
            }
          }
        }

        return await Sti_Error.create(data);
      } catch (error) {
        return await Sti_Error.create({
          uuid: logData.uuid,
          identity_header: logData.identity,
          err1: logData.err0,
          err2: logData.err1,
          err3: logData.err2,
          cert_url: cert_url,
          cert_url_found: false,
          Identity_error: error.message,
        });
      }
    } else {
      return await Sti_Error.create({
        uuid: logData.uuid,
        identity_header: logData.identity,
        err1: logData.err0,
        err2: logData.err1,
        err3: logData.err2,
        cert_url_found: false,
        Identity_error: "No certificate URL found in identity header",
      });
    }
  } catch (error) {
    throw error;
  }
}

module.exports = { processCertificateData, sendEmail };
