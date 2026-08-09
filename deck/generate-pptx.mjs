/**
 * Generates Warden.pptx — upload to Drive and open with Google Slides,
 * or File → Import slides in an existing presentation.
 */
import PptxGenJS from "pptxgenjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "Warden.pptx");

const BG = "0C1210";
const PANEL = "141C18";
const INK = "E8F0EA";
const MUTED = "8FA399";
const ACCENT = "3DD68C";
const LINE = "2A3830";

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDESCREEN", width: 13.333, height: 7.5 });
pptx.layout = "WIDESCREEN";
pptx.author = "Warden";
pptx.title = "Warden — Rain × Monad";
pptx.subject = "Autonomous accounts-payable settlement layer";

function brand(slide, label = "WARDEN  ·  RAIN × MONAD") {
  slide.addText(label, {
    x: 0.7,
    y: 0.45,
    w: 12,
    h: 0.35,
    fontSize: 12,
    fontFace: "Arial",
    color: ACCENT,
    bold: true,
    charSpacing: 4,
  });
}

function addBg(slide) {
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: BG },
    line: { color: BG },
  });
  // Soft accent wash (top-right)
  slide.addShape(pptx.shapes.OVAL, {
    x: 8.5,
    y: -2.2,
    w: 7,
    h: 5.5,
    fill: { color: "1A4D35", transparency: 55 },
    line: { color: BG, transparency: 100 },
  });
}

// ---------------------------------------------------------------------------
// Slide 1 — Problem / insight / product
// ---------------------------------------------------------------------------
{
  const s = pptx.addSlide();
  addBg(s);
  brand(s);

  s.addText("Autonomous AP that settles safely", {
    x: 0.7,
    y: 1.1,
    w: 11.5,
    h: 1.5,
    fontSize: 44,
    fontFace: "Georgia",
    color: INK,
    bold: false,
    margin: 0,
  });

  s.addText(
    "Finance agents can agree on payments. Warden is the settlement layer — policy on Monad, scoped Rain cards, humans only for exceptions.",
    {
      x: 0.7,
      y: 2.7,
      w: 9.5,
      h: 1.0,
      fontSize: 18,
      fontFace: "Arial",
      color: MUTED,
      margin: 0,
    },
  );

  const tiles = [
    {
      title: "Problem",
      body: "AP agents approve invoices, but money still moves with blank-check credentials or manual cards.",
    },
    {
      title: "Insight",
      body: "Every payment should be a one-shot instrument: one vendor, one amount, then dead.",
    },
    {
      title: "Product",
      body: "Ingest → policy check → mint scoped card → settle → on-chain registry so nothing pays twice.",
    },
  ];

  tiles.forEach((t, i) => {
    const x = 0.7 + i * 4.1;
    s.addShape(pptx.shapes.RECTANGLE, {
      x,
      y: 4.2,
      w: 0.9,
      h: 0.06,
      fill: { color: ACCENT },
      line: { color: ACCENT },
    });
    s.addText(t.title, {
      x,
      y: 4.45,
      w: 3.8,
      h: 0.4,
      fontSize: 16,
      fontFace: "Arial",
      color: INK,
      bold: true,
      margin: 0,
    });
    s.addText(t.body, {
      x,
      y: 4.9,
      w: 3.8,
      h: 1.6,
      fontSize: 14,
      fontFace: "Arial",
      color: MUTED,
      margin: 0,
    });
  });
}

