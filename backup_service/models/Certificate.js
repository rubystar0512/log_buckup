const { DataTypes } = require("sequelize");
const sequelize = require("./index");

const Certificate = sequelize.define(
  "Certificate",
  {
    uuid: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
    },
    identity_header: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    err1: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    err2: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    err3: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    from_ip: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cert_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    certificate: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    clear_text_cert: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    signature: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ani: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    dnis: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    CA: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    not_after: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    not_before: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    OCN: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    Origination: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    Country: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    Identity_error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cert_url_found: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    is_repeated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "certificates",
    timestamps: true,
    indexes: [
      {
        fields: ["not_after"],
      },
      {
        fields: ["identity_header"],
      },
    ],
  }
);

module.exports = Certificate;
