// Write the owned messages to the bundled dictionaries. Translations ship with
// the app and are never requested at runtime.
import fs from 'node:fs';
import { ownedMessages, at } from './messages.mjs';
const root = at('src/i18n');
fs.mkdirSync(root, { recursive: true });
const pairs = ownedMessages();
const languages=JSON.parse(fs.readFileSync(root+'/languages.json'));fs.writeFileSync(root+'/languages.json',JSON.stringify(languages,null,2)+'\n');
const webEn=fs.existsSync(at('../src/main/resources/i18n/en.json')) ? JSON.parse(fs.readFileSync(at('../src/main/resources/i18n/en.json'))) : {};const bySource=Object.fromEntries(Object.entries(webEn).map(([key,value])=>[value,key]));
for(const {code} of languages){const web=fs.existsSync(at(`../src/main/resources/i18n/${code}.json`)) ? JSON.parse(fs.readFileSync(at(`../src/main/resources/i18n/${code}.json`))) : {};let old={};try{old=JSON.parse(fs.readFileSync(`${root}/${code}.json`))}catch{}const d={};for(const [en,zh] of Object.entries(pairs)){
 if(code==='en')d[en]=en;else if(code==='zh-Hans'&&zh)d[en]=zh;else if(old[en])d[en]=old[en];else if(bySource[en])d[en]=web[bySource[en]];
 }fs.writeFileSync(`${root}/${code}.json`,JSON.stringify(d,null,2)+'\n');}
console.log(Object.keys(pairs).length+' owned messages; seeded from existing website translations.');
