// Extract owned UI messages; translations are bundled and never requested at runtime.
import ts from 'typescript';import fs from 'node:fs';
const root='src/i18n';fs.mkdirSync(root,{recursive:true});const pairs={};
const source=fs.readFileSync('src/renderer/main.tsx','utf8');const sf=ts.createSourceFile('main.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(sf)==='L'&&n.arguments.every(a=>ts.isStringLiteral(a))){pairs[n.arguments[0].text]=n.arguments[1]?.text||n.arguments[0].text;}ts.forEachChild(n,visit)}visit(sf);
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
const owned=['src/renderer/main.tsx','src/core/barcode.ts','src/core/batch.ts','src/core/model.ts','src/core/assistants.ts','src/renderer/export.ts','electron/main.ts'];
for(const f of owned){const text=fs.readFileSync(f,'utf8'),sf=ts.createSourceFile(f,text,ts.ScriptTarget.Latest,true,f.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(sf)==='Error'&&n.arguments.length&&ts.isStringLiteral(n.arguments[0]))pairs[n.arguments[0].text]??='';if(ts.isCallExpression(n)&&n.expression.getText(sf)==='warnings.push')for(const a of n.arguments)if(ts.isStringLiteral(a))pairs[a.text]??='';ts.forEachChild(n,walk);}walk(sf)}
const catalog=JSON.parse(fs.readFileSync('src/core/catalog.json'));for(const t of catalog)for(const key of ['usage','hint','category'])if(t[key])pairs[t[key]]??='';
const languages=JSON.parse(fs.readFileSync(root+'/languages.json'));fs.writeFileSync(root+'/languages.json',JSON.stringify(languages,null,2)+'\n');
const webEn=fs.existsSync('../src/main/resources/i18n/en.json') ? JSON.parse(fs.readFileSync('../src/main/resources/i18n/en.json')) : {};const bySource=Object.fromEntries(Object.entries(webEn).map(([key,value])=>[value,key]));
for(const {code} of languages){const web=fs.existsSync(`../src/main/resources/i18n/${code}.json`) ? JSON.parse(fs.readFileSync(`../src/main/resources/i18n/${code}.json`)) : {};let old={};try{old=JSON.parse(fs.readFileSync(`${root}/${code}.json`))}catch{}const d={};for(const [en,zh] of Object.entries(pairs)){
 if(code==='en')d[en]=en;else if(code==='zh-Hans'&&zh)d[en]=zh;else if(old[en])d[en]=old[en];else if(bySource[en])d[en]=web[bySource[en]];
 }fs.writeFileSync(`${root}/${code}.json`,JSON.stringify(d,null,2)+'\n');}
console.log(Object.keys(pairs).length+' owned messages; seeded from existing website translations.');
