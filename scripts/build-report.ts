/**
 * Turns docs/REPORT.md into the submission PDF.
 *
 * The brief asks for a PDF "with process screenshots, key asset comparisons, or final
 * results", so this is not the markdown printed out — it is a laid-out document with the
 * pictures in the right places.
 *
 * Two things govern the design:
 *
 * - **No forced page breaks per section.** The first version started every numbered
 *   section on a fresh page, which looked tidy in principle and in practice left half-empty
 *   pages everywhere and a cover with two lines on it. Content flows; only the cover gets a
 *   break of its own. Headings carry `break-after: avoid` so one never strands at the foot
 *   of a page, and figures, tables and code never split.
 * - **Command output is rendered as text, not photographed.** A screenshot of a terminal is
 *   the one image in a report guaranteed to be unreadable at print size. These are the real
 *   captured bytes of the real commands, set in a dark card.
 *
 * There is no markdown library here and installing one was unavailable, so the converter
 * handles exactly the constructs the report uses. Anything else shows up plainly rather
 * than vanishing.
 *
 * Usage:  npm run report
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
}

interface Block {
  /** Screenshots to place under this heading. Two make a side-by-side pair. */
  shots?: Shot[];
  /** Captured command output, from docs/report-assets/<file>. */
  terminal?: { file: string; command: string; caption: string };
}

/** What goes under which heading. */
const BLOCKS: Record<string, Block> = {
  "1. The idea": {
    shots: [
      {
        file: "01-false-floor.jpg",
        caption:
          "The mechanic, mid-effect. The bright-edged panel in the foreground is a platform that has been <em>unmade</em> — it has no collider while it is being looked at. The ground texture shows straight through it.",
      },
    ],
  },
  "2. What we built": {
    shots: [
      { file: "04-arena-wide.jpg", caption: "The Gauntlet, from above. Eleven platforms, generated slabs, a rival already on the course." },
      { file: "05-arena-beauty.jpg", caption: "The same arena at ground level. Every surface here is a Lux3D asset." },
    ],
  },
  "3. How Aholo Lux3D is used": {
    shots: [
      {
        file: "03-asset-lab.jpg",
        caption:
          "Asset Lab — a tool built to inspect what actually came back from the API. Every generated file, its source endpoint, its Lux3D task id, the exact prompt, triangle count, mesh count, skeleton and clip list. This is where each claim in this report was checked.",
      },
    ],
  },
  "5. The Reality Rule Engine": {
    shots: [
      {
        file: "02-briefing-card.jpg",
        caption:
          "A live round. The badge reads <strong>AI-designed round</strong>, the rules line is generated, and the verified line carries the probe's real completion time — together with the sentence saying what that does and does not prove.",
      },
    ],
  },
  "6.2 The control experiment": {
    terminal: {
      file: "probe-control.txt",
      command: "npm run probe:control",
      caption:
        "Every round, probed twice. The rule-aware agent solves all five; the agent that ignores the rules fails all five, and the reason it failed is reported rather than inferred.",
    },
  },
  "7. The opponent is the probe": {
    shots: [
      { file: "06-gravity.jpg", caption: "Arena 02. Gravity inverts on a visible countdown and the course finishes overhead." },
      { file: "07-trailer-mode.jpg", caption: "Trailer mode — the verification agent plays while a cinematic camera films it, with no one at the keyboard." },
    ],
  },
  "8. Architecture": {
    terminal: {
      file: "budget.txt",
      command: "npm run budget",
      caption: "The geometry budget, computed from the real assets rather than estimated.",
    },
  },
};

/* ------------------------------------------------------------------ */
/* Markdown                                                            */
/* ------------------------------------------------------------------ */

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

/** Captions are authored with a little inline HTML, so they bypass escaping. */
function caption(text: string): string {
  return text;
}

