const AdmZip = require('adm-zip');

const MAX_REPORT_TASKS = 500;
const MAX_SUBTASKS_PER_TASK = 200;
const MAX_ACTIVITY_PER_TASK = 500;

function cleanText(value, maxLength = 2000) {
  return Array.from(String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim())
    .slice(0, maxLength)
    .join('');
}

function cleanSingleLine(value, maxLength = 300) {
  return cleanText(value, maxLength).replace(/\s+/g, ' ');
}

function normalizeDateValue(value) {
  if (!value) return '';
  const timestamp = Number(value);
  const parsed = Number.isFinite(timestamp) && timestamp > 0
    ? timestamp
    : Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

function normalizeReportEntry(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    label: cleanSingleLine(source.label, 60),
    value: cleanText(source.value, 2000),
  };
}

function normalizeReportSubtask(value) {
  const source = value && typeof value === 'object' ? value : {};
  const text = cleanSingleLine(source.text || source.title, 240);
  if (!text) return null;
  return {
    text,
    done: source.done === true,
  };
}

function normalizeReportActivity(value) {
  const source = value && typeof value === 'object' ? value : {};
  const message = cleanText(source.message || source.text, 500);
  if (!message) return null;
  return {
    at: normalizeDateValue(source.at),
    message,
  };
}

function normalizeReportTask(value, index = 0) {
  const source = value && typeof value === 'object' ? value : {};
  const title = cleanSingleLine(source.title || source.text, 240);
  if (!title) return null;
  return {
    index: index + 1,
    title,
    listPath: cleanSingleLine(source.listPath, 160),
    status: cleanSingleLine(source.status, 40) || '待办',
    priority: cleanSingleLine(source.priority, 40) || '无',
    createdAt: normalizeDateValue(source.createdAt),
    startAt: normalizeDateValue(source.startAt),
    deadline: normalizeDateValue(source.deadline),
    completedAt: normalizeDateValue(source.completedAt),
    reminders: cleanSingleLine(source.reminders, 500),
    strongReminder: cleanSingleLine(source.strongReminder, 200),
    blockReasonType: cleanSingleLine(source.blockReasonType, 80),
    blockReason: cleanText(source.blockReason, 2000),
    nextAction: cleanText(source.nextAction, 1200),
    notes: cleanText(source.notes, 12000),
    subtasks: (Array.isArray(source.subtasks) ? source.subtasks : [])
      .map(normalizeReportSubtask)
      .filter(Boolean)
      .slice(0, MAX_SUBTASKS_PER_TASK),
    activity: (Array.isArray(source.activity) ? source.activity : [])
      .map(normalizeReportActivity)
      .filter(Boolean)
      .slice(-MAX_ACTIVITY_PER_TASK),
  };
}

function normalizeTodoReport(value) {
  const source = value && typeof value === 'object' ? value : {};
  const tasks = (Array.isArray(source.tasks) ? source.tasks : [])
    .map((task, index) => normalizeReportTask(task, index))
    .filter(Boolean)
    .slice(0, MAX_REPORT_TASKS);
  return {
    title: cleanSingleLine(source.title, 160) || '待办报告',
    scopeLabel: cleanSingleLine(source.scopeLabel, 160),
    generatedAt: normalizeDateValue(source.generatedAt) || new Date().toISOString(),
    summary: (Array.isArray(source.summary) ? source.summary : [])
      .map(normalizeReportEntry)
      .filter((item) => item.label && item.value)
      .slice(0, 20),
    tasks,
  };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDateTime(value) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(' ');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value) {
  return escapeHtml(value).replace(/\n/g, '&#10;');
}

function multilineHtml(value) {
  return escapeHtml(value).replace(/\n/g, '<br />');
}

function safeFilePart(value, fallback = '待办') {
  const cleaned = cleanSingleLine(value, 60)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[.\s-]+$/g, '');
  return cleaned || fallback;
}

function suggestedReportFileName(report, extension) {
  const normalized = normalizeTodoReport(report);
  const date = normalized.generatedAt.slice(0, 10);
  const base = safeFilePart(normalized.title, '待办报告');
  return `${base}-${date}.${extension}`;
}

