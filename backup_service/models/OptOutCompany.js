const { DataTypes } = require("sequelize");
const sequelize = require("./index");

const OptOutCompany = sequelize.define(
  "opt_out_company",

  {
    uuid: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
    },
    company: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    tableName: "opt_out_companies",
    timestamps: true,
  }
);

module.exports = OptOutCompany;
