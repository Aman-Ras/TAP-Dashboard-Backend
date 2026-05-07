const { Resend } = require('resend');

async function sendDailyReport({ pdfBuffer, reportDate, summary }) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const toList = (process.env.REPORT_EMAIL_TO || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  if (!toList.length) {
    throw new Error('[DailyReport] REPORT_EMAIL_TO is not configured in .env');
  }

  const subject = `Berlin — Daily Recruiter Activity Report | ${reportDate}`;

  const bodyText = [
    `Hi,`,
    '',
    `Here's today's recruiter activity summary for Berlin:`,
    '',
    `  • Interviews Scheduled  : ${summary.totalInterviews}`,
    `  • Resumes Processed     : ${summary.totalResumesProcessed}`,
    `  • Active Recruiters     : ${summary.activeRecruiters}`,
    '',
    `The full breakdown is attached as a PDF.`,
    '',
    'Berlin',
    'Element Technologies',
  ].join('\n');

  const filename = `recruiter-report-${reportDate.replace(/[\s,]+/g, '-')}.pdf`;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: toList,
    subject,
    text: bodyText,
    attachments: [{ filename, content: pdfBuffer }],
  });

  if (error) {
    throw new Error(`[DailyReport] Resend API error: ${JSON.stringify(error)}`);
  }

  console.log(`[DailyReport] Report sent to: ${toList.join(', ')}`);
}

module.exports = sendDailyReport;
