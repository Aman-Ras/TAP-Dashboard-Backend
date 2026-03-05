const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dashboardController');

router.get('/positions', ctrl.getPositions);
router.get('/overview', ctrl.getOverview);
router.get('/recruiters', ctrl.getAllRecruiters);
router.get('/recruiter/:email', ctrl.getRecruiterDetail);
router.get('/interviews', ctrl.getInterviews);
router.get('/resume-sessions', ctrl.getResumeSessions);
router.get('/comparison', ctrl.getComparison);

module.exports = router;