function blockFor(heading: string): string {
  const block = BLOCKS[heading];
  if (!block) return "";
  const parts: string[] = [];

  if (block.shots) {
    const figures = block.shots
      .map((shot) => {
        const path = resolve(SHOT_DIR, shot.file);
        if (!existsSync(path)) {
          return `<figure><div class="missing"><span>${escapeHtml(shot.file)}</span><small>add to docs/report-assets/ and run npm run report</small></div><figcaption>${caption(shot.caption)}</figcaption></figure>`;
        }
        return `<figure><img src="report-assets/${shot.file}" alt="" /><figcaption>${caption(shot.caption)}</figcaption></figure>`;
      })
      .join("\n");
    parts.push(`<div class="shots${block.shots.length > 1 ? " pair" : ""}">${figures}</div>`);
  }

  if (block.terminal) {
    const path = resolve(SHOT_DIR, block.terminal.file);
    if (existsSync(path)) {
      const body = readFileSync(path, "utf8").trimEnd();
      parts.push(
        `<figure class="term-figure">` +
          `<div class="term"><div class="term-bar"><span class="dot r"></span><span class="dot y"></span>` +
          `<span class="dot g"></span><span class="term-cmd">${escapeHtml(block.terminal.command)}</span></div>` +
          `<pre class="term-body">${escapeHtml(body)}</pre></div>` +
          `<figcaption>${caption(block.terminal.caption)}</figcaption></figure>`,
      );
    }
  }

  return parts.join("\n");
}

function renderTable(rows: string[]): string {
  const cells = (row: string): string[] =>
    row
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  const header = cells(rows[0] ?? "");
  const body = rows.slice(2).map(cells);
  const showHead = header.some((c) => c.length > 0);
  const head = showHead
    ? `<thead><tr>${header.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`
    : "";
  const rest = body
    .map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table${showHead ? "" : ' class="facts"'}>${head}<tbody>${rest}</tbody></table>`;
}

function toHtml(markdown: string): { body: string; title: string; subtitle: string; pitch: string } {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  let title = "PARADOX: THE IMPOSSIBLE GAMES";
  let subtitle = "";
  let pitch = "";
  let seenCover = false;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        body.push(lines[i] ?? "");
        i++;
      }
      i++;
      out.push(`<pre class="term-body standalone">${escapeHtml(body.join("\n"))}</pre>`);
      continue;
    }

    if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("|")) {
        rows.push(lines[i] ?? "");
        i++;
      }
      out.push(renderTable(rows));
      continue;
    }

    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith(">")) {
        body.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${inline(body.join(" "))}</blockquote>`);
      continue;
    }

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
          items[items.length - 1] += ` ${current.trim()}`;
          i++;
        } else break;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</${tag}>`);
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      // The rule straight after the cover block is the cover's own divider.
      if (seenCover) out.push("<hr />");
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const text = heading[2] ?? "";
      if (level === 1) {
        title = text;
        i++;
        continue;
      }
      if (level === 3 && !seenCover) {
        subtitle = text;
        i++;
        continue;
      }
      seenCover = true;
      out.push(`<h${level}>${inline(text)}</h${level}>`);
      out.push(blockFor(text.replace(/\*\*/g, "")));
      i++;
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

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
    const text = body.join(" ");
    if (!seenCover && pitch === "") {
      pitch = text;
      continue;
    }
    out.push(`<p>${inline(text)}</p>`);
  }

  return { body: out.filter((c) => c.length > 0).join("\n"), title, subtitle, pitch };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function fontFace(): string {
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
      return `@font-face{font-family:"${family}";src:url("${pathToFileURL(full).href}") format("woff2");font-weight:100 900;font-display:block;}`;
    })
    .join("\n");
}

const STYLE = `
${fontFace()}
:root{
  --ink:#0f141b; --body:#2a3340; --muted:#5e6a79; --rule:#dde3ea;
  --accent:#0b7285; --accent-soft:#eaf5f7;
  --term-bg:#11161d; --term-ink:#d6e2ef; --term-dim:#7d8ea1;
}
@page{ size:A4; margin:15mm 14mm 14mm; }
*{ box-sizing:border-box; }
html,body{ margin:0; padding:0; }
body{
  font-family:"Space Grotesk",-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color:var(--body); line-height:1.58; font-size:10.1pt;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
  orphans:3; widows:3;
}

