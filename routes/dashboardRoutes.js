const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dashboardController');

router.get('/positions', ctrl.getPositions);
router.get('/overview', ctrl.getOverview);
router.get('/recruiters', ctrl.getAllRecruiters);
router.get('/recruiter/:email', ctrl.getRecruiterDetail);
router.get('/candidates', ctrl.getCandidates);
router.get('/interviews', ctrl.getInterviews);
router.get('/resume-sessions', ctrl.getResumeSessions);
router.get('/comparison', ctrl.getComparison);

const { runReportNow } = require('../jobs/dailyReportJob');

// POST /api/dashboard/trigger-report — protected by CRON_SECRET, works in all envs
router.post('/trigger-report', async (req, res) => {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  try {
    await runReportNow();
    res.json({ ok: true, message: 'Report job completed. Check your email.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

if (process.env.NODE_ENV !== 'production') {

  // GET /api/dashboard/debug/preview-report  — stream PDF to browser for layout check
  router.get('/debug/preview-report', async (req, res) => {
    try {
      const { fetchOverviewData } = require('../controllers/dashboardController');
      const generateDailyReport = require('../utils/generateDailyReport');
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      const nowUTC = new Date();
      const nowIST = new Date(nowUTC.getTime() + IST_OFFSET_MS);
      const startIST = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate(), 0, 0, 0, 0) - IST_OFFSET_MS);
      const endIST   = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate(), 23, 59, 59, 999) - IST_OFFSET_MS);
      const reportDate = nowIST.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' });

      const { fetchDetailedRecruitersData } = require('../controllers/dashboardController');
      const [overview, recruiters] = await Promise.all([
        fetchOverviewData(startIST, endIST, null),
        fetchDetailedRecruitersData(startIST, endIST),
      ]);

      const pdfBuffer = await generateDailyReport({ reportDate, overview, recruiters });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="preview-report.pdf"');
      res.send(pdfBuffer);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
}

module.exports = router;
