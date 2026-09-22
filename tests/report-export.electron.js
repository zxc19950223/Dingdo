const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { app, BrowserWindow } = require('electron');

const {
  buildTodoReportHtml,
  buildTodoReportDocx,
} = require('../report-export');

const report = {
  title: '导出冒烟测试',
  scopeLabel: '当前名录 · 工作及子名录',
  generatedAt: '2026-09-21T10:00:00.000Z',
  summary: [
    { label: '任务总数', value: '1' },
    { label: '受阻', value: '1' },
  ],
  tasks: [{
    title: '提交材料',
    listPath: '工作',
    status: '受阻',
    priority: '高',
    deadline: '2026-09-22T10:00:00.000Z',
    blockReasonType: '等待别人',
    blockReason: '等待客户签字',
    nextAction: '明天上午联系客户',
    notes: '材料已经整理完成。',
    subtasks: [{ text: '整理材料', done: true }],
    activity: [{ at: '2026-09-21T09:00:00.000Z', message: '标记受阻' }],
  }],
};

async function main() {
  await app.whenReady();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-report-export-'));
  const htmlPath = path.join(directory, 'report.html');
  const pdfPath = path.join(directory, 'report.pdf');
  const docxPath = path.join(directory, 'report.docx');
  let reportWindow = null;
  try {
    fs.writeFileSync(htmlPath, buildTodoReportHtml(report));
    reportWindow = new BrowserWindow({
      width: 900,
      height: 1200,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    await reportWindow.loadFile(htmlPath);
    const pdf = await reportWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      preferCSSPageSize: true,
    });
    fs.writeFileSync(pdfPath, pdf);
    const docx = buildTodoReportDocx(report);
    fs.writeFileSync(docxPath, docx);

    const pdfBytes = fs.readFileSync(pdfPath);
    assert.equal(pdfBytes.subarray(0, 4).toString('ascii'), '%PDF');
    assert.ok(pdfBytes.length > 1000);
    const zip = new AdmZip(docxPath);
    assert.ok(zip.getEntry('word/document.xml'));
    assert.match(zip.readAsText('word/document.xml'), /等待客户签字/);
    console.log('Todo report PDF and DOCX checks passed');
  } finally {
    if (reportWindow && !reportWindow.isDestroyed()) reportWindow.destroy();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

main().then(() => app.quit()).catch((error) => {
  console.error(error);
  app.exit(1);
});
