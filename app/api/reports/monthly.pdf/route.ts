import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getMissionUser } from '@/lib/auth';
import { getMissionControlData } from '@/lib/database';
import { getRawDb } from '@/db';

export const dynamic = 'force-dynamic';

function wrap(text: string, max = 76) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (`${line} ${word}`.trim().length > max && line) { lines.push(line); line = word; }
    else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines;
}

export async function GET(request: Request) {
  const user = await getMissionUser();
  if (!user) return new Response('Mission Control access is required.', { status: 403 });
  const data = await getMissionControlData(user);
  if (data.featureModes.monthly_board_pdf === 'off') {
    return new Response('Monthly board PDF generation is switched off.', { status: 409 });
  }
  const pdf = await PDFDocument.create();
  pdf.setTitle('Students Feeding Students · Monthly Board Report');
  pdf.setAuthor('Students Feeding Students');
  pdf.setSubject('Monthly program operations and impact');
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.075, 0.063);
  const rust = rgb(0.68, 0.27, 0.16);
  const muted = rgb(0.40, 0.37, 0.34);
  const line = rgb(0.84, 0.80, 0.75);
  const paper = rgb(0.98, 0.96, 0.93);
  const generated = new Date();
  const calendarParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(generated);
  const calendarPart = (type: Intl.DateTimeFormatPartTypes) => calendarParts.find((item) => item.type === type)?.value ?? '';
  const currentPeriod = `${calendarPart('year')}-${calendarPart('month')}`;
  const requestedPeriod = new URL(request.url).searchParams.get('month');
  if (requestedPeriod && (!/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedPeriod) || requestedPeriod > currentPeriod)) {
    return new Response('Choose a valid current or past report month.', { status: 400 });
  }
  const selectedPeriod = requestedPeriod ?? currentPeriod;
  const [reportYear, reportMonth] = selectedPeriod.split('-').map(Number);
  const closedPeriod = selectedPeriod < currentPeriod;
  const periodStart = `${reportYear}-${String(reportMonth).padStart(2, '0')}-01`;
  const periodEnd = new Date(Date.UTC(reportYear, reportMonth, 1)).toISOString().slice(0, 10);
  const db = getRawDb();
  const [monthly, cabinetRows, featureRows] = await Promise.all([
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM cabinet_checks WHERE checked_at>=? AND checked_at<?) AS checks,
      (SELECT COUNT(*) FROM cabinet_checks WHERE checked_at>=? AND checked_at<? AND is_empty=1) AS empty_reports,
      (SELECT COUNT(*) FROM tasks WHERE completed_at>=? AND completed_at<? AND status='complete') AS completed_tasks,
      (SELECT COALESCE(SUM(amount_cents),0) FROM donations WHERE received_at>=? AND received_at<?) AS donation_cents,
      (SELECT COALESCE(SUM(amount_cents),0) FROM purchases WHERE purchased_at>=? AND purchased_at<?) AS purchase_cents`)
      .bind(periodStart, periodEnd, periodStart, periodEnd, periodStart, periodEnd, periodStart, periodEnd, periodStart, periodEnd)
      .first<Record<string, unknown>>(),
    db.prepare(`SELECT c.id,c.name,COUNT(cc.id) AS checks,
      SUM(CASE WHEN cc.is_empty=1 THEN 1 ELSE 0 END) AS empty_reports
      FROM cabinets c LEFT JOIN cabinet_checks cc ON cc.cabinet_id=c.id AND cc.checked_at>=? AND cc.checked_at<?
      WHERE c.active=1 GROUP BY c.id,c.name ORDER BY c.sort_order`).bind(periodStart, periodEnd).all<Record<string, unknown>>(),
    db.prepare('SELECT label,mode,requires_setup FROM feature_flags ORDER BY category,label').all<Record<string, unknown>>(),
  ]);
  const month = new Date(Date.UTC(reportYear, reportMonth - 1, 15)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const draft = data.featureModes.monthly_board_pdf !== 'on';

  function header(page: ReturnType<typeof pdf.addPage>, title: string, number: number) {
    page.drawText('STUDENTS FEEDING STUDENTS', { x: 44, y: 752, size: 8, font: bold, color: rust });
    page.drawText(title, { x: 44, y: 728, size: 17, font: bold, color: ink });
    page.drawLine({ start: { x: 44, y: 714 }, end: { x: 568, y: 714 }, thickness: 1, color: line });
    page.drawText(String(number), { x: 548, y: 35, size: 8, font: body, color: muted });
    if (draft) page.drawText('DRAFT · REVIEW MODE', { x: 440, y: 752, size: 8, font: bold, color: rust });
  }

  function drawParagraph(page: ReturnType<typeof pdf.addPage>, text: string, x: number, y: number, options: { size?: number; max?: number; leading?: number; color?: ReturnType<typeof rgb>; font?: typeof body } = {}) {
    const size = options.size ?? 10;
    const leading = options.leading ?? 14;
    const lines = wrap(text, options.max ?? 82);
    lines.forEach((item, index) => page.drawText(item, { x, y: y - index * leading, size, font: options.font ?? body, color: options.color ?? ink }));
    return y - lines.length * leading;
  }

  const cover = pdf.addPage([612, 792]);
  cover.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: paper });
  cover.drawRectangle({ x: 0, y: 610, width: 612, height: 182, color: ink });
  cover.drawCircle({ x: 548, y: 748, size: 92, borderWidth: 18, borderColor: rgb(0.81, 0.35, 0.21), opacity: 0.34 });
  cover.drawText('STUDENTS FEEDING STUDENTS', { x: 44, y: 738, size: 9, font: bold, color: rgb(0.91, 0.80, 0.72) });
  cover.drawText('Monthly board report', { x: 44, y: 683, size: 31, font: bold, color: rgb(1, 0.98, 0.95) });
  cover.drawText(month, { x: 44, y: 650, size: 17, font: body, color: rgb(0.81, 0.73, 0.67) });
  if (draft) cover.drawText('DRAFT · REVIEW MODE · NOT FOR DISTRIBUTION', { x: 44, y: 578, size: 9, font: bold, color: rust });
  cover.drawText('AT A GLANCE', { x: 44, y: 536, size: 8, font: bold, color: rust });
  const metrics = [
    [Number(monthly?.checks ?? 0).toLocaleString(), 'cabinet checks this month'],
    [Number(monthly?.empty_reports ?? 0).toLocaleString(), 'checks that found an empty cabinet'],
    [String(monthly?.completed_tasks ?? 0), 'assignments completed this month'],
    [(Number(monthly?.donation_cents ?? 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }), 'donations entered this month'],
  ];
  metrics.forEach(([value, label], index) => {
    const x = 44 + (index % 2) * 264;
    const y = 486 - Math.floor(index / 2) * 96;
    cover.drawText(value, { x, y, size: 26, font: bold, color: ink });
    cover.drawText(label, { x, y: y - 19, size: 9, font: body, color: muted });
  });
  cover.drawLine({ start: { x: 44, y: 290 }, end: { x: 568, y: 290 }, thickness: 1, color: line });
  cover.drawText('EXECUTIVE HANDOFF', { x: 44, y: 264, size: 8, font: bold, color: rust });
  const summary = `${Number(monthly?.checks ?? 0)} cabinet checks were recorded during ${month}; ${Number(monthly?.empty_reports ?? 0)} found a cabinet empty. The program completed ${Number(monthly?.completed_tasks ?? 0)} operating assignments and recorded ${(Number(monthly?.purchase_cents ?? 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} in purchases. Figures are ${closedPeriod ? 'a closed monthly' : 'a month-to-date'} snapshot, not live cabinet status.`;
  drawParagraph(cover, summary, 44, 236, { size: 11, max: 83, leading: 16 });
  cover.drawText(`Generated ${generated.toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'long', timeStyle: 'short' })} CT`, { x: 44, y: 46, size: 8, font: body, color: muted });
  cover.drawText('Solidarity. Not charity.', { x: 430, y: 46, size: 9, font: bold, color: rust });

  const operations = pdf.addPage([612, 792]);
  header(operations, 'Cabinet operations', 2);
  let y = 684;
  operations.drawText('MONTHLY CABINET CHECKS', { x: 44, y, size: 8, font: bold, color: rust });
  y -= 26;
  for (const cabinet of cabinetRows.results) {
    const checks = Number(cabinet.checks ?? 0);
    const emptyReports = Number(cabinet.empty_reports ?? 0);
    const rate = checks ? `${Math.round((emptyReports / checks) * 100)}% found empty` : 'No checks recorded';
    operations.drawRectangle({ x: 44, y: y - 48, width: 524, height: 58, color: rgb(1, 0.995, 0.98), borderColor: line, borderWidth: .7 });
    operations.drawText(String(cabinet.name), { x: 56, y: y - 9, size: 11, font: bold, color: ink });
    operations.drawText(`${checks} checks · ${emptyReports} found empty`, { x: 56, y: y - 27, size: 8, font: body, color: muted });
    operations.drawText(rate, { x: 418, y: y - 18, size: 8.5, font: bold, color: emptyReports ? rust : ink });
    y -= 70;
  }
  y -= 6;
  operations.drawText('INTERPRETATION', { x: 44, y, size: 8, font: bold, color: rust });
  y -= 24;
  y = drawParagraph(operations, 'A found-empty rate describes what volunteers observed during checks. It does not measure how many snacks students took, how long a cabinet stayed empty, or an exact depletion time. Product-level forecasts remain gated until quantitative counts and reconciled stock movements produce enough reliable intervals.', 44, y, { size: 9, max: 98, leading: 13, color: muted });
  operations.drawText('Privacy boundary', { x: 44, y: 110, size: 9, font: bold, color: ink });
  drawParagraph(operations, 'This page excludes checker names, raw notes, volunteer schedules, cabinet locations, live status, and route instructions.', 44, 94, { size: 8.5, max: 100, leading: 12, color: muted });

  const stewardship = pdf.addPage([612, 792]);
  header(stewardship, 'Impact, stewardship & controls', 3);
  y = 682;
  stewardship.drawText('IMPACT SNAPSHOT', { x: 44, y, size: 8, font: bold, color: rust });
  y -= 35;
  const impactRows = [
    ['Verified launch-period snacks shared', Number(data.metrics.baselineSnacks).toLocaleString() + '+', 'Measured / program-approved baseline'],
    ['Students reached in week one', Number(data.metrics.baselineStudents).toLocaleString() + '+', 'Measured / program-approved baseline'],
    [`Donations entered during ${month}`, (Number(monthly?.donation_cents ?? 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }), 'Monthly ledger total'],
    [`Purchases recorded during ${month}`, (Number(monthly?.purchase_cents ?? 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }), 'Monthly ledger total'],
  ];
  for (const [label, value, method] of impactRows) {
    stewardship.drawText(label, { x: 44, y, size: 9, font: body, color: ink });
    stewardship.drawText(value, { x: 365, y, size: 10, font: bold, color: ink });
    stewardship.drawText(method, { x: 430, y, size: 7, font: body, color: muted });
    y -= 29;
    stewardship.drawLine({ start: { x: 44, y: y + 12 }, end: { x: 568, y: y + 12 }, thickness: .5, color: line });
  }
  y -= 18;
  stewardship.drawText('SYSTEM ACTIVATION', { x: 44, y, size: 8, font: bold, color: rust });
  y -= 26;
  for (const feature of featureRows.results) {
    stewardship.drawText(String(feature.label), { x: 44, y, size: 8.5, font: body, color: ink });
    stewardship.drawText(String(feature.mode).toUpperCase(), { x: 410, y, size: 8, font: bold, color: feature.mode === 'on' ? rgb(0.14, 0.42, 0.28) : feature.mode === 'review' ? rgb(0.60, 0.38, 0.12) : muted });
    if (Number(feature.requires_setup) === 1) stewardship.drawText('setup required', { x: 470, y, size: 7, font: body, color: muted });
    y -= 22;
  }
  y -= 8;
  stewardship.drawText('PRIVACY & METHODOLOGY', { x: 44, y, size: 8, font: bold, color: rust });
  y -= 22;
  drawParagraph(stewardship, 'SFS does not use cameras or track which individual students take food. This report excludes checker names, raw notes, volunteer schedules, donor identities, raw student feedback, live cabinet status, and precise routes. Donation equivalents are not described as distributed snacks until distribution evidence exists.', 44, y, { size: 8.5, max: 100, leading: 12, color: muted });
  stewardship.drawText('Prepared by SFS Mission Control · figures require human review before publication', { x: 44, y: 46, size: 8, font: body, color: muted });

  const bytes = Uint8Array.from(await pdf.save());
  return new Response(bytes.buffer, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="SFS-board-report-${selectedPeriod}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
}
