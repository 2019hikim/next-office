// 편집 화면(contenteditable)과 문서 모델(docmodel.js) 사이를 오간다. 쪽 나누기도 여기서 한다. 브라우저 전용.

const MM_TO_PX = 96 / 25.4;
// A4 297mm에서 위(머리말 포함) 35mm, 아래(꼬리말 포함) 30mm를 뺀 본문 높이
const PAGE_BODY_HEIGHT_PX = 232 * MM_TO_PX;
const BLOCK_TAGS = ["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE", "UL", "OL"];
const SKIP_TAGS = ["STYLE", "SCRIPT", "TEMPLATE"];
const CSS_ALIGN = { left: "left", start: "left", center: "center", right: "right", end: "right", justify: "justify" };

function isBlockElement(node) {
  return Boolean(node) && node.nodeType === 1 && BLOCK_TAGS.includes(node.tagName);
}

// ---------- 화면 → 문서 ----------

function readEditorDoc(editor) {
  const paragraphs = [];
  let current = null;

  function startParagraph(block) {
    current = createParagraph([], readParagraphProps(block, editor));
    paragraphs.push(current);
  }

  function walk(node, block) {
    if (node.nodeType === 3) {
      const text = node.nodeValue.replace(/\r/g, "");
      if (text === "") {
        return;
      }
      if (!current) {
        startParagraph(block);
      }
      current.runs.push(createRun(text, readRunStyle(node.parentElement, editor)));
      return;
    }
    if (node.nodeType !== 1 || SKIP_TAGS.includes(node.tagName)) {
      return;
    }
    if (node.tagName === "BR") {
      if (!current) {
        startParagraph(block);
      }
      if (!isTrailingBreak(node, block)) {
        current.runs.push(createRun("\n", readRunStyle(node.parentElement, editor)));
      }
      return;
    }
    if (isBlockElement(node)) {
      startParagraph(node);
      node.childNodes.forEach((child) => walk(child, node));
      current = null;
      return;
    }
    node.childNodes.forEach((child) => walk(child, block));
  }

  editor.childNodes.forEach((child) => walk(child, editor));
  return normalizeDoc({ paragraphs: paragraphs });
}

// 블록 끝의 <br>은 빈 줄을 보여 주려는 자리 표시라서 줄바꿈으로 세지 않는다.
function isTrailingBreak(br, block) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_ALL);
  walker.currentNode = br;
  let node = walker.nextNode();
  while (node) {
    if (isBlockElement(node)) {
      return true;
    }
    if ((node.nodeType === 3 && node.nodeValue.length > 0) || node.nodeName === "BR") {
      return false;
    }
    node = walker.nextNode();
  }
  return true;
}

function readParagraphProps(block, editor) {
  const style = getComputedStyle(block);
  const lineHeight = block !== editor ? parseFloat(block.style.lineHeight) : NaN;
  return {
    align: CSS_ALIGN[style.textAlign] || DEFAULT_PARAGRAPH.align,
    lineSpacing: lineHeight > 0 ? Math.round(lineHeight * 100) : DEFAULT_PARAGRAPH.lineSpacing
  };
}

function readRunStyle(element, editor) {
  const style = getComputedStyle(element);
  let underline = false;
  let strike = false;
  for (let el = element; el; el = el === editor ? null : el.parentElement) {
    const line = getComputedStyle(el).textDecorationLine || "";
    underline = underline || line.includes("underline");
    strike = strike || line.includes("line-through");
  }
  return {
    font: readFirstFontFamily(style.fontFamily),
    size: Math.round(parseFloat(style.fontSize) * 0.75 * 2) / 2,
    bold: parseInt(style.fontWeight, 10) >= 600,
    italic: style.fontStyle !== "normal",
    underline: underline,
    strike: strike,
    color: convertCssColorToHex(style.color)
  };
}