// ---------------------------------------------------------------------------
// Slide 2 — How it works
// ---------------------------------------------------------------------------
{
  const s = pptx.addSlide();
  addBg(s);
  brand(s, "HOW IT WORKS");

  s.addText("Policy in, scoped money out", {
    x: 0.7,
    y: 1.0,
    w: 11.5,
    h: 0.9,
    fontSize: 40,
    fontFace: "Georgia",
    color: INK,
    margin: 0,
  });

  s.addText(
    "Seven demo invoices for a Shopify seller. Four pay themselves. Three escalate.",
    {
      x: 0.7,
      y: 1.95,
      w: 11,
      h: 0.45,
      fontSize: 16,
      fontFace: "Arial",
      color: MUTED,
      margin: 0,
    },
  );

  const steps = [
    {
      n: "01",
      title: "Ingest",
      body: "Vendor invoices land in the agent inbox (JSON / Slack / dashboard).",
    },
    {
      n: "02",
      title: "Monad policy",
      body: "APPolicy: approved vendors, per-vendor caps, permanent paid registry.",
    },
    {
      n: "03",
      title: "Rain card",
      body: "Mint a single-use virtual card locked to vendor + exact cents, 24h TTL.",
    },
    {
      n: "04",
      title: "Escalate",
      body: "Over cap or unknown vendor → Slack Approve / Reject. No card until a human taps.",
    },
  ];

  steps.forEach((step, i) => {
    const x = 0.55 + i * 3.15;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x,
      y: 2.7,
      w: 2.95,
      h: 3.0,
      fill: { color: PANEL },
      line: { color: LINE },
      rectRadius: 0.08,
    });
    s.addText(step.n, {
      x: x + 0.2,
      y: 2.9,
      w: 2.5,
      h: 0.35,
      fontSize: 12,
      fontFace: "Arial",
      color: ACCENT,
      bold: true,
      margin: 0,
    });
    s.addText(step.title, {
      x: x + 0.2,
      y: 3.35,
      w: 2.5,
      h: 0.4,
      fontSize: 18,
      fontFace: "Arial",
      color: INK,
      bold: true,
      margin: 0,
    });
    s.addText(step.body, {
      x: x + 0.2,
      y: 3.85,
      w: 2.55,
      h: 1.5,
      fontSize: 13,
      fontFace: "Arial",
      color: MUTED,
      margin: 0,
    });
  });

  // Pills
  const pills = [
    "Monad testnet · chain 10143",
    "Rain scoped issuing",
    "Slack Socket Mode",
    "Vite dashboard · SSE",
  ];
  let px = 0.55;
  pills.forEach((p) => {
    const w = Math.max(2.2, p.length * 0.11 + 0.6);
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: px,
      y: 6.1,
      w,
      h: 0.42,
      fill: { color: PANEL },
      line: { color: LINE },
      rectRadius: 0.06,
    });
    s.addText(p, {
      x: px,
      y: 6.15,
      w,
      h: 0.35,
      fontSize: 11,
      fontFace: "Arial",
      color: ACCENT,
      align: "center",
      valign: "middle",
      margin: 0,
    });
    px += w + 0.2;
  });
}

// ---------------------------------------------------------------------------
// Slide 3 — Demo & stack
// ---------------------------------------------------------------------------
{
  const s = pptx.addSlide();
  addBg(s);
  brand(s, "DEMO & STACK");

  s.addText("What you see in four minutes", {
    x: 0.7,
    y: 1.0,
    w: 7,
    h: 1.1,
    fontSize: 36,
    fontFace: "Georgia",
    color: INK,
    margin: 0,
  });

  s.addText(
    "Run A pays autonomously. Run B refuses — until one Approve tap mints the exception card.",
    {
      x: 0.7,
      y: 2.2,
      w: 6.8,
      h: 0.8,
      fontSize: 16,
      fontFace: "Arial",
      color: MUTED,
      margin: 0,
    },
  );

  // Quote callout
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0.7,
    y: 3.3,
    w: 0.1,
    h: 2.2,
    fill: { color: ACCENT },
    line: { color: ACCENT },
  });
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0.8,
    y: 3.3,
    w: 6.7,
    h: 2.2,
    fill: { color: PANEL },
    line: { color: PANEL },
  });
  s.addText(
    "“The agent never gets a blank check — every payment is a card that can only pay this vendor, this exact amount, then it’s dead.”",
    {
      x: 1.05,
      y: 3.5,
      w: 6.2,
      h: 1.8,
      fontSize: 18,
      fontFace: "Georgia",
      color: INK,
      italic: true,
      margin: 0,
    },
  );

  // Stats
  const stats = [
    { v: "$6,350", l: "Auto-paid (4 invoices)" },
    { v: "3", l: "Escalated to human" },
    { v: "1×", l: "Use · exact cents · 24h" },
    { v: "0", l: "Double pays possible" },
  ];
  stats.forEach((st, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 8.0 + col * 2.45;
    const y = 1.15 + row * 2.15;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x,
      y,
      w: 2.3,
      h: 1.9,
      fill: { color: PANEL },
      line: { color: LINE },
      rectRadius: 0.08,
    });
    s.addText(st.v, {
      x: x + 0.15,
      y: y + 0.35,
      w: 2.0,
      h: 0.7,
      fontSize: 28,
      fontFace: "Arial",
      color: ACCENT,
      bold: true,
      margin: 0,
    });
    s.addText(st.l, {
      x: x + 0.15,
      y: y + 1.15,
      w: 2.0,
      h: 0.5,
      fontSize: 12,
      fontFace: "Arial",
      color: MUTED,
      margin: 0,
    });
  });

  // Stack footer
  s.addText("contracts/ APPolicy.sol   ·   agent/ TS + Rain + Slack   ·   web/ reconciliation UI", {
    x: 0.7,
    y: 6.7,
    w: 12,
    h: 0.35,
    fontSize: 12,
    fontFace: "Arial",
    color: MUTED,
    margin: 0,
  });
}

await pptx.writeFile({ fileName: outPath });
console.log(`Wrote ${outPath}`);
console.log("");
console.log("Google Slides:");
console.log("  1. Upload Warden.pptx to Google Drive");
console.log("  2. Right-click → Open with → Google Slides");
console.log("  Or: File → Import slides in an existing Slides deck");
