const mongoose = require('mongoose');

const interviews     = () => mongoose.connection.collection('interviews');
const resumeTracking = () => mongoose.connection.collection('recruiter_resume_tracking');

// ── Simple in-memory cache ─────────────────────────────────────────────────────
const cache = new Map();
function fromCache(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < 120_000) return hit.data; // 2 min TTL
  return null;
}
function toCache(key, data) { cache.set(key, { ts: Date.now(), data }); }

// Pipeline $lookup — fetches only score + verdict fields (avoids loading 4MB report docs)
function scoreLookup() {
  return [
    { $lookup: {
        from: 'reports',
        let: { iid: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$candidate_id', '$$iid'] } } },
          { $project: { 'report.Final_Overall_Score': 1, 'report.Final_Overall_Verdict': 1 } },
          { $limit: 1 },
        ],
        as: '_report',
    }},
    { $unwind: { path: '$_report', preserveNullAndEmptyArrays: true } },
    { $addFields: {
        scoreRaw: { $ifNull: ['$_report.report.Final_Overall_Score', null] },
        verdict:  { $ifNull: ['$_report.report.Final_Overall_Verdict',  null] },
    }},
    { $addFields: {
        score: { $cond: {
          if: { $and: ['$scoreRaw', { $gt: [{ $strLenCP: { $ifNull: ['$scoreRaw', ''] } }, 0] }] },
          then: { $toInt: { $arrayElemAt: [{ $split: ['$scoreRaw', '%'] }, 0] } },
          else: null,
        }},
    }},
    { $project: { _report: 0, scoreRaw: 0, questions: 0, jobDescription: 0, resume: 0, profilePic: 0, candidateAddress: 0, __v: 0 } },
  ];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function dateFilter(field, startDate, endDate) {
  const f = {};
  if (startDate || endDate) {
    f[field] = {};
    if (startDate) f[field].$gte = new Date(startDate);
    if (endDate)   f[field].$lte = new Date(endDate);
  }
  return f;
}

// position → interviews.applyFor (case-insensitive exact match via regex)
function positionFilter(position) {
  if (!position) return {};
  return { applyFor: { $regex: `^${position.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } };
}

// jd_position filter for resume_tracking
function jdPositionFilter(position) {
  if (!position) return {};
  return { jd_position: { $regex: `^${position.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } };
}

// ── GET /api/dashboard/positions ─────────────────────────────────────────────
exports.getPositions = async (req, res) => {
  try {
    const [interviewPositions, resumePositions] = await Promise.all([
      interviews().distinct('applyFor'),
      resumeTracking().distinct('jd_position'),
    ]);

    const merged = [...new Set([
      ...interviewPositions.filter(Boolean),
      ...resumePositions.filter(Boolean),
    ])].sort((a, b) => a.localeCompare(b));

    res.json(merged);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/dashboard/overview ───────────────────────────────────────────────
exports.getOverview = async (req, res) => {
  try {
    const { position, startDate, endDate } = req.query;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const iFilter = { ...positionFilter(position), ...dateFilter('startTime', startDate, endDate) };
    const rFilter = { ...jdPositionFilter(position), ...dateFilter('created_at', startDate, endDate) };

    const [
      totalInterviews,
      byStatus,
      thisMonthInterviews,
      totalResumeSessions,
      resumeAgg,
      interviewEmails,
      resumeEmails,
    ] = await Promise.all([
      interviews().countDocuments(iFilter),
      interviews().aggregate([
        { $match: iFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).toArray(),
      interviews().countDocuments({ ...iFilter, startTime: { $gte: monthStart } }),
      resumeTracking().countDocuments(rFilter),
      resumeTracking().aggregate([
        { $match: rFilter },
        { $group: { _id: null, totalResumesProcessed: { $sum: '$total_resumes_uploaded' }, totalPassed: { $sum: '$resumes_passed_threshold' } } },
      ]).toArray(),
      interviews().distinct('recruiterEmail', iFilter),
      resumeTracking().distinct('recruiter_email', rFilter),
    ]);

    const allEmails = new Set([
      ...interviewEmails.filter(Boolean),
      ...resumeEmails.filter(Boolean),
    ]);
    const resumeTotals = resumeAgg[0] || { totalResumesProcessed: 0, totalPassed: 0 };

    res.json({
      totalInterviews,
      byStatus: byStatus.reduce((acc, { _id, count }) => { acc[_id || 'Unknown'] = count; return acc; }, {}),
      thisMonthInterviews,
      totalResumeSessions,
      totalResumesProcessed: resumeTotals.totalResumesProcessed,
      totalPassed: resumeTotals.totalPassed,
      activeRecruiters: allEmails.size,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/dashboard/recruiters ─────────────────────────────────────────────
exports.getAllRecruiters = async (req, res) => {
  try {
    const { position, startDate, endDate } = req.query;
    const iFilter = { ...positionFilter(position), ...dateFilter('startTime', startDate, endDate) };
    const rFilter = { ...jdPositionFilter(position), ...dateFilter('created_at', startDate, endDate) };

    const [interviewStats, resumeStats] = await Promise.all([
      interviews().aggregate([
        { $match: iFilter },
        {
          $group: {
            _id: '$recruiterEmail',
            recruiter: { $first: '$recruiter' },
            totalInterviews: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
            scheduled: { $sum: { $cond: [{ $eq: ['$status', 'Scheduled'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] } },
            lastActivity: { $max: '$createdAt' },
          },
        },
        { $sort: { totalInterviews: -1 } },
      ]).toArray(),
      resumeTracking().aggregate([
        { $match: rFilter },
        {
          $group: {
            _id: '$recruiter_email',
            recruiterName: { $first: '$recruiter_name' },
            totalSessions: { $sum: 1 },
            totalResumes: { $sum: '$total_resumes_uploaded' },
            totalPassed: { $sum: '$resumes_passed_threshold' },
            lastActivity: { $max: '$updated_at' },
          },
        },
      ]).toArray(),
    ]);

    const map = {};
    for (const s of interviewStats) {
      const email = s._id;
      if (!email) continue;
      map[email] = {
        email,
        name: s.recruiter || email,
        totalInterviews: s.totalInterviews,
        completed: s.completed,
        scheduled: s.scheduled,
        cancelled: s.cancelled,
        totalSessions: 0, totalResumes: 0, totalPassed: 0, passRate: 0,
        completionRate: s.totalInterviews ? Math.round((s.completed / s.totalInterviews) * 100) : 0,
        lastActive: s.lastActivity,
      };
    }
    for (const s of resumeStats) {
      const email = s._id;
      if (!email) continue;
      if (!map[email]) {
        map[email] = { email, name: s.recruiterName || email, totalInterviews: 0, completed: 0, scheduled: 0, cancelled: 0, completionRate: 0, lastActive: s.lastActivity };
      }
      map[email].totalSessions = s.totalSessions;
      map[email].totalResumes  = s.totalResumes;
      map[email].totalPassed   = s.totalPassed;
      map[email].passRate       = s.totalResumes ? Math.round((s.totalPassed / s.totalResumes) * 100) : 0;
      if (s.recruiterName) map[email].name = s.recruiterName;
      if (!map[email].lastActive || (s.lastActivity && s.lastActivity > map[email].lastActive)) map[email].lastActive = s.lastActivity;
    }

    res.json(Object.values(map));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/dashboard/recruiter/:email ───────────────────────────────────────
exports.getRecruiterDetail = async (req, res) => {
  try {
    const { email } = req.params;
    const { startDate, endDate, position } = req.query;

    const iBase = { recruiterEmail: email, ...dateFilter('startTime', startDate, endDate), ...positionFilter(position) };
    const rBase = { recruiter_email: email, ...dateFilter('created_at', startDate, endDate), ...jdPositionFilter(position) };

    const [interviewList, interviewAgg, weeklyActivity, sessionList, sessionAgg] = await Promise.all([
      interviews().aggregate([
        { $match: iBase },
        ...scoreLookup(),
        { $sort: { startTime: -1 } },
      ]).toArray(),
      interviews().aggregate([
        { $match: iBase },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).toArray(),
      interviews().aggregate([
        { $match: iBase },
        { $group: { _id: { $dateToString: { format: '%Y-%U', date: { $ifNull: ['$startTime', '$createdAt'] } } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
      resumeTracking().find(rBase).sort({ created_at: -1 }).toArray(),
      resumeTracking().aggregate([
        { $match: rBase },
        { $group: { _id: null, totalSessions: { $sum: 1 }, totalResumes: { $sum: '$total_resumes_uploaded' }, totalPassed: { $sum: '$resumes_passed_threshold' } } },
      ]).toArray(),
    ]);

    const statusBreakdown = interviewAgg.reduce((acc, { _id, count }) => { acc[_id || 'Unknown'] = count; return acc; }, {});
    const sessStats = sessionAgg[0] || { totalSessions: 0, totalResumes: 0, totalPassed: 0 };

    res.json({
      email,
      name: interviewList[0]?.recruiter || sessionList[0]?.recruiter_name || email,
      interviews: { list: interviewList, statusBreakdown, total: interviewList.length },
      resumeSessions: {
        list: sessionList,
        totalSessions: sessStats.totalSessions,
        totalResumes:  sessStats.totalResumes,
        totalPassed:   sessStats.totalPassed,
        passRate: sessStats.totalResumes ? Math.round((sessStats.totalPassed / sessStats.totalResumes) * 100) : 0,
      },
      weeklyActivity: weeklyActivity.map((w) => ({ week: w._id, count: w.count })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/dashboard/candidates ────────────────────────────────────────────
exports.getCandidates = async (req, res) => {
  try {
    const { recruiterEmail, position, startDate, endDate, minScore } = req.query;

    const cacheKey = `candidates:${JSON.stringify(req.query)}`;
    const cached = fromCache(cacheKey);
    if (cached) return res.json(cached);

    const match = { status: 'Completed' };
    if (recruiterEmail) match.recruiterEmail = recruiterEmail;
    Object.assign(match, positionFilter(position));
    Object.assign(match, dateFilter('startTime', startDate, endDate));

    const pipeline = [
      { $match: match },
      ...scoreLookup(),
      ...(minScore ? [{ $match: { score: { $gte: parseInt(minScore, 10) } } }] : []),
      { $sort: { score: -1, startTime: -1 } },
      { $limit: 500 },
    ];

    const candidates = await interviews().aggregate(pipeline).toArray();
    toCache(cacheKey, candidates);
    res.json(candidates);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/dashboard/interviews ─────────────────────────────────────────────
exports.getInterviews = async (req, res) => {
  try {
    const { recruiterEmail, startDate, endDate, position } = req.query;
    const filter = {};
    if (recruiterEmail) filter.recruiterEmail = recruiterEmail;
    Object.assign(filter, dateFilter('startTime', startDate, endDate));
    Object.assign(filter, positionFilter(position));

    const list = await interviews().find(filter).sort({ startTime: -1 }).limit(500).toArray();
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/dashboard/resume-sessions ────────────────────────────────────────
exports.getResumeSessions = async (req, res) => {
  try {
    const { recruiterEmail, startDate, endDate, position } = req.query;
    const filter = {};
    if (recruiterEmail) filter.recruiter_email = recruiterEmail;
    Object.assign(filter, dateFilter('created_at', startDate, endDate));
    Object.assign(filter, jdPositionFilter(position));
    const list = await resumeTracking().find(filter).sort({ created_at: -1 }).limit(500).toArray();
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/dashboard/comparison ─────────────────────────────────────────────
exports.getComparison = async (req, res) => {
  try {
    const { position } = req.query;
    const iFilter = { ...positionFilter(position) };
    const rFilter = { ...jdPositionFilter(position) };

    const [interviewStats, resumeStats] = await Promise.all([
      interviews().aggregate([
        { $match: iFilter },
        {
          $group: {
            _id: '$recruiterEmail',
            name: { $first: '$recruiter' },
            totalInterviews: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
            lastActivity: { $max: '$createdAt' },
          },
        },
      ]).toArray(),
      resumeTracking().aggregate([
        { $match: rFilter },
        {
          $group: {
            _id: '$recruiter_email',
            name: { $first: '$recruiter_name' },
            totalSessions: { $sum: 1 },
            totalResumes: { $sum: '$total_resumes_uploaded' },
            totalPassed: { $sum: '$resumes_passed_threshold' },
            avgResumesPerSession: { $avg: '$total_resumes_uploaded' },
          },
        },
      ]).toArray(),
    ]);

    const map = {};
    for (const s of interviewStats) {
      if (!s._id) continue;
      map[s._id] = {
        email: s._id, name: s.name || s._id,
        totalInterviews: s.totalInterviews, completed: s.completed,
        completionRate: s.totalInterviews ? Math.round((s.completed / s.totalInterviews) * 100) : 0,
        totalSessions: 0, totalResumes: 0, totalPassed: 0, passRate: 0, avgResumesPerSession: 0,
        lastActive: s.lastActivity,
      };
    }
    for (const s of resumeStats) {
      if (!s._id) continue;
      if (!map[s._id]) map[s._id] = { email: s._id, name: s.name || s._id, totalInterviews: 0, completed: 0, completionRate: 0, lastActive: null };
      map[s._id].totalSessions      = s.totalSessions;
      map[s._id].totalResumes       = s.totalResumes;
      map[s._id].totalPassed        = s.totalPassed;
      map[s._id].passRate           = s.totalResumes ? Math.round((s.totalPassed / s.totalResumes) * 100) : 0;
      map[s._id].avgResumesPerSession = Math.round(s.avgResumesPerSession || 0);
      if (s.name) map[s._id].name  = s.name;
    }

    const all = Object.values(map);
    const maxI = Math.max(...all.map((r) => r.totalInterviews), 1);
    const maxS = Math.max(...all.map((r) => r.totalSessions),   1);
    for (const r of all) {
      r.activityScore = Math.round((r.totalInterviews / maxI) * 50 + (r.totalSessions / maxS) * 50);
    }

    res.json(all);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
