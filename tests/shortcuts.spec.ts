import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { settled } from "./profile";
test('scenario shortcuts persist, follow the interface language, and can be removed without opening a tool',async()=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'barcodemate-shortcuts-'));
 await settled(temp);
 const app=await electron.launch({...process.env.BARCODEMATE_EXECUTABLE?{executablePath:process.env.BARCODEMATE_EXECUTABLE,args:[]}:{args:['.']},env:{...process.env,BARCODEMATE_TEST_DIR:temp}});
 try {
  const p=await app.firstWindow();await p.locator('#language-select').selectOption('zh-Hans');await p.locator('[data-workspace=scenarios]').click();
  for(const id of ['home','warehouse','supermarket'])await p.locator(`[data-pin-case=${id}]`).click();
  await expect(p.locator('.rail [data-shortcut]')).toHaveCount(3);
  await p.locator('[data-pin-case=home]').click();await expect(p.locator('.rail [data-shortcut]')).toHaveCount(3);
  await p.reload();await expect(p.locator('.rail [data-shortcut]')).toHaveCount(3);
  await p.locator('.rail [data-shortcut=warehouse] > .nav-item').click();await expect(p.locator('.wh-root')).toBeVisible();
  await p.locator('#language-select').selectOption('en');await expect(p.locator('.rail [data-shortcut=home] > .nav-item')).toHaveText('Home organization');
  await p.locator('.rail [data-shortcut=home] > .nav-item').click();await expect(p.locator('.hm-editor > section')).toHaveCount(2);
  await expect(p.locator('.hm-voice svg rect')).toHaveAttribute('rx','3');
  const layout=await p.locator('.hm-grid').evaluate(e=>{const editor=e.querySelector('.hm-editor')!.getBoundingClientRect(),preview=e.querySelector('.hm-preview-panel')!.getBoundingClientRect();return {top:Math.abs(editor.top-preview.top),side:preview.left>=editor.right};});expect(layout.top).toBeLessThan(1);expect(layout.side).toBe(true);
  await p.locator('.rail [data-shortcut=home]').hover();await p.locator('.rail [data-shortcut=home] .bm-shortcut-remove').click();await expect(p.locator('.rail [data-shortcut=home]')).toHaveCount(0);await expect(p.locator('.hm-editor')).toBeVisible();
  await p.reload();await expect(p.locator('.rail [data-shortcut]')).toHaveCount(2);
 }finally{await app.close();}
});
