/**
 * Turns docs/REPORT.md into the submission PDF.
 *
 * The brief asks for a PDF or PPT "with process screenshots, key asset comparisons, or
 * final results", so the report cannot just be the markdown printed out — it needs the
 * pictures in the right places and it needs to look like a document rather than a README.
 *
 * There is no markdown library in this project and installing one was not available, so
 * the converter below handles exactly the constructs the report actually uses: headings,
 * paragraphs, emphasis, inline code, fenced code, tables, lists, blockquotes and rules.
 * It is deliberately small and deliberately not a general markdown implementation — if the
 * report grows a construct it does not know, the output will show it plainly rather than
 * failing silently, and this file is the place to add it.
 *
 * Screenshots are injected by heading, from the map below, so REPORT.md stays clean prose.
 * A missing screenshot renders as a labelled placeholder with the shot description, so an
 * incomplete set is obvious on the page instead of being a silent gap.
 *
 * Usage:  npm run report         (writes docs/PARADOX-report.html and, if Chrome is
 *                                 available, docs/PARADOX-report.pdf)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE = resolve(ROOT, "docs/REPORT.md");
const SHOT_DIR = resolve(ROOT, "docs/report-assets");
const OUT_HTML = resolve(ROOT, "docs/PARADOX-report.html");
const OUT_PDF = resolve(ROOT, "docs/PARADOX-report.pdf");

interface Shot {
  file: string;
  caption: string;
  /** Two shots sharing a row read as a before/after pair. */
  pair?: boolean;
}

/** Screenshots, keyed by the heading they should follow. */
const SHOTS: Record<string, Shot[]> = {
  "1. The idea": [
    {
      file: "01-false-floor.png",
      caption: "The gap run, seen from the start pad. The four platforms are unmade — they exist only while nobody looks at them.",
      pair: true,
    },
    {
      file: "02-looking-away.png",
      caption: "The same four platforms, with the gaze turned aside. Solid again.",
      pair: true,
    },
  ],
  "2. What we built": [
    { file: "03-race.png", caption: "Racing a rival through the gap run. The rival is the same agent that verified the round.", pair: true },
    { file: "04-gravity.png", caption: "Arena 02 after the inversion: the course finishes on the ceiling.", pair: true },
  ],
  "3.2 Assets in the game": [
    {
      file: "06-asset-lab.png",
      caption: "Asset Lab: the Lux3D contestant with its skeleton overlay and the ten retargeted clips.",
    },
  ],
  "4.2 The optimisation pass": [
    {
      file: "08-inspect-before-after.png",
      caption: "npm run inspect:asset, before and after the texture pass — 120.29 MB down to 10.75 MB.",
    },
  ],
  "5. The Reality Rule Engine": [
    {
      file: "05-briefing-card.png",
      caption: "A briefing card. The badge reads AI-designed round, and the verified line carries the probe's real completion time.",
    },
  ],
  "6.2 The control experiment": [
    {
      file: "07-probe-control.png",
      caption: "npm run probe:control — five rounds, two agents. The rule-aware agent solves every round; the agent that ignores the rules fails every one.",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Markdown                                                            */
/* ------------------------------------------------------------------ */

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Inline: code spans first, so emphasis inside them is left alone. */
function inline(text: string): string {
  const codes: string[] = [];
  let out = text.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });

  out = escapeHtml(out);
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => codes[Number(index)] ?? "");
  return out;
}

function headingText(line: string): string {
  return line.replace(/^#+\s*/, "").trim();
}

function shotsFor(heading: string): string {
  const shots = SHOTS[heading];
  if (!shots) return "";

  const figures = shots
    .map((shot) => {
      const path = resolve(SHOT_DIR, shot.file);
      const body = existsSync(path)
        ? `<img src="report-assets/${shot.file}" alt="${escapeHtml(shot.caption)}" />`
        : `<div class="missing"><span>${escapeHtml(shot.file)}</span><small>drop this screenshot into docs/report-assets/ and run npm run report again</small></div>`;
      return `<figure>${body}<figcaption>${inline(shot.caption)}</figcaption></figure>`;
    })
    .join("\n");

  const paired = shots.length > 1 && shots.every((s) => s.pair);
  return `<div class="shots${paired ? " pair" : ""}">${figures}</div>`;
}

function renderTable(rows: string[]): string {
  const cells = (row: string): string[] =>
    row
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim());

  const header = cells(rows[0] ?? "");
  const body = rows.slice(2).map(cells);
  // A header of empty strings is the report's two-column fact table; drop the empty row.
  const showHead = header.some((cell) => cell.length > 0);

  const head = showHead
    ? `<thead><tr>${header.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`
    : "";
  const rest = body
    .map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
    .join("");

  return `<table>${head}<tbody>${rest}</tbody></table>`;
}

function toHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Fenced code.
    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        body.push(lines[i] ?? "");
        i++;
      }
      i++;
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    // Table.
    if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("|")) {
        rows.push(lines[i] ?? "");
        i++;
      }
      out.push(renderTable(rows));
      continue;
    }

    // Blockquote.
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith(">")) {
        body.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${inline(body.join(" "))}</blockquote>`);
      continue;
    }

    // Lists.
    const bullet = /^[-*]\s+/;
    const numbered = /^\d+\.\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const pattern = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i] ?? "";
        if (pattern.test(current)) {
          items.push(current.replace(pattern, ""));
          i++;
        } else if (/^\s+\S/.test(current) && items.length > 0) {
          // Continuation of the previous item.
          items[items.length - 1] += ` ${current.trim()}`;
          i++;
        } else break;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`);
      continue;
    }

    // Horizontal rule.
    if (/^-{3,}$/.test(line.trim())) {
      out.push("<hr />");
      i++;
      continue;
    }

    // Heading.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const text = headingText(line);
      // Start each numbered top-level section on a fresh page.
      const major = level === 2 && /^\d+\./.test(text);
      out.push(
        `<h${level}${major ? ' class="page-break"' : ""}>${inline(heading[2] ?? "")}</h${level}>`,
      );
      out.push(shotsFor(text));
      i++;
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: markdown soft-wraps, so gather until a blank line.
    const body: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? "";
      if (
        current.trim() === "" ||
        current.startsWith("|") ||
        current.startsWith(">") ||
        current.startsWith("```") ||
        /^(#{1,6})\s+/.test(current) ||
        bullet.test(current) ||
        numbered.test(current) ||
        /^-{3,}$/.test(current.trim())
      )
        break;
      body.push(current.trim());
      i++;
    }
    out.push(`<p>${inline(body.join(" "))}</p>`);
  }

  return out.filter((chunk) => chunk.length > 0).join("\n");
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function fontFace(): string {
  // The project already ships these; reference them from node_modules if present so the
  // PDF does not depend on the network at build time.
  const faces = [
    {
      family: "Space Grotesk",
      path: "node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2",
    },
    {
      family: "JetBrains Mono",
      path: "node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
    },
  ];

  return faces
    .map(({ family, path }) => {
      const full = resolve(ROOT, path);
      if (!existsSync(full)) return "";
      return `@font-face{font-family:"${family}";src:url("${pathToFileURL(full).href}") format("woff2");font-weight:100 900;font-display:swap;}`;
    })
    .join("\n");
}