/* ---- cover ---- */
.cover{ break-after:page; padding-top:4mm; }
.cover h1{
  font-size:34pt; line-height:1.02; letter-spacing:-0.025em; margin:0;
  color:var(--ink); font-weight:700;
}
.cover .sub{
  margin-top:7pt; font-size:9pt; letter-spacing:0.14em; text-transform:uppercase;
  color:var(--accent); font-weight:600;
}
.cover .pitch{
  margin-top:13pt; font-size:13pt; line-height:1.45; color:var(--ink); max-width:46ch;
  border-left:3px solid var(--accent); padding-left:12pt;
}
.cover .hero{ margin-top:16pt; }
.cover .hero img{ width:100%; border-radius:4px; display:block; }
.cover .hero figcaption{ font-size:8pt; color:var(--muted); margin-top:4pt; }
.cover .meta{
  margin-top:16pt; display:grid; grid-template-columns:repeat(4,1fr); gap:0;
  border-top:1px solid var(--rule); border-bottom:1px solid var(--rule);
}
.cover .meta div{ padding:8pt 10pt 8pt 0; }
.cover .meta dt{ font-size:7.4pt; letter-spacing:0.1em; text-transform:uppercase; color:var(--muted); }
.cover .meta dd{ margin:3pt 0 0; font-size:12pt; font-weight:600; color:var(--ink); }
.cover .links{ margin-top:12pt; font-size:8.6pt; color:var(--muted); line-height:1.75; }
.cover .links a{ color:var(--accent); }

/* ---- headings ---- */
h2{
  font-size:15.5pt; margin:15pt 0 6pt; letter-spacing:-0.012em; color:var(--ink);
  padding-bottom:4pt; border-bottom:2px solid var(--ink); break-after:avoid;
}
h3{ font-size:11.4pt; margin:14pt 0 5pt; color:var(--accent); break-after:avoid; }
h4{ font-size:10.4pt; margin:11pt 0 4pt; color:var(--ink); break-after:avoid; }
p{ margin:0 0 7pt; }
em{ color:var(--muted); font-style:italic; }
strong{ color:var(--ink); }
a{ color:var(--accent); text-decoration:none; }
hr{ border:0; border-top:1px solid var(--rule); margin:11pt 0; }

code{
  font-family:"JetBrains Mono",ui-monospace,Consolas,monospace; font-size:0.85em;
  background:#eef2f6; color:#16303a; padding:1px 4px; border-radius:3px;
}
blockquote{
  margin:11pt 0; padding:10pt 14pt; background:var(--accent-soft);
  border-left:3px solid var(--accent); font-size:11.2pt; color:var(--ink);
  break-inside:avoid; border-radius:0 3px 3px 0;
}
blockquote strong{ font-weight:700; }

