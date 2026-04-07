/**
 * Renders docs/FinTrac_FYP_Poster.html to A1 PDF (CSS @page 594mm × 841mm).
 * Uses puppeteer-core + installed Chrome or Edge (no Chromium download).
 */
import puppeteer from "puppeteer-core";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const htmlPath = path.join(repoRoot, "docs", "FinTrac_FYP_Poster.html");
const pdfPath = path.join(repoRoot, "docs", "FinTrac_FYP_Poster_A1.pdf");

function findBrowserExecutable() {
  const localApp = process.env.LOCALAPPDATA || "";
  const candidates = [
    path.join(localApp, "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

if (!fs.existsSync(htmlPath)) {
  console.error("Missing:", htmlPath);
  process.exit(1);
}

const executablePath = findBrowserExecutable();
if (!executablePath) {
  console.error("Could not find Chrome or Edge. Install Google Chrome or Microsoft Edge.");
  process.exit(1);
}

const bannerPath = path.join(repoRoot, "docs", "fyp-institutional-header.png");
if (!fs.existsSync(bannerPath)) {
  console.warn("Warning: fyp-institutional-header.png not found — banner may be missing in PDF.");
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--allow-file-access-from-files", "--disable-web-security"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 2000, deviceScaleFactor: 1 });
  await page.emulateMediaType("print");

  const fileUrl = pathToFileURL(htmlPath).href;
  await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 120000 });

  await page.addStyleTag({
    content: `.no-print { display: none !important; visibility: hidden !important; height: 0 !important; overflow: hidden !important; }`,
  });

  await page.pdf({
    path: pdfPath,
    printBackground: true,
    preferCssPageSize: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });

  console.log("Wrote:", pdfPath);
} finally {
  await browser.close();
}
