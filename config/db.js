const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME || 'ELEMENT_AI_INTERVIEW_PROD';

  await mongoose.connect(uri, { dbName });
  console.log(`MongoDB connected — db: ${dbName}`);
};

module.exports = connectDB;
