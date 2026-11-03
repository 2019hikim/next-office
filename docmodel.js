// 문서 모델: { paragraphs: [문단] }
// 문단 = { align: "left" | "center" | "right" | "justify", lineSpacing: 퍼센트(160 = 160%), runs: [글자 조각] }
// 글자 조각(run) = { text, font, size(pt), bold, italic, underline, strike, color("#RRGGBB") }
// 문단 안 줄바꿈(Shift+Enter)은 text 안의 "\n", 탭은 "\t"로 둔다.

const DEFAULT_RUN_STYLE = {
  font: "맑은 고딕",
  size: 10,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: "#000000"
};
const DEFAULT_PARAGRAPH = { align: "justify", lineSpacing: 160 };
const STYLE_KEYS = ["font", "size", "bold", "italic", "underline", "strike", "color"];
const ALIGN_VALUES = ["left", "center", "right", "justify"];

function normalizeColor(color) {
  const text = String(color || "").trim();
  const short = text.match(/^#?([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
  if (short) {
    return ("#" + short[1] + short[1] + short[2] + short[2] + short[3] + short[3]).toUpperCase();
  }
  const long = text.match(/^#?([0-9a-fA-F]{6})$/);
  return long ? "#" + long[1].toUpperCase() : DEFAULT_RUN_STYLE.color;
}

function createRun(text, style) {
  const run = { text: String(text) };
  STYLE_KEYS.forEach((key) => {
    run[key] = style && style[key] !== undefined && style[key] !== null ? style[key] : DEFAULT_RUN_STYLE[key];
  });
  run.font = String(run.font).trim() || DEFAULT_RUN_STYLE.font;
  run.size = Number(run.size) > 0 ? Math.round(Number(run.size) * 10) / 10 : DEFAULT_RUN_STYLE.size;
  run.bold = Boolean(run.bold);
  run.italic = Boolean(run.italic);
  run.underline = Boolean(run.underline);
  run.strike = Boolean(run.strike);
  run.color = normalizeColor(run.color);
  return run;
}

function createParagraph(runs, props) {
  const align = props && ALIGN_VALUES.includes(props.align) ? props.align : DEFAULT_PARAGRAPH.align;
  const spacing = props ? Number(props.lineSpacing) : NaN;
  const lineSpacing = spacing >= 50 && spacing <= 500 ? Math.round(spacing) : DEFAULT_PARAGRAPH.lineSpacing;
  return { align: align, lineSpacing: lineSpacing, runs: runs || [] };
}

function createEmptyDoc() {
  return { paragraphs: [createParagraph([])] };
}

function hasSameStyle(a, b) {
  return STYLE_KEYS.every((key) => a[key] === b[key]);
}

// 빈 조각은 빼고, 모양이 같은 이웃 조각은 합치고, 문단이 하나도 없으면 빈 문단 하나를 둔다.
function normalizeDoc(doc) {
  const source = doc && Array.isArray(doc.paragraphs) ? doc.paragraphs : [];
  const paragraphs = source.map((paragraph) => {
    const runs = [];
    (paragraph.runs || []).forEach((raw) => {
      const run = createRun(String(raw.text || "").replace(/\r\n?/g, "\n"), raw);
      if (run.text === "") {
        return;
      }
      const last = runs[runs.length - 1];
      if (last && hasSameStyle(last, run)) {
        last.text += run.text;
      } else {
        runs.push(run);
      }
    });
    return createParagraph(runs, paragraph);
  });
  if (paragraphs.length === 0) {
    paragraphs.push(createParagraph([]));
  }
  return { paragraphs: paragraphs };
}

function createDocFromText(text) {
  const lines = String(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  return normalizeDoc({
    paragraphs: lines.map((line) => createParagraph([createRun(line)]))
  });
}

function convertDocToText(doc) {
  return doc.paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join("")).join("\n");
}

function countDocChars(doc) {
  const text = doc.paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join("")).join("");
  const chars = Array.from(text.replace(/\n/g, ""));
  return {
    withSpaces: chars.length,
    withoutSpaces: chars.filter((ch) => !/\s/.test(ch)).length
  };
}