function readFirstFontFamily(cssFamily) {
  const first = String(cssFamily || "").split(",")[0].trim().replace(/^["']|["']$/g, "");
  return first || DEFAULT_RUN_STYLE.font;
}

function convertCssColorToHex(cssColor) {
  const match = String(cssColor).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!match) {
    return normalizeColor(cssColor);
  }
  return "#" + [match[1], match[2], match[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase();
}

// ---------- 문서 → 화면 ----------

function renderEditorDoc(container, doc) {
  container.textContent = "";
  normalizeDoc(doc).paragraphs.forEach((paragraph) => {
    container.appendChild(createParagraphElement(paragraph));
  });
}

function createParagraphElement(paragraph) {
  const p = document.createElement("p");
  if (paragraph.align !== DEFAULT_PARAGRAPH.align) {
    p.style.textAlign = paragraph.align;
  }
  if (paragraph.lineSpacing !== DEFAULT_PARAGRAPH.lineSpacing) {
    p.style.lineHeight = String(paragraph.lineSpacing / 100);
  }
  paragraph.runs.forEach((run) => {
    const target = hasSameStyle(run, DEFAULT_RUN_STYLE) ? p : p.appendChild(createStyledSpan(run));
    appendTextWithBreaks(target, run.text);
  });
  const text = paragraph.runs.map((run) => run.text).join("");
  if (text === "" || text.endsWith("\n")) {
    p.appendChild(document.createElement("br"));
  }
  return p;
}

function createStyledSpan(run) {
  const span = document.createElement("span");
  if (run.font !== DEFAULT_RUN_STYLE.font) {
    span.style.fontFamily = '"' + run.font + '"';
  }
  if (run.size !== DEFAULT_RUN_STYLE.size) {
    span.style.fontSize = run.size + "pt";
  }
  if (run.bold) {
    span.style.fontWeight = "bold";
  }
  if (run.italic) {
    span.style.fontStyle = "italic";
  }
  const lines = [run.underline ? "underline" : "", run.strike ? "line-through" : ""].filter(Boolean);
  if (lines.length) {
    span.style.textDecorationLine = lines.join(" ");
  }
  if (run.color !== DEFAULT_RUN_STYLE.color) {
    span.style.color = run.color;
  }
  return span;
}

function appendTextWithBreaks(target, text) {
  text.split("\n").forEach((part, index) => {
    if (index > 0) {
      target.appendChild(document.createElement("br"));
    }
    if (part !== "") {
      target.appendChild(document.createTextNode(part));
    }
  });
}

// ---------- 쪽 나누기 ----------

// 줄 단위로 쪽을 나눈다. 한 문단이 여러 쪽에 걸쳐도 줄 사이에서 자른다.
// 반환: 쪽마다 { start, end } — container 맨 위에서 잰 px(확대 전 크기). 쪽 구간은 빈틈없이 이어진다.
function computePageCuts(container, bodyHeight) {
  const blocks = Array.from(container.children).filter(isBlockElement);
  if (blocks.length === 0) {
    return [{ start: 0, end: 0 }];
  }
  const box = container.getBoundingClientRect();
  const scale = container.offsetHeight ? box.height / container.offsetHeight : 1;
  const toLocal = (rect) => ({ top: (rect.top - box.top) / scale, bottom: (rect.bottom - box.top) / scale });

  const lines = [];
  blocks.forEach((block) => {
    const found = collectLineRects(block);
    (found.length ? found : [block.getBoundingClientRect()]).forEach((rect) => lines.push(toLocal(rect)));
  });
  lines.sort((a, b) => a.top - b.top);

  // 글자 크기가 섞여 위치가 조금 다른 조각은 같은 줄로 합친다.
  const merged = [];
  lines.forEach((line) => {
    const last = merged[merged.length - 1];
    if (last && line.top < last.bottom - 1) {
      last.bottom = Math.max(last.bottom, line.bottom);
    } else {
      merged.push({ top: line.top, bottom: line.bottom });
    }
  });

  const contentTop = toLocal(blocks[0].getBoundingClientRect()).top;
  const contentBottom = toLocal(blocks[blocks.length - 1].getBoundingClientRect()).bottom;
  const starts = [contentTop];
  merged.forEach((line) => {
    const pageStart = starts[starts.length - 1];
    if (line.bottom - pageStart > bodyHeight + 0.5 && line.top > pageStart + 0.5) {
      starts.push(line.top);
    }
  });
  return starts.map((start, i) => ({ start: start, end: i + 1 < starts.length ? starts[i + 1] : Math.max(start, contentBottom) }));
}

function collectLineRects(block) {
  const rects = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node = walker.nextNode();
  while (node) {
    range.selectNodeContents(node);
    Array.from(range.getClientRects()).forEach((rect) => {
      if (rect.height > 0) {
        rects.push(rect);
      }
    });
    node = walker.nextNode();
  }
  return rects;
}

// 미리보기·인쇄용 A4 쪽들을 만든다. 편집 화면과 같은 너비로 그린 본문을 쪽 구간만큼 잘라 보여 준다.
function buildPageSheets(doc) {
  const measure = document.createElement("div");
  measure.className = "page doc-body page-measure";
  document.body.appendChild(measure);
  renderEditorDoc(measure, doc);
  const cuts = computePageCuts(measure, PAGE_BODY_HEIGHT_PX);
  const contentTop = cuts[0].start;

  const sheets = cuts.map((cut, pageIndex) => {
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    const body = document.createElement("div");
    body.className = "sheet-body doc-body";
    const windowBox = document.createElement("div");
    windowBox.className = "sheet-window";
    windowBox.style.height = cut.end - cut.start + "px";
    const flow = document.createElement("div");
    flow.className = "sheet-flow";
    flow.style.top = -(cut.start - contentTop) + "px";
    Array.from(measure.children).forEach((block) => flow.appendChild(block.cloneNode(true)));
    windowBox.appendChild(flow);
    body.appendChild(windowBox);
    const number = document.createElement("div");
    number.className = "sheet-number";
    number.textContent = "- " + (pageIndex + 1) + " -";
    sheet.appendChild(body);
    sheet.appendChild(number);
    return sheet;
  });
  measure.remove();
  return sheets;
}
