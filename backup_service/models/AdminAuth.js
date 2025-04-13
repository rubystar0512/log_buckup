const { DataTypes } = require("sequelize");
const sequelize = require("./index");

const AdminAuth = sequelize.define(
  "admin_auth",

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
    password: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    tableName: "admin_auth",
    timestamps: true,
  }
);

module.exports = AdminAuth;