function taskReasonSummary(task) {
  if (!task.blockReasonType && !task.blockReason) return '';
  return [task.blockReasonType, task.blockReason]
    .filter(Boolean)
    .join('：');
}

function reportDetailRows(task) {
  return [
    ['所属名录', task.listPath],
    ['状态', task.status],
    ['优先级', task.priority],
    ['创建时间', formatDateTime(task.createdAt)],
    ['开始时间', formatDateTime(task.startAt)],
    ['截止时间', formatDateTime(task.deadline)],
    ['完成时间', formatDateTime(task.completedAt)],
    ['普通提醒', task.reminders],
    ['强提醒', task.strongReminder],
    ['受阻类型', task.blockReasonType],
    ['受阻原因', task.blockReason],
    ['下一步', task.nextAction],
  ].filter(([, value]) => value);
}

function buildTodoReportHtml(value) {
  const report = normalizeTodoReport(value);
  const generatedAt = formatDateTime(report.generatedAt);
  const summaryRows = report.summary.map((item) => `
    <div class="summary-item">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
    </div>
  `).join('');
  const overviewRows = report.tasks.map((task) => `
    <tr>
      <td class="center">${task.index}</td>
      <td><strong>${escapeHtml(task.title)}</strong></td>
      <td>${escapeHtml(task.status)}</td>
      <td>${escapeHtml(formatDateTime(task.deadline))}</td>
      <td>${multilineHtml(taskReasonSummary(task))}</td>
      <td>${multilineHtml(task.nextAction)}</td>
    </tr>
  `).join('');
  const detailBlocks = report.tasks.map((task) => {
    const rows = reportDetailRows(task).map(([label, rowValue]) => `
      <tr>
        <th>${escapeHtml(label)}</th>
        <td>${multilineHtml(rowValue)}</td>
      </tr>
    `).join('');
    const subtasks = task.subtasks.length
      ? `
        <h3>子任务</h3>
        <table class="detail-table">
          <thead><tr><th>状态</th><th>子任务</th></tr></thead>
          <tbody>
            ${task.subtasks.map((subtask) => `
              <tr>
                <td class="center">${subtask.done ? '已完成' : '未完成'}</td>
                <td>${escapeHtml(subtask.text)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
      : '';
    const activity = task.activity.length
      ? `
        <h3>活动记录</h3>
        <table class="detail-table">
          <thead><tr><th>时间</th><th>记录</th></tr></thead>
          <tbody>
            ${task.activity.map((entry) => `
              <tr>
                <td class="nowrap">${escapeHtml(formatDateTime(entry.at))}</td>
                <td>${multilineHtml(entry.message)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
      : '';
    return `
      <section class="task-detail">
        <h2>${task.index}. ${escapeHtml(task.title)}</h2>
        <table class="detail-table detail-fields">${rows}</table>
        ${task.notes ? `<h3>备注</h3><div class="long-text">${multilineHtml(task.notes)}</div>` : ''}
        ${subtasks}
        ${activity}
      </section>
    `;
  }).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.title)}</title>
  <style>
    @page { size: A4; margin: 15mm 14mm 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1f2937;
      background: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 10.5pt;
      line-height: 1.55;
    }
    h1 { margin: 0 0 4px; font-size: 24pt; line-height: 1.25; }
    h2 { margin: 0 0 12px; padding-bottom: 7px; border-bottom: 1px solid #d9dee7; font-size: 15pt; }
    h3 { margin: 17px 0 7px; font-size: 11.5pt; }
    p { margin: 0; }
    .meta { margin-bottom: 20px; color: #657083; font-size: 9.5pt; }
    .summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; margin: 16px 0 22px; }
    .summary-item { min-height: 58px; padding: 9px 10px; border: 1px solid #dce2eb; border-radius: 8px; background: #f7f9fc; }
    .summary-item span { display: block; color: #6b7280; font-size: 8.5pt; }
    .summary-item strong { display: block; margin-top: 4px; color: #111827; font-size: 15pt; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { padding: 7px 8px; border: 1px solid #d8dee8; vertical-align: top; word-break: break-word; }
    thead th { background: #eef2f7; color: #374151; font-size: 9pt; text-align: left; }
    tbody tr:nth-child(even) td { background: #fafbfd; }
    .center { text-align: center; }
    .nowrap { white-space: nowrap; }
    .overview td { font-size: 9pt; }
    .task-detail { break-inside: avoid-page; margin-top: 26px; }
    .task-detail + .task-detail { padding-top: 8px; border-top: 2px solid #edf0f5; }
    .detail-fields th { width: 23%; background: #f5f7fa; text-align: left; }
    .long-text { padding: 9px 10px; border: 1px solid #d8dee8; border-radius: 7px; background: #fbfcfe; white-space: normal; }
    @media print {
      .task-detail { page-break-inside: avoid; }
      .overview tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(report.title)}</h1>
  <div class="meta">
    ${report.scopeLabel ? `范围：${escapeHtml(report.scopeLabel)} · ` : ''}
    导出时间：${escapeHtml(generatedAt)}
  </div>
  ${summaryRows ? `<div class="summary">${summaryRows}</div>` : ''}
  <h2>任务汇总</h2>
  <table class="overview">
    <colgroup>
      <col style="width: 5%" /><col style="width: 25%" /><col style="width: 10%" />
      <col style="width: 15%" /><col style="width: 25%" /><col style="width: 20%" />
    </colgroup>
    <thead>
      <tr><th>序号</th><th>待办</th><th>状态</th><th>截止时间</th><th>原因摘要</th><th>下一步</th></tr>
    </thead>
    <tbody>${overviewRows || '<tr><td colspan="6" class="center">没有符合条件的待办</td></tr>'}</tbody>
  </table>
  <h2 style="margin-top: 26px;">任务明细</h2>
  ${detailBlocks || '<p>没有符合条件的待办。</p>'}
</body>
</html>`;
}

function xmlText(value) {
  return escapeXml(value).replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
}

function wordRun(text, options = {}) {
  const properties = [
    options.bold ? '<w:b/>' : '',
    options.color ? `<w:color w:val="${options.color.replace('#', '')}"/>` : '',
    options.size ? `<w:sz w:val="${Math.round(options.size * 2)}"/>` : '',
    '<w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="等线"/>',
  ].join('');
  return `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${xmlText(text)}</w:t></w:r>`;
}

function wordParagraph(text, options = {}) {
  const properties = [
    options.align ? `<w:jc w:val="${options.align}"/>` : '',
    options.pageBreakBefore ? '<w:pageBreakBefore/>' : '',
    options.spacingBefore !== undefined
      ? `<w:spacing w:before="${Math.max(0, Number(options.spacingBefore) || 0)}" w:after="${Math.max(0, Number(options.spacingAfter) || 0)}"/>`
      : '',
    options.shade ? `<w:shd w:val="clear" w:fill="${options.shade.replace('#', '')}"/>` : '',
  ].join('');
  return `<w:p><w:pPr>${properties}</w:pPr>${wordRun(text, options)}</w:p>`;
}

function wordTable(rows, widths, options = {}) {
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('');
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((cell, cellIndex) => {
      const isHeader = options.header === true && rowIndex === 0;
      const shading = isHeader ? '<w:shd w:val="clear" w:fill="EEF2F7"/>' : '';
      const content = String(cell ?? '').split('\n').map((line) => wordParagraph(line, {
        bold: isHeader,
        size: options.fontSize || 9.5,
      })).join('');
      return `<w:tc><w:tcPr><w:tcW w:w="${widths[cellIndex] || 2000}" w:type="dxa"/>${shading}<w:vAlign w:val="top"/></w:tcPr>${content}</w:tc>`;
    }).join('');
    return `<w:tr>${cells}</w:tr>`;
  }).join('');
  const borders = `
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="D8DEE8"/>
      <w:left w:val="single" w:sz="4" w:color="D8DEE8"/>
      <w:bottom w:val="single" w:sz="4" w:color="D8DEE8"/>
      <w:right w:val="single" w:sz="4" w:color="D8DEE8"/>
      <w:insideH w:val="single" w:sz="4" w:color="D8DEE8"/>
      <w:insideV w:val="single" w:sz="4" w:color="D8DEE8"/>
    </w:tblBorders>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

function buildTodoReportDocx(value) {
  const report = normalizeTodoReport(value);
  const generatedAt = formatDateTime(report.generatedAt);
  const documentParts = [
    wordParagraph(report.title, { bold: true, size: 22, color: '#111827', spacingAfter: 80 }),
    wordParagraph([
      report.scopeLabel ? `范围：${report.scopeLabel}` : '',
      `导出时间：${generatedAt}`,
    ].filter(Boolean).join(' · '), { size: 9.5, color: '#657083', spacingAfter: 180 }),
  ];
  if (report.summary.length) {
    documentParts.push(
      wordParagraph('统计摘要', { bold: true, size: 14, color: '#111827', spacingBefore: 120, spacingAfter: 100 }),
      wordTable(
        [['项目', '数量'], ...report.summary.map((item) => [item.label, item.value])],
        [5200, 3600],
        { header: true, fontSize: 10 }
      ),
      wordParagraph('', { size: 1, spacingAfter: 100 })
    );
  }
  documentParts.push(
    wordParagraph('任务汇总', { bold: true, size: 14, color: '#111827', spacingBefore: 120, spacingAfter: 100 }),
    wordTable([
      ['序号', '待办', '状态', '截止时间', '原因摘要', '下一步'],
      ...report.tasks.map((task) => [
        String(task.index),
        task.title,
        task.status,
        formatDateTime(task.deadline),
        taskReasonSummary(task),
        task.nextAction,
      ]),
    ], [650, 2200, 900, 1500, 2100, 1450], { header: true, fontSize: 8.5 })
  );
  if (report.tasks.length) {
    documentParts.push(
      wordParagraph('任务明细', { bold: true, size: 14, color: '#111827', pageBreakBefore: true, spacingAfter: 130 })
    );
    report.tasks.forEach((task) => {
      documentParts.push(
        wordParagraph(`${task.index}. ${task.title}`, { bold: true, size: 13, color: '#111827', spacingBefore: 120, spacingAfter: 90 })
      );
      const detailRows = reportDetailRows(task);
      if (detailRows.length) {
        documentParts.push(wordTable(
          detailRows.map(([label, rowValue]) => [label, rowValue]),
          [1900, 6900],
          { header: false, fontSize: 9.5 }
        ));
      }
      if (task.notes) {
        documentParts.push(
          wordParagraph('备注', { bold: true, size: 11.5, spacingBefore: 130, spacingAfter: 60 }),
          wordParagraph(task.notes, { size: 10 })
        );
      }
      if (task.subtasks.length) {
        documentParts.push(
          wordParagraph('子任务', { bold: true, size: 11.5, spacingBefore: 130, spacingAfter: 60 }),
          wordTable(
            [['状态', '子任务'], ...task.subtasks.map((subtask) => [subtask.done ? '已完成' : '未完成', subtask.text])],
            [1300, 7500],
            { header: true, fontSize: 9.5 }
          )
        );
      }
      if (task.activity.length) {
        documentParts.push(
          wordParagraph('活动记录', { bold: true, size: 11.5, spacingBefore: 130, spacingAfter: 60 }),
          wordTable(
            [['时间', '记录'], ...task.activity.map((entry) => [formatDateTime(entry.at), entry.message])],
            [1800, 7000],
            { header: true, fontSize: 9 }
          )
        );
      }
    });
  } else {
    documentParts.push(wordParagraph('没有符合条件的待办。', { size: 10.5 }));
  }
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${documentParts.join('')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="850" w:right="794" w:bottom="850" w:left="794" w:header="360" w:footer="360" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="等线"/><w:sz w:val="21"/></w:rPr></w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;
  const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;
  const documentRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  const coreProperties = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(report.title)}</dc:title>
  <dc:creator>Dingdo</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(report.generatedAt)}</dcterms:created>
</cp:coreProperties>`;
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(contentTypes));
  zip.addFile('_rels/.rels', Buffer.from(rootRelationships));
  zip.addFile('word/document.xml', Buffer.from(documentXml));
  zip.addFile('word/styles.xml', Buffer.from(stylesXml));
  zip.addFile('word/_rels/document.xml.rels', Buffer.from(documentRelationships));
  zip.addFile('docProps/core.xml', Buffer.from(coreProperties));
  return zip.toBuffer();
}

module.exports = {
  MAX_REPORT_TASKS,
  normalizeTodoReport,
  suggestedReportFileName,
  buildTodoReportHtml,
  buildTodoReportDocx,
};