const STYLE = `
${fontFace()}
:root{
  --ink:#11151c; --muted:#5a6675; --rule:#d8dee7; --accent:#0e7490; --accent-soft:#e6f4f7;
  --code-bg:#f4f6f9;
}
@page{ size:A4; margin:18mm 16mm; }
*{box-sizing:border-box;}
body{
  font-family:"Space Grotesk",-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color:var(--ink); line-height:1.62; font-size:10.4pt; margin:0;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}
h1{
  font-size:27pt; line-height:1.1; letter-spacing:-0.02em; margin:0 0 6pt;
  border-bottom:3px solid var(--ink); padding-bottom:10pt;
}
h2{
  font-size:15pt; margin:20pt 0 7pt; letter-spacing:-0.01em;
  border-bottom:1px solid var(--rule); padding-bottom:4pt;
}
h3{ font-size:11.6pt; margin:14pt 0 5pt; color:var(--accent); }
h3:first-of-type{ color:var(--muted); font-weight:500; letter-spacing:0.06em;
  text-transform:uppercase; font-size:9.6pt; border:0; margin-top:8pt; }
h4{ font-size:10.6pt; margin:11pt 0 4pt; }
p{ margin:0 0 7pt; }
em{ color:var(--muted); }
a{ color:var(--accent); text-decoration:none; }
hr{ border:0; border-top:1px solid var(--rule); margin:14pt 0; }
code{
  font-family:"JetBrains Mono",ui-monospace,Consolas,monospace; font-size:0.86em;
  background:var(--code-bg); padding:1px 4px; border-radius:3px;
}
pre{
  background:var(--code-bg); border-left:3px solid var(--accent); border-radius:3px;
  padding:9pt 11pt; overflow:hidden; margin:9pt 0; break-inside:avoid;
}
pre code{ background:none; padding:0; font-size:8.3pt; line-height:1.5; white-space:pre-wrap; }
blockquote{
  margin:11pt 0; padding:9pt 13pt; background:var(--accent-soft);
  border-left:3px solid var(--accent); font-size:11.4pt; break-inside:avoid;
}
table{ border-collapse:collapse; width:100%; margin:9pt 0; font-size:9.3pt; break-inside:avoid; }
th,td{ border:1px solid var(--rule); padding:4.5pt 7pt; text-align:left; vertical-align:top; }
th{ background:var(--code-bg); font-weight:600; }
tbody tr:nth-child(even){ background:#fafbfc; }
ul,ol{ margin:0 0 8pt; padding-left:17pt; }
li{ margin-bottom:3.5pt; }
.page-break{ break-before:page; }
h1.page-break{ break-before:avoid; }
.shots{ margin:11pt 0 13pt; break-inside:avoid; }
.shots.pair{ display:grid; grid-template-columns:1fr 1fr; gap:9pt; }
figure{ margin:0 0 9pt; break-inside:avoid; }
figure img{ width:100%; border:1px solid var(--rule); border-radius:3px; display:block; }
figcaption{ font-size:8.2pt; color:var(--muted); margin-top:3.5pt; line-height:1.42; }
.missing{
  border:1.5px dashed #b9c3d0; border-radius:4px; background:#fbfcfd;
  min-height:120pt; display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:5pt; text-align:center; padding:12pt;
}
.missing span{ font-family:"JetBrains Mono",monospace; font-size:9pt; color:#8794a4; }
.missing small{ font-size:7.6pt; color:#a3aebc; max-width:34ch; line-height:1.4; }
.footer{ margin-top:22pt; padding-top:9pt; border-top:1px solid var(--rule);
  font-size:8.4pt; color:var(--muted); }
`;

function page(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>PARADOX — project report</title>
<style>${STYLE}</style>
</head>
<body>
${body}
<div class="footer">
PARADOX: The Impossible Games — Manycore Aholo Global 3D AI Hackathon.
Source: github.com/Demiladepy/paradox-impossible-games
</div>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */

function findChrome(): string | null {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

function main(): void {
  if (!existsSync(SOURCE)) throw new Error(`missing ${SOURCE}`);
  mkdirSync(SHOT_DIR, { recursive: true });

  const markdown = readFileSync(SOURCE, "utf8");
  writeFileSync(OUT_HTML, page(toHtml(markdown)), "utf8");
  console.log(`wrote ${basename(OUT_HTML)}`);

  const missing = Object.values(SHOTS)
    .flat()
    .filter((shot) => !existsSync(resolve(SHOT_DIR, shot.file)));
  if (missing.length > 0) {
    console.log(`\n${missing.length} screenshot(s) still to add in docs/report-assets/:`);
    for (const shot of missing) console.log(`  - ${shot.file}`);
    console.log("Each renders as a labelled placeholder until the file is there.");
  }

  const chrome = findChrome();
  if (!chrome) {
    console.log("\nNo Chrome or Edge found — open the HTML and print to PDF by hand.");
    return;
  }

  try {
    execFileSync(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",
        `--print-to-pdf=${OUT_PDF}`,
        pathToFileURL(OUT_HTML).href,
      ],
      { stdio: "pipe", timeout: 120_000 },
    );
    console.log(`\nwrote ${basename(OUT_PDF)}`);
  } catch (error) {
    console.log(`\nChrome could not print the PDF: ${String(error)}`);
    console.log("Open docs/PARADOX-report.html and print to PDF by hand.");
  }
}

main();
