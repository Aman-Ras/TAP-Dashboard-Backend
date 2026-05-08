const cron = require('node-cron');
const { fetchOverviewData, fetchDetailedRecruitersData } = require('../controllers/dashboardController');
const generateDailyReport = require('../utils/generateDailyReport');
const sendDailyReport     = require('../utils/sendDailyReport');

// Mirror the exact date logic the dashboard frontend uses:
// frontend sends "YYYY-MM-DD" → backend does new Date(str) + setHours(23,59,59,999).
// new Date("YYYY-MM-DD") is always UTC midnight per ECMA spec.
// setHours() operates in the server's local timezone (IST on this machine).
// We must do the same so report numbers match the dashboard "Today" view exactly.
function getTodayDateRange() {
  const now  = new Date();
  const year = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const dd   = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}-${mm}-${dd}`;  // local (IST) date as YYYY-MM-DD

  const start = new Date(dateStr);          // UTC midnight — same as dashboard
  const end   = new Date(dateStr);
  end.setHours(23, 59, 59, 999);            // local-time end-of-day — same as dashboard

  return { start, end, now };
}

function formatDisplayDate(d) {
  return d.toLocaleDateString('en-IN', {
    year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

async function runReportNow() {
  console.log('[DailyReport] Starting job...');
  const { start, end, now } = getTodayDateRange();
  const reportDate = formatDisplayDate(now);

  console.log(`[DailyReport] Query range: ${start.toISOString()} → ${end.toISOString()}`);

  const [overview, recruiters] = await Promise.all([
    fetchOverviewData(start, end, null),
    fetchDetailedRecruitersData(start, end),
  ]);

  console.log(`[DailyReport] Overview: interviews=${overview.totalInterviews} resumes=${overview.totalResumesProcessed} active=${overview.activeRecruiters}`);
  console.log(`[DailyReport] Active recruiters today: ${recruiters.length}`);

  const pdfBuffer = await generateDailyReport({ reportDate, overview, recruiters });
  console.log(`[DailyReport] PDF generated (${pdfBuffer.length} bytes)`);

  await sendDailyReport({
    pdfBuffer,
    reportDate,
    summary: {
      totalInterviews:      overview.totalInterviews,
      totalResumesProcessed: overview.totalResumesProcessed,
      activeRecruiters:     overview.activeRecruiters,
    },
  });

  console.log('[DailyReport] Job complete.');
}

function startDailyReportJob() {
  cron.schedule(
    '30 13 * * *',
    async () => {
      try {
        await runReportNow();
      } catch (err) {
        console.error('[DailyReport] Job failed:', err);
      }
    },
    { scheduled: true, timezone: 'Asia/Kolkata' }
  );

  console.log('[DailyReport] Cron job registered — fires daily at 13:30 IST (TEST)');
}

module.exports = { startDailyReportJob, runReportNow };
