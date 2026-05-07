require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { startDailyReportJob } = require('./jobs/dailyReportJob');

const PORT = process.env.PORT || 5002;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Recruiter Dashboard backend running on port ${PORT}`);
  });
  startDailyReportJob();
}).catch((err) => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});
