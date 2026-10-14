// The messages this app owns, read out of the source that asks for them.
//
// The locale generator writes these to disk, and a test asserts the shipped
// dictionaries hold exactly this set. Both read it from here on purpose: while
// the generator was the only thing that knew the real list, twenty messages
// sat in the UI with no dictionary entry at all, falling back to English in
// all twenty-three other languages, and every test stayed green because they
// only ever compared the languages against each other.
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Resolved against the repository, so the answer does not depend on the cwd. */
export const at = (relative) => path.join(repo, relative);
const read = (relative) => fs.readFileSync(at(relative), 'utf8');
const parse = (relative, kind) =>
  ts.createSourceFile(relative, read(relative), ts.ScriptTarget.Latest, true, kind);

/**
 * Maps English source text to its Chinese translation, or to '' for messages
 * the code states without one (thrown errors, catalog entries), which the
 * generator then seeds from the website's dictionaries.
 */
export function ownedMessages() {
  const pairs = {};

  // Every L("english", "中文") in the renderer.
  const sf = parse('src/renderer/main.tsx', ts.ScriptKind.TSX);
  (function visit(n) {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === 'L' && n.arguments.every(a => ts.isStringLiteral(a)))
      pairs[n.arguments[0].text] = n.arguments[1]?.text || n.arguments[0].text;
    ts.forEachChild(n, visit);
  })(sf);

  // Messages no L() call can express: native menus, and anything carrying a
  // {placeholder}, since those calls pass a values object and not two literals.
  Object.assign(pairs,{
'Preparing pages…':'正在准备页面…','Exporting batch':'正在批量导出',
'Design':'设计条码','Batch data':'批量数据','Labels & print':'标签与打印','Project library':'项目库','Read a barcode':'识别条码',
'Language':'语言','Language follows your system on first launch.':'首次启动时按系统语言选择。','Search languages':'搜索语言',
'Close':'关闭','Zoom out':'缩小','Zoom in':'放大','Select visible rows':'选择当前可见行','Select row {number}':'选择第 {number} 行','Data row {number}':'第 {number} 行数据','Name row {number}':'第 {number} 行名称','Copies row {number}':'第 {number} 行份数','Format row {number}':'第 {number} 行格式','Batch export format':'批量导出格式','Label preset':'标签预设','Dismiss error':'关闭错误提示',
'A4 · 21 labels':'A4 · 21 个标签','A4 · 24 labels':'A4 · 24 个标签','US Letter · 30 labels':'US Letter · 30 个标签','Thermal · 100 × 150 mm':'热敏 · 100 × 150 mm','Thermal · 50 × 30 mm':'热敏 · 50 × 30 mm',
'File':'文件','Edit':'编辑','View':'视图','New project':'新建项目','Open project…':'打开项目…','Save project…':'保存项目…','Import data…':'导入数据…','Print labels…':'打印标签…','BarcodeMate project':'BarcodeMate 项目','CSV / TSV / text':'CSV / TSV / 文本','Cut':'剪切','Copy':'复制','Paste':'粘贴','Select all':'全选','Actual size':'实际尺寸','Zoom in':'放大','Zoom out':'缩小','Toggle full screen':'切换全屏','Quit BarcodeMate':'退出 BarcodeMate','Hide BarcodeMate':'隐藏 BarcodeMate',
'Untitled project':'未命名项目','Inventory label':'库存标签',
'Enter {short} digits, or {full} with a check digit.':'请输入 {short} 位数字，或包含校验位的 {full} 位数字。','Check digit should be {digit}.':'校验位应为 {digit}。','Module width aligned to {dots} printer dots ({width} mm).':'模块宽度已对齐到 {dots} 个打印点（{width} mm）。','Row {number}: {message}':'第 {number} 行：{message}','Row {number}: quantity must be an integer from 1 to 10,000.':'第 {number} 行：份数必须是 1 到 10,000 的整数。','“{name}” is larger than the label at its actual size. Reduce module width or height, or choose a larger label.':'“{name}”的实际尺寸大于标签，请减小模块宽度或高度，或选择更大的标签。',
'Technical details: {detail}':'技术详情：{detail}',
'These values all have {digits} digits, which matches {name} rather than {current}.':'这些数据都是 {digits} 位数字，更像 {name} 而不是 {current}。','Switch to {name}':'切换为 {name}',
});

  // Thrown messages and warnings, which reach people through the error line.
  const owned=['src/renderer/main.tsx','src/core/barcode.ts','src/core/batch.ts','src/core/model.ts','src/core/assistants.ts','src/renderer/export.ts','electron/main.ts'];
  for(const f of owned){const text=fs.readFileSync(at(f),'utf8'),sf=ts.createSourceFile(f,text,ts.ScriptTarget.Latest,true,f.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(sf)==='Error'&&n.arguments.length&&ts.isStringLiteral(n.arguments[0]))pairs[n.arguments[0].text]??='';if(ts.isCallExpression(n)&&n.expression.getText(sf)==='warnings.push')for(const a of n.arguments)if(ts.isStringLiteral(a))pairs[a.text]??='';ts.forEachChild(n,walk);}walk(sf)}

  // Catalog prose: every format's one-line usage, hint and category.
  for (const type of JSON.parse(read('src/core/catalog.json')))
    for (const key of ['usage', 'hint', 'category']) if (type[key]) pairs[type[key]] ??= '';
  return pairs;
}
