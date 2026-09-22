const test = require('node:test');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');

const {
  normalizeTodoReport,
  suggestedReportFileName,
  buildTodoReportHtml,
  buildTodoReportDocx,
} = require('../report-export');

const report = {
  title: '项目 A 待办报告',
  scopeLabel: '当前名录 · 工作 / 项目 A及子名录',
  generatedAt: '2026-09-21T10:00:00.000Z',
  summary: [
    { label: '任务总数', value: '2' },
    { label: '受阻', value: '1' },
  ],
  tasks: [{
    title: '提交项目材料',
    listPath: '工作 / 项目 A',
    status: '受阻',
    priority: '紧急',
    createdAt: '2026-09-20T08:00:00.000Z',
    deadline: '2026-09-21T12:00:00.000Z',
    blockReasonType: '等待别人',
    blockReason: '等待客户签字',
    nextAction: '明天上午联系客户',
    notes: '材料已经整理完成。',
    subtasks: [{ text: '整理材料', done: true }],
    activity: [{ at: '2026-09-21T09:00:00.000Z', message: '标记受阻' }],
  }],
};

test('todo reports normalize bounded content and produce stable file names', () => {
  const normalized = normalizeTodoReport(report);
  assert.equal(normalized.tasks.length, 1);
  assert.equal(normalized.tasks[0].blockReasonType, '等待别人');
  assert.equal(suggestedReportFileName(normalized, 'pdf'), '项目 A 待办报告-2026-09-21.pdf');
  assert.equal(suggestedReportFileName({ ...report, title: 'A/B:C' }, 'docx'), 'A-B-C-2026-09-21.docx');
});

test('todo report HTML contains summary tables and task details', () => {
  const html = buildTodoReportHtml(report);
  assert.match(html, /任务汇总/);
  assert.match(html, /等待别人：等待客户签字/);
  assert.match(html, /明天上午联系客户/);
  assert.match(html, /提交项目材料/);
  assert.match(html, /活动记录/);
});

test('todo report DOCX is a real OOXML document with expected content', () => {
  const buffer = buildTodoReportDocx(report);
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().map((entry) => entry.entryName);
  assert.ok(entries.includes('[Content_Types].xml'));
  assert.ok(entries.includes('word/document.xml'));
  assert.ok(entries.includes('word/styles.xml'));
  const documentXml = zip.readAsText('word/document.xml');
  assert.match(documentXml, /项目 A 待办报告/);
  assert.match(documentXml, /等待别人：等待客户签字/);
  assert.match(documentXml, /明天上午联系客户/);
});
