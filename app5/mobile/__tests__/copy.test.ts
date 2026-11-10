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

  it('does not render the removed home headline in any locale or screen', () => {
    const files = [
      ...walk(path.join(__dirname, '../src')),
      ...walk(path.join(__dirname, '../languages')),
    ];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text).not.toMatch(/伸展一下|Stretch a little|Take a stretch/);
    }
  });

  it('declares an honest photo-library read string and no add-only string', () => {
    const appJson = require('../app.json');
    const plist = appJson.expo.ios.infoPlist;
    const usage =
      "This app does not read your photos and does not save or export images. It would use photo library access only to copy a photo into the app when given that photo's library address.";
    expect(plist.NSPhotoLibraryUsageDescription).toBe(usage);
    expect(plist.NSPhotoLibraryAddUsageDescription).toBeUndefined();
    expect(JSON.stringify(appJson.expo.plugins)).not.toMatch(/NSPhotoLibraryAddUsageDescription|savePhotosPermission/);
    expect(appJson.expo.locales).toEqual({
      en: './languages/ios/en.json',
      'zh-Hant': './languages/ios/zh-Hant.json',
      'zh-TW': './languages/ios/zh-Hant.json',
      'zh-HK': './languages/ios/zh-Hant.json',
    });
    const zhIos = require('../languages/ios/zh-Hant.json');
    const enIos = require('../languages/ios/en.json');
    expect(zhIos.NSPhotoLibraryUsageDescription).toBe(
      '這個 App 不會讀取你的照片，也不會儲存或匯出圖片。只有在取得某張照片的相簿位址時，才會使用相簿權限把該照片複製到 App 裡。',
    );
    expect(zhIos.NSPhotoLibraryAddUsageDescription).toBeUndefined();
    expect(enIos.NSPhotoLibraryUsageDescription).toBe(plist.NSPhotoLibraryUsageDescription);
    expect(enIos.NSPhotoLibraryAddUsageDescription).toBeUndefined();
    expect(appJson.expo.ios.buildNumber).toBe('2');
    expect(appJson.expo.extra.eas.projectId).toBe('964b2a8d-f108-43c6-a7bb-a3121643aaed');
  });
});
