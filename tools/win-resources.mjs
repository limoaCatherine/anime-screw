// 用 resedit (纯 JavaScript PE 资源编辑器) 写入 Windows exe 的图标与版本信息，Linux 上无需 wine。
import { promises as fs } from 'node:fs';
import * as ResEdit from 'resedit';

const LANG_ZH_CN = 2052;   // 简体中文
const LANG_EN_US = 1033;
const CODEPAGE_UNICODE = 1200;

function parseVersion(v) {
  const [a = 0, b = 0, c = 0, d = 0] = String(v).split('.').map((n) => parseInt(n, 10) || 0);
  return [a, b, c, d];
}

export async function embedWinResources(exePath, icoPath, app) {
  const data = await fs.readFile(exePath);
  const exe = ResEdit.NtExecutable.from(data, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);

  // 图标：替换 exe 内已有的主图标组 (保持原 ID，Explorer 用第一个图标组)
  const iconFile = ResEdit.Data.IconFile.from(await fs.readFile(icoPath));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const groupLang = groups.length ? groups[0].lang : LANG_EN_US;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, groupId, groupLang, iconFile.icons.map((i) => i.data),
  );

  // 版本信息
  const [a, b, c, d] = parseVersion(app.version);
  const versions = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const vi = versions.length ? versions[0] : ResEdit.Resource.VersionInfo.createEmpty();
  // 清除原有语言块，写入中文与英文两份字符串
  for (const lang of vi.getAllLanguagesForStringValues()) vi.removeAllStringValues(lang);
  vi.setFileVersion(a, b, c, d, LANG_EN_US);
  vi.setProductVersion(a, b, c, d, LANG_EN_US);
  const strings = {
    ProductName: app.productName,
    FileDescription: app.productName,
    CompanyName: app.company,
    LegalCopyright: app.copyright,
    OriginalFilename: `${app.exeName}.exe`,
    InternalName: app.exeName,
    ProductVersion: app.version,
    FileVersion: app.version,
    Comments: app.description,
  };
  for (const lang of [LANG_ZH_CN, LANG_EN_US]) {
    vi.setStringValues({ lang, codepage: CODEPAGE_UNICODE }, strings);
  }
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  await fs.writeFile(exePath, Buffer.from(exe.generate()));
}
