import fs from 'fs';
import path from 'path';
import zh from '../languages/zh-Hant.json';

const FORBIDDEN = [
  '專業審核通過',
  '物理治療師認可',
  '治療疼痛',
  '復健處方',
  'reviewed by a professional',
  'treatment effect',
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(tsx?|json)$/.test(name)) acc.push(p);
  }
  return acc;
}

describe('copy', () => {
  it('does not claim professional review or treatment effects', () => {
    const files = [
      ...walk(path.join(__dirname, '../src')),
      ...walk(path.join(__dirname, '../languages')),
    ];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const phrase of FORBIDDEN) {
        expect(`${file}: ${text.includes(phrase) ? phrase : ''}`).not.toContain(phrase);
      }
    }
    expect(zh.paywall.headline).toBe('自訂你的組合');
    expect(zh.paywall.body).toBe('一次買斷後可以刪除、排序、替換動作。沒有訂閱，也沒有加購。');
    expect(zh.paywall.freeNote).toBe('跟練現有組合免費。自訂組合內容：刪除、排序、替換動作需一次買斷。');
    expect(zh.paywall.once).toBe('一次買斷');
    expect(zh.settings.unlock).toBe('自訂你的組合');
    expect(zh.preview.unlock).toBe('自訂你的組合');
    expect(JSON.stringify(zh)).not.toMatch(/解鎖全部動作|免費版各姿勢有少量基礎動作|其餘動作需買斷後才能使用|符合的動作尚未解鎖/);
    expect(zh.home.safety).toBe('若疼痛、麻木、暈眩或不適，請立即停止。這不是醫療建議。');
    expect(zh.home.consult).toBe('已有傷勢、手術後、懷孕或有活動限制者，先確認內容是否適合自身情況。');
    expect(JSON.stringify(zh)).not.toMatch(/審核通過/);
    const preview = fs.readFileSync(path.join(__dirname, '../src/screens/PreviewScreen.tsx'), 'utf8');
    const player = fs.readFileSync(path.join(__dirname, '../src/screens/PlayerScreen.tsx'), 'utf8');
    const details = fs.readFileSync(path.join(__dirname, '../src/components/ExerciseDetails.tsx'), 'utf8');
    expect(details).not.toMatch(/注意事項|動作參考|ex\.cautions|Linking/);
    expect(preview).not.toMatch(/home\.consult|home\.safety/);
    expect(player).toMatch(/ExerciseDetails/);
    expect(player).not.toMatch(/home\.safety/);
    expect(player).toMatch(/shown\.name/);
  });

  it('declares App Store photo usage strings like app4 (ITMS-90683)', () => {
    const appJson = require('../app.json');
    const plist = appJson.expo.ios.infoPlist;
    expect(plist.NSPhotoLibraryUsageDescription).toBe(
      'This app does not access your photos. This text is required by a system component.',
    );
    expect(plist.NSPhotoLibraryAddUsageDescription).toBe(
      'This app does not add photos to your library. This text is required by a system component.',
    );
    expect(appJson.expo.locales).toEqual({
      en: './languages/ios/en.json',
      'zh-Hant': './languages/ios/zh-Hant.json',
      'zh-TW': './languages/ios/zh-Hant.json',
      'zh-HK': './languages/ios/zh-Hant.json',
    });
    const zhIos = require('../languages/ios/zh-Hant.json');
    const enIos = require('../languages/ios/en.json');
    expect(zhIos.NSPhotoLibraryUsageDescription).toBe('這個 App 不會使用你的照片。這段文字是系統元件需要的。');
    expect(zhIos.NSPhotoLibraryAddUsageDescription).toBe('這個 App 不會把照片加進相簿。這段文字是系統元件需要的。');
    expect(enIos.NSPhotoLibraryUsageDescription).toBe(plist.NSPhotoLibraryUsageDescription);
    expect(enIos.NSPhotoLibraryAddUsageDescription).toBe(plist.NSPhotoLibraryAddUsageDescription);
  });
});
