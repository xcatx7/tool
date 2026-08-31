// generate-manifest.js
// 掃描 tools/ 底下每個資料夾，找出裡面的 index.html，
// 並用 git log 抓「第一次被 commit 的日期」當作上傳日期。
// 如果該工具還沒 commit 過（新增但還沒 git add/commit），
// 會 fallback 用檔案的最後修改時間。
//
// 用法： node generate-manifest.js

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const TOOLS_DIR = path.join(__dirname, "tools");
const OUTPUT = path.join(__dirname, "manifest.json");

function getGitFirstCommitDate(relPath) {
  try {
    const out = execSync(
      `git log --follow --diff-filter=A --format=%ad --date=short -- "${relPath}"`,
      { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] }
    )
      .toString()
      .trim();
    const lines = out.split("\n").filter(Boolean);
    if (lines.length) return lines[lines.length - 1]; // 最早的一筆
  } catch (e) {
    // 不是 git repo 或指令失敗，忽略，往下 fallback
  }
  return null;
}

function getFileMtime(fullPath) {
  const stat = fs.statSync(fullPath);
  return stat.mtime.toISOString().slice(0, 10);
}

function readMeta(folderFull) {
  const metaPath = path.join(folderFull, "meta.json");
  if (fs.existsSync(metaPath)) {
    try {
      return JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch (e) {
      console.warn(`⚠️  meta.json 格式錯誤：${metaPath}`);
    }
  }
  return {};
}

function main() {
  if (!fs.existsSync(TOOLS_DIR)) {
    console.error("找不到 tools/ 資料夾");
    process.exit(1);
  }

  const folders = fs
    .readdirSync(TOOLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  const tools = [];

  for (const dir of folders) {
    const folderName = dir.name;
    const folderFull = path.join(TOOLS_DIR, folderName);
    const indexFull = path.join(folderFull, "index.html");

    if (!fs.existsSync(indexFull)) {
      console.warn(`⚠️  跳過 ${folderName}：裡面沒有 index.html`);
      continue;
    }

    const meta = readMeta(folderFull);
    const relIndexPath = path
      .relative(__dirname, indexFull)
      .split(path.sep)
      .join("/");

    const gitDate = getGitFirstCommitDate(relIndexPath);
    const date = meta.date || gitDate || getFileMtime(indexFull);

    tools.push({
      name: meta.name || folderName,
      date,
      path: `tools/${folderName}/index.html`,
    });
  }

  tools.sort((a, b) => (a.date < b.date ? 1 : -1)); // 新到舊

  fs.writeFileSync(OUTPUT, JSON.stringify(tools, null, 2), "utf8");
  console.log(`✅ 已產生 manifest.json，共 ${tools.length} 個工具`);
}

main();
