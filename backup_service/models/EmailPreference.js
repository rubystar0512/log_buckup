const { DataTypes } = require("sequelize");
const sequelize = require("./index");

const EmailEvent = sequelize.define(
  "email_event",

  {
    uuid: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
    },
    email: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    subject: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    opted_out: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "email_events",
    timestamps: true,
  }
);

module.exports = EmailEvent;
