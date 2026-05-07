const PDFDocument = require('pdfkit');

const C = {
  navy:    '#0A2463',
  blue:    '#2563EB',
  green:   '#16A34A',
  orange:  '#D97706',
  red:     '#DC2626',
  text:    '#111827',
  sub:     '#374151',
  muted:   '#6B7280',
  border:  '#D1D5DB',
  rowAlt:  '#F9FAFB',
  ivBg:    '#EFF6FF',
  rvBg:    '#ECFDF5',
  white:   '#FFFFFF',
  bg:      '#F1F5F9',
};

const AVATAR_COLORS = ['#4F46E5','#7C3AED','#DB2777','#0891B2','#D97706','#059669','#DC2626'];

function scoreColor(s) {
  if (s === null || s === undefined) return C.muted;
  return s >= 70 ? C.green : s >= 40 ? C.orange : C.red;
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

async function generateDailyReport({ reportDate, overview, recruiters }) {
  const doc = new PDFDocument({ autoFirstPage: false, margin: 0, size: 'A4' });
  const bufs = [];
  doc.on('data', (c) => bufs.push(c));

  return new Promise((resolve, reject) => {
    doc.on('end',   () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    const pageW = 595;
    const pageH = 842;
    const m     = 32;           // left/right margin
    const cW    = pageW - m*2;  // 531pt content width

    let y = 0;

    function newPage() {
      doc.addPage({ size: 'A4', margin: 0 });
      doc.rect(0, 0, pageW, pageH).fill(C.bg);
      y = 0;
    }

    function needSpace(h) {
      if (y + h > pageH - 28) { newPage(); }
    }

    // ─── thin horizontal rule ──────────────────────────────────────────────
    function rule(yy, color = C.border, w = 0.4) {
      doc.moveTo(m, yy).lineTo(m + cW, yy).strokeColor(color).lineWidth(w).stroke();
    }

    // ─── HEADER ───────────────────────────────────────────────────────────
    newPage();

    const HEADER_H = 66;

    // Navy background
    doc.rect(0, 0, pageW, HEADER_H).fill(C.navy);

    // Decorative concentric arcs — top-right corner (lighter navy shades)
    doc.circle(pageW + 8, -8, 88).fill('#0D2B74');
    doc.circle(pageW + 8, -8, 66).fill('#1030820');
    doc.circle(pageW + 8, -8, 44).fill('#123490');
    doc.circle(pageW + 8, -8, 22).fill('#1B3EAA');

    // Left vivid accent bar
    doc.rect(0, 0, 4, HEADER_H).fill(C.blue);

    // Logo — BERLIN wordmark + blue accent bar + tagline
    const lx = 4 + m, ly = HEADER_H / 2;
    doc.fillColor(C.white).fontSize(21).font('Helvetica-Bold')
      .text('BERLIN', lx, ly - 15, { lineBreak: false, characterSpacing: 2 });
    doc.rect(lx, ly + 8, 56, 2.5).fill(C.blue);
    doc.fillColor('#93B8D8').fontSize(5.5).font('Helvetica-Bold')
      .text('ELEMENT TECHNOLOGIES', lx, ly + 14, { lineBreak: false, characterSpacing: 1.2 });

    // Thin vertical separator
    const sepX = lx + 112;
    doc.rect(sepX, 12, 0.8, HEADER_H - 24).fill('#2A4E96');

    // Title block
    const titleX = sepX + 14;
    doc.fillColor(C.white).fontSize(15).font('Helvetica-Bold')
      .text('Daily Recruiter Activity Report', titleX, 13, { lineBreak: false });
    doc.fillColor('#93B8D8').fontSize(7.5).font('Helvetica')
      .text('Recruiter Activity Summary', titleX, 34, { lineBreak: false });

    // Date + time badge (top-right, inside navy)
    const bdgW = 114, bdgX = pageW - m - bdgW;
    doc.roundedRect(bdgX, 14, bdgW, 16, 8).fill('#122870');
    doc.fillColor('#93C5FD').fontSize(7.5).font('Helvetica-Bold')
      .text(reportDate, bdgX, 18, { width: bdgW, align: 'center', lineBreak: false });
    doc.fillColor('#5E8FC8').fontSize(6.5).font('Helvetica')
      .text('Generated at 10:00 PM IST', bdgX, 35, { width: bdgW, align: 'center', lineBreak: false });

    // Blue accent line below header
    doc.rect(0, HEADER_H, pageW, 3).fill(C.blue);
    y = HEADER_H + 3;

    // ─── STATS STRIP ─────────────────────────────────────────────────────
    const STATS_H = 36;
    doc.rect(0, y, pageW, STATS_H).fill(C.white);

    const summaryItems = [
      { label: 'INTERVIEWS TODAY',  value: String(overview.totalInterviews),       color: C.blue,   barColor: '#DBEAFE' },
      { label: 'RESUMES UPLOADED',  value: String(overview.totalResumesProcessed), color: C.green,  barColor: '#DCFCE7' },
      { label: 'ACTIVE RECRUITERS', value: String(overview.activeRecruiters),      color: C.orange, barColor: '#FEF3C7' },
    ];

    const slotW = cW / summaryItems.length;
    summaryItems.forEach((item, i) => {
      const sx = m + i * slotW;

      // Coloured left accent per stat slot
      doc.rect(sx, y, 3, STATS_H).fill(item.color);

      // Vertical divider between slots (skip first)
      if (i > 0) {
        doc.rect(sx, y + 4, 0.5, STATS_H - 8).fill(C.border);
      }

      doc.fillColor(C.muted).fontSize(6.5).font('Helvetica-Bold')
        .text(item.label, sx + 10, y + 6, { width: slotW - 14, lineBreak: false });
      doc.fillColor(item.color).fontSize(20).font('Helvetica-Bold')
        .text(item.value, sx + 10, y + 14, { width: slotW - 14, lineBreak: false });
    });

    // Bottom border of stats strip
    doc.rect(0, y + STATS_H, pageW, 0.5).fill(C.border);
    y += STATS_H;

    // ─── SECTION HEADING ──────────────────────────────────────────────────
    y += 10;
    doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold')
      .text('Recruiter Breakdown', m, y, { continued: true });
    doc.fillColor(C.muted).fontSize(8).font('Helvetica')
      .text(`   ${recruiters.length} recruiter${recruiters.length !== 1 ? 's' : ''} active today`, { lineBreak: false });
    y += 13;
    rule(y, C.navy, 0.6);
    y += 8;

    // ─── RECRUITER CARDS ──────────────────────────────────────────────────
    // Interview table columns (sum = cW = 531)
    const iCols = [
      { w: 20,  align: 'center' },  // #
      { w: 190, align: 'left'   },  // Candidate
      { w: 215, align: 'left'   },  // Position
      { w: 106, align: 'center' },  // Score
    ];

    // Resume table columns
    const rCols = [
      { w: 425, align: 'left'   },  // Position
      { w: 106, align: 'center' },  // Count
    ];

    const ROW_H    = 16;
    const TH_H     = 15;
    const SEC_H    = 14;
    const HEAD_H   = 28;
    const CARD_GAP = 6;

    function estimateCardH(r) {
      let h = HEAD_H;
      if (r.interviews.length > 0) h += SEC_H + TH_H + r.interviews.length * ROW_H;
      if (r.resumePositions.length > 0) h += SEC_H + TH_H + r.resumePositions.length * ROW_H;
      return h + CARD_GAP;
    }

    recruiters.forEach((r, ri) => {
      const cardH = estimateCardH(r);
      needSpace(cardH);

      const avColor = AVATAR_COLORS[ri % AVATAR_COLORS.length];

      // ── Card background ────────────────────────────────────────────────
      doc.rect(m, y, cW, cardH - CARD_GAP).fill(C.white);
      doc.rect(m, y, 4, cardH - CARD_GAP).fill(avColor); // accent bar

      // ── Recruiter header row ───────────────────────────────────────────
      const avR  = 10;
      const avCX = m + 14 + avR;
      const avCY = y + HEAD_H / 2;
      doc.circle(avCX, avCY, avR).fill(avColor);
      doc.fillColor(C.white).fontSize(6.5).font('Helvetica-Bold')
        .text(initials(r.name), avCX - avR, avCY - 4, { width: avR * 2, align: 'center', lineBreak: false });

      const nameX = m + 38;
      doc.fillColor(C.text).fontSize(9.5).font('Helvetica-Bold')
        .text(r.name, nameX, y + 6, { width: cW - 160, lineBreak: false, ellipsis: true });
      doc.fillColor(C.muted).fontSize(7).font('Helvetica')
        .text(r.email, nameX, y + 19, { width: cW - 160, lineBreak: false, ellipsis: true });

      // Quick stats badges (top-right)
      const badgeX = m + cW - 145;
      doc.fillColor(C.muted).fontSize(6.5).font('Helvetica-Bold')
        .text('INTERVIEWS', badgeX, y + 6, { width: 65, align: 'center', lineBreak: false });
      doc.fillColor(C.blue).fontSize(11).font('Helvetica-Bold')
        .text(String(r.interviews.length), badgeX, y + 15, { width: 65, align: 'center', lineBreak: false });

      doc.fillColor(C.muted).fontSize(6.5).font('Helvetica-Bold')
        .text('RESUMES', badgeX + 70, y + 6, { width: 65, align: 'center', lineBreak: false });
      doc.fillColor(C.green).fontSize(11).font('Helvetica-Bold')
        .text(String(r.totalResumes), badgeX + 70, y + 15, { width: 65, align: 'center', lineBreak: false });

      y += HEAD_H;
      rule(y, C.border, 0.4);

      // ── Interviews section (only if there are interviews) ──────────────
      if (r.interviews.length > 0) {
        // Section label
        doc.rect(m + 4, y, cW - 4, SEC_H).fill(C.ivBg);
        doc.fillColor(C.blue).fontSize(7).font('Helvetica-Bold')
          .text(`INTERVIEWS SCHEDULED TODAY — ${r.interviews.length}`, m + 10, y + 4, { lineBreak: false });
        y += SEC_H;

        // Table header
        doc.rect(m + 4, y, cW - 4, TH_H).fill('#DBEAFE');
        const iHeaders = ['#', 'Candidate Name', 'Position', 'Score'];
        let cx = m + 4;
        iHeaders.forEach((h, hi) => {
          doc.fillColor(C.navy).fontSize(6.5).font('Helvetica-Bold')
            .text(h, cx + 3, y + 4, { width: iCols[hi].w - 6, align: iCols[hi].align, lineBreak: false });
          cx += iCols[hi].w;
        });
        y += TH_H;

        r.interviews.forEach((iv, ii) => {
          const bg = ii % 2 === 0 ? C.white : C.rowAlt;
          doc.rect(m + 4, y, cW - 4, ROW_H).fill(bg);
          rule(y + ROW_H, C.border, 0.3);

          cx = m + 4;
          const ty = y + 4;

          doc.fillColor(C.muted).fontSize(7).font('Helvetica')
            .text(String(ii + 1), cx + 3, ty, { width: iCols[0].w - 6, align: 'center', lineBreak: false });
          cx += iCols[0].w;

          doc.fillColor(C.text).fontSize(7.5).font('Helvetica-Bold')
            .text(iv.candidateName, cx + 3, ty, { width: iCols[1].w - 6, lineBreak: false, ellipsis: true });
          cx += iCols[1].w;

          doc.fillColor(C.sub).fontSize(7.5).font('Helvetica')
            .text(iv.position, cx + 3, ty, { width: iCols[2].w - 6, lineBreak: false, ellipsis: true });
          cx += iCols[2].w;

          const scoreLabel = iv.score !== null ? `${iv.score}%` : (iv.status === 'Scheduled' ? 'Pending' : '—');
          doc.fillColor(iv.score !== null ? scoreColor(iv.score) : C.muted)
            .fontSize(7.5).font('Helvetica-Bold')
            .text(scoreLabel, cx + 3, ty, { width: iCols[3].w - 6, align: 'center', lineBreak: false });

          y += ROW_H;
        });
      }

      // ── Resume matching section ────────────────────────────────────────
      if (r.resumePositions.length > 0) {
        // Section label
        doc.rect(m + 4, y, cW - 4, SEC_H).fill(C.rvBg);
        doc.fillColor(C.green).fontSize(7).font('Helvetica-Bold')
          .text(`RESUME MATCHING TODAY — ${r.totalResumes} resumes`,
            m + 10, y + 4, { lineBreak: false });
        y += SEC_H;

        // Table header
        doc.rect(m + 4, y, cW - 4, TH_H).fill('#D1FAE5');
        const rHeaders = ['Position', 'Resumes Uploaded'];
        cx = m + 4;
        rHeaders.forEach((h, hi) => {
          doc.fillColor(C.navy).fontSize(6.5).font('Helvetica-Bold')
            .text(h, cx + 3, y + 4, { width: rCols[hi].w - 6, align: rCols[hi].align, lineBreak: false });
          cx += rCols[hi].w;
        });
        y += TH_H;

        r.resumePositions.forEach((rp, ri2) => {
          const bg = ri2 % 2 === 0 ? C.white : C.rowAlt;
          doc.rect(m + 4, y, cW - 4, ROW_H).fill(bg);
          rule(y + ROW_H, C.border, 0.3);

          doc.fillColor(C.sub).fontSize(7.5).font('Helvetica')
            .text(rp.position, m + 10, y + 4, { width: rCols[0].w - 14, lineBreak: false, ellipsis: true });
          doc.fillColor(C.green).fontSize(7.5).font('Helvetica-Bold')
            .text(String(rp.count), m + 4 + rCols[0].w + 3, y + 4,
              { width: rCols[1].w - 6, align: 'center', lineBreak: false });

          y += ROW_H;
        });
      }

      y += CARD_GAP;
    });

    // ─── FOOTER ───────────────────────────────────────────────────────────
    needSpace(20);
    rule(y, C.border);
    doc.fillColor(C.muted).fontSize(6.5).font('Helvetica')
      .text(`TAP Dashboard  ·  Element Technologies  ·  ${reportDate}`,
        m, y + 5, { width: cW, align: 'center', lineBreak: false });

    doc.end();
  });
}

module.exports = generateDailyReport;