table{ border-collapse:collapse; width:100%; margin:9pt 0; font-size:9.1pt; break-inside:avoid; }
th,td{ border:1px solid var(--rule); padding:4.5pt 7pt; text-align:left; vertical-align:top; }
th{ background:#f1f5f8; font-weight:600; color:var(--ink); }
tbody tr:nth-child(even){ background:#fafbfc; }
table.facts td:first-child{ width:38%; background:#fafbfc; }

ul,ol{ margin:0 0 8pt; padding-left:16pt; }
li{ margin-bottom:3.5pt; }

/* ---- terminal ---- */
.term{ background:var(--term-bg); border-radius:5px; overflow:hidden; break-inside:avoid; }
.term-bar{
  display:flex; align-items:center; gap:5px; padding:5pt 9pt;
  background:#1a212b; border-bottom:1px solid #263040;
}
.dot{ width:7px; height:7px; border-radius:50%; display:inline-block; }
.dot.r{ background:#ec6a5e; } .dot.y{ background:#f3bf4f; } .dot.g{ background:#61c454; }
.term-cmd{
  margin-left:7pt; font-family:"JetBrains Mono",monospace; font-size:7.8pt; color:var(--term-dim);
}
pre.term-body{
  margin:0; padding:9pt 11pt; color:var(--term-ink); background:var(--term-bg);
  font-family:"JetBrains Mono",ui-monospace,Consolas,monospace;
  font-size:6.9pt; line-height:1.52; white-space:pre-wrap; word-break:break-word;
}
pre.term-body.standalone{
  border-radius:5px; margin:9pt 0; font-size:7.4pt; break-inside:avoid;
}
.term-figure{ margin:9pt 0; }

/* ---- figures ---- */
/* A single 16:9 screenshot at full width is a third of a page tall; bound to its heading
   by break-after:avoid, the pair becomes one atomic block too tall to fit, and gets pushed
   whole to the next page leaving a gap behind it. Narrower images keep the block short
   enough to sit where it belongs — and read better besides. */
.shots{ margin:9pt 0 11pt; break-inside:avoid; }
.shots:not(.pair) figure{ max-width:74%; margin-left:auto; margin-right:auto; }
.shots.pair{ display:grid; grid-template-columns:1fr 1fr; gap:8pt; }
figure{ margin:0 0 8pt; break-inside:avoid; }
figure img{ width:100%; border-radius:3px; display:block; }
figcaption{ font-size:8pt; color:var(--muted); margin-top:4pt; line-height:1.45; }
figcaption strong{ color:var(--body); }
.missing{
  border:1.5px dashed #c3ccd6; border-radius:4px; background:#fbfcfd; min-height:110pt;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:5pt; text-align:center; padding:12pt;
}
.missing span{ font-family:"JetBrains Mono",monospace; font-size:8.6pt; color:#8c98a6; }
.missing small{ font-size:7.4pt; color:#a8b2be; }

.footer{
  margin-top:20pt; padding-top:8pt; border-top:1px solid var(--rule);
  font-size:8pt; color:var(--muted);
}
`;

function cover(title: string, subtitle: string, pitch: string): string {
  const hero = resolve(SHOT_DIR, "01-false-floor.jpg");
  const heroHtml = existsSync(hero)
    ? `<figure class="hero"><img src="report-assets/01-false-floor.jpg" alt="" /><figcaption>A platform that has been unmade. It has no collider while it is being looked at.</figcaption></figure>`
    : "";

  return `<section class="cover">
  <h1>${escapeHtml(title)}</h1>
  <div class="sub">${escapeHtml(subtitle)}</div>
  <div class="pitch">${inline(pitch.replace(/^\*|\*$/g, ""))}</div>
  ${heroHtml}
  <dl class="meta">
    <div><dt>Rule mechanics</dt><dd>3</dd></div>
    <div><dt>Lux3D assets</dt><dd>6</dd></div>
    <div><dt>Automated tests</dt><dd>135</dd></div>
    <div><dt>Plays offline</dt><dd>Yes</dd></div>
  </dl>
  <div class="links">
    Play it · <a href="https://demiladepy.github.io/paradox-impossible-games/">demiladepy.github.io/paradox-impossible-games</a><br />
    Source · <a href="https://github.com/Demiladepy/paradox-impossible-games">github.com/Demiladepy/paradox-impossible-games</a>
  </div>
</section>`;
}

function page(parts: { body: string; title: string; subtitle: string; pitch: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>PARADOX — project report</title>
<style>${STYLE}</style>
</head>
<body>
${cover(parts.title, parts.subtitle, parts.pitch)}
${parts.body}
<div class="footer">
PARADOX: The Impossible Games — Manycore Aholo Global 3D AI Hackathon, November 2026.
</div>
</body>
</html>`;
}

function findChrome(): string | null {
  return (
    [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    ].find((p) => existsSync(p)) ?? null
  );
}

function main(): void {
  if (!existsSync(SOURCE)) throw new Error(`missing ${SOURCE}`);
  mkdirSync(SHOT_DIR, { recursive: true });

  writeFileSync(OUT_HTML, page(toHtml(readFileSync(SOURCE, "utf8"))), "utf8");
  console.log(`wrote ${basename(OUT_HTML)}`);

  const missing = Object.values(BLOCKS)
    .flatMap((b) => b.shots ?? [])
    .filter((s) => !existsSync(resolve(SHOT_DIR, s.file)));
  if (missing.length > 0) {
    console.log(`\nmissing ${missing.length} screenshot(s):`);
    for (const s of missing) console.log(`  - ${s.file}`);
  }

  const chrome = findChrome();
  if (!chrome) {
    console.log("\nNo Chrome or Edge found — open the HTML and print to PDF.");
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
    console.log(`wrote ${basename(OUT_PDF)}`);
  } catch (error) {
    console.log(`\nChrome could not print: ${String(error)}`);
  }
}

main();
