// 다음오피스 한글 문서 편집기 화면 동작
// 파일(새 문서·열기·저장·다른 이름으로 저장), 서식(글꼴·크기·모양·색·정렬·줄 간격), 미리보기·인쇄, 임시 저장을 다룬다.

const FONT_CHOICES = ["맑은 고딕", "바탕", "돋움", "굴림", "궁서", "함초롬바탕", "함초롬돋움", "나눔고딕", "나눔명조", "Arial", "Times New Roman", "Courier New"];
const SIZE_CHOICES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 60, 72];
const LINE_SPACING_CHOICES = [100, 130, 150, 160, 180, 200, 250, 300];
const DRAFT_KEY = "next-office:draft";
const NEW_FILE_NAME = "새 문서.hwpx";

const editor = document.getElementById("editor");
const paper = document.getElementById("paper");
const paperSizer = document.getElementById("paperSizer");
const pageMarks = document.getElementById("pageMarks");
const fontNameSelect = document.getElementById("fontName");
const fontSizeSelect = document.getElementById("fontSize");
const fontColorInput = document.getElementById("fontColor");
const lineSpacingSelect = document.getElementById("lineSpacing");
const zoomSelect = document.getElementById("zoom");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const previewPages = document.getElementById("previewPages");
const previewInfo = document.getElementById("previewInfo");
const printArea = document.getElementById("printArea");
const unsavedDialog = document.getElementById("unsavedDialog");

const state = {
  fileName: NEW_FILE_NAME,
  fileHandle: null,
  dirty: false,
  zoom: 1,
  savedRange: null,
  pendingFontSize: null,
  refreshTimer: null,
  draftTimer: null
};

// ---------- 시작 ----------

function startApp() {
  document.execCommand("defaultParagraphSeparator", false, "p");
  document.execCommand("styleWithCSS", false, true);
  fillSelect(fontNameSelect, FONT_CHOICES.map((font) => [font, font]));
  fillSelect(fontSizeSelect, SIZE_CHOICES.map((size) => [String(size), String(size)]));
  fillSelect(lineSpacingSelect, LINE_SPACING_CHOICES.map((value) => [String(value), value + "%"]));
  fontNameSelect.value = DEFAULT_RUN_STYLE.font;
  fontSizeSelect.value = String(DEFAULT_RUN_STYLE.size);
  lineSpacingSelect.value = String(DEFAULT_PARAGRAPH.lineSpacing);

  renderEditorDoc(editor, createEmptyDoc());
  bindEvents();
  new ResizeObserver(updatePaperSize).observe(paper);
  updatePaperSize();
  restoreDraft();
  updateTitle();
  refreshStatus();
  editor.focus();
  placeCaretAtStart();
}

function fillSelect(select, items) {
  select.textContent = "";
  items.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
}

function bindEvents() {
  document.getElementById("newButton").addEventListener("click", () => runSafely(newDocument));
  document.getElementById("openButton").addEventListener("click", () => runSafely(openDocument));
  document.getElementById("saveButton").addEventListener("click", () => runSafely(saveDocument));
  document.getElementById("saveAsButton").addEventListener("click", () => runSafely(saveDocumentAs));
  document.getElementById("previewButton").addEventListener("click", showPreview);
  document.getElementById("printButton").addEventListener("click", printDocument);
  document.getElementById("previewPrint").addEventListener("click", printDocument);
  document.getElementById("previewClose").addEventListener("click", closePreview);

  // 단추를 눌러도 편집 화면의 선택 영역이 풀리지 않게 한다.
  document.querySelectorAll(".menubar button, .toolbar button").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
  });
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => runEditCommand(button.dataset.command));
  });

  fontNameSelect.addEventListener("change", () => applyFontName(fontNameSelect.value));
  fontSizeSelect.addEventListener("change", () => applyFontSize(Number(fontSizeSelect.value)));
  fontColorInput.addEventListener("input", () => applyFontColor(fontColorInput.value));
  lineSpacingSelect.addEventListener("change", () => applyLineSpacing(Number(lineSpacingSelect.value)));
  zoomSelect.addEventListener("change", () => applyZoom(Number(zoomSelect.value)));

  editor.addEventListener("input", (event) => {
    if (!event.isComposing) {
      tidyEditor();
    }
    markChanged();
  });
  editor.addEventListener("compositionend", tidyEditor);
  editor.addEventListener("paste", pastePlainText);
  editor.addEventListener("keydown", handleEditorKeydown);
  document.addEventListener("selectionchange", rememberSelection);
  document.addEventListener("keydown", handleShortcut);

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (file) {
      runSafely(() => openFromFile(file, null));
    }
  });

  const workspace = document.getElementById("workspace");
  workspace.addEventListener("dragover", (event) => {
    if (event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files")) {
      event.preventDefault();
    }
  });
  workspace.addEventListener("drop", (event) => {
    const file = event.dataTransfer && event.dataTransfer.files[0];
    if (file) {
      event.preventDefault();
      runSafely(async () => {
        if (await confirmDiscardChanges()) {
          await openFromFile(file, null);
        }
      });
    }
  });

  window.addEventListener("beforeprint", buildPrintArea);
  window.addEventListener("afterprint", () => printArea.replaceChildren());
  window.addEventListener("beforeunload", (event) => {
    if (state.dirty) {
      saveDraft();
      event.preventDefault();
      event.returnValue = "";
    }
  });
}

async function runSafely(task) {
  try {
    await task();
  } catch (err) {
    console.error(err);
    alert("작업을 마치지 못했습니다.\n" + (err && err.message ? err.message : err));
  }
}

// ---------- 문서 상태 ----------

function markChanged() {
  setDirty(true);
  scheduleRefresh();
  clearTimeout(state.draftTimer);
  state.draftTimer = setTimeout(saveDraft, 1000);
}

function setDirty(dirty) {
  state.dirty = dirty;
  updateTitle();
}

function updateTitle() {
  document.title = (state.dirty ? "* " : "") + state.fileName + " - 다음오피스 한글";
  const status = document.getElementById("statusFile");
  status.textContent = state.fileName + (state.dirty ? " · 수정됨" : "");
  status.className = state.dirty ? "dirty" : "";
}

function loadDoc(doc, fileName, handle) {
  renderEditorDoc(editor, doc);
  state.fileName = fileName;
  state.fileHandle = handle;
  state.pendingFontSize = null;
  setDirty(false);
  clearDraft();
  refreshStatus();
  editor.focus();
  placeCaretAtStart();
}

function placeCaretAtStart() {
  const first = editor.firstChild;
  if (!first) {
    return;
  }
  const range = document.createRange();
  range.setStart(first, 0);
  range.collapse(true);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  state.savedRange = range.cloneRange();
}

// 저장하지 않은 내용이 있으면 저장 / 저장 안 함 / 취소를 묻는다. 계속해도 되면 true.
function confirmDiscardChanges() {
  if (!state.dirty) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    unsavedDialog.returnValue = "cancel";
    unsavedDialog.addEventListener("close", () => {
      const answer = unsavedDialog.returnValue;
      if (answer === "save") {
        saveDocument().then(resolve, (err) => {
          alert("저장하지 못했습니다.\n" + err.message);
          resolve(false);
        });
      } else {
        resolve(answer === "discard");
      }
    }, { once: true });
    unsavedDialog.showModal();
  });
}

// ---------- 파일 ----------

async function newDocument() {
  if (await confirmDiscardChanges()) {
    loadDoc(createEmptyDoc(), NEW_FILE_NAME, null);
  }
}

async function openDocument() {
  if (!(await confirmDiscardChanges())) {
    return;
  }
  if (window.showOpenFilePicker) {
    let handles;
    try {
      handles = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: "한글 문서 (HWPX)·글자 파일", accept: { "application/hwp+zip": [".hwpx"], "text/plain": [".txt"] } }]
      });
    } catch (err) {
      if (err.name === "AbortError") {
        return;
      }
      fileInput.click();
      return;
    }
    await openFromFile(await handles[0].getFile(), handles[0]);
    return;
  }
  fileInput.click();
}

async function openFromFile(file, handle) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".hwpx")) {
    const doc = await readHwpx(new Uint8Array(await file.arrayBuffer()));
    loadDoc(doc, file.name, handle);
  } else if (lower.endsWith(".txt")) {
    loadDoc(createDocFromText(await file.text()), file.name.replace(/\.txt$/i, ".hwpx"), null);
  } else if (lower.endsWith(".hwp")) {
    throw new Error("HWP(옛 형식) 파일은 아직 열 수 없습니다. 한컴 한글에서 HWPX로 저장한 뒤 열어 주세요.");
  } else {
    throw new Error("열 수 있는 파일은 .hwpx와 .txt입니다.");
  }
}

function createHwpxBytes() {
  return writeHwpx(readEditorDoc(editor));
}

// 연 파일(또는 저장한 파일)이 있으면 그 파일에 쓰고, 없으면 다른 이름으로 저장한다. 저장하면 true.
async function saveDocument() {
  if (state.fileHandle) {
    try {
      await writeBytesToHandle(state.fileHandle, createHwpxBytes());
    } catch (err) {
      if (err.name === "AbortError" || err.name === "NotAllowedError") {
        return false;
      }
      throw err;
    }
    markSaved(state.fileHandle.name);
    return true;
  }
  return saveDocumentAs();
}

async function saveDocumentAs() {
  const bytes = createHwpxBytes();
  if (window.showSaveFilePicker) {
    let handle = null;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: state.fileName,
        types: [{ description: "한글 문서 (HWPX)", accept: { "application/hwp+zip": [".hwpx"] } }]
      });
    } catch (err) {
      if (err.name === "AbortError") {
        return false;
      }
      handle = null;
    }
    if (handle) {
      await writeBytesToHandle(handle, bytes);
      state.fileHandle = handle;
      markSaved(handle.name);
      return true;
    }
  }
  // 파일 고르기 창을 못 쓰는 브라우저: 이름을 물어 내려받기로 저장한다.
  const answer = prompt("저장할 파일 이름을 입력하세요.", state.fileName);
  if (!answer || !answer.trim()) {
    return false;
  }
  const name = ensureHwpxExtension(answer.trim());
  downloadBytes(bytes, name);
  state.fileHandle = null;
  markSaved(name);
  return true;
}

function ensureHwpxExtension(name) {
  return /\.hwpx$/i.test(name) ? name : name.replace(/\.(hwp|txt)$/i, "") + ".hwpx";
}

async function writeBytesToHandle(handle, bytes) {
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

function downloadBytes(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: HWPX_MIMETYPE }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function markSaved(name) {
  state.fileName = name;
  setDirty(false);
  clearDraft();
}

// ---------- 임시 저장 (이 브라우저에만 남는다) ----------

function saveDraft() {
  if (!state.dirty) {
    return;
  }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), fileName: state.fileName, doc: readEditorDoc(editor) }));
  } catch (err) {
    // 저장 공간을 못 쓰는 환경에서는 임시 저장 없이 계속한다.
  }
}

function clearDraft() {
  clearTimeout(state.draftTimer);
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (err) {
    // 무시
  }
}

function restoreDraft() {
  let draft = null;
  try {
    draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
  } catch (err) {
    draft = null;
  }
  if (!draft || !draft.doc) {
    return;
  }
  const when = new Date(draft.savedAt).toLocaleString("ko-KR");
  if (confirm("저장하지 않은 임시 문서가 있습니다 (" + (draft.fileName || NEW_FILE_NAME) + ", " + when + ").\n복구할까요?")) {
    loadDoc(normalizeDoc(draft.doc), draft.fileName || NEW_FILE_NAME, null);
    setDirty(true);
    saveDraft();
  } else {
    clearDraft();
  }
}

// ---------- 편집 ----------

function rememberSelection() {
  const selection = getSelection();
  if (selection.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer)) {
    state.savedRange = selection.getRangeAt(0).cloneRange();
    updateToolbarState();
  }
}

function restoreSelection() {
  editor.focus({ preventScroll: true });
  if (state.savedRange) {
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(state.savedRange);
  }
}

function runEditCommand(command, value) {
  restoreSelection();
  document.execCommand("styleWithCSS", false, true);
  document.execCommand(command, false, value);
  rememberSelection();
}

function applyFontName(font) {
  runEditCommand("fontName", font);
  markChanged();
}

function applyFontColor(color) {
  runEditCommand("foreColor", color);
  markChanged();
}

// execCommand의 글자 크기는 1~7 단계뿐이라, 7로 표시한 뒤 그 자리를 원하는 pt로 바꾼다.
function applyFontSize(size) {
  runEditCommand("fontSize", "7");
  state.pendingFontSize = size;
  replaceMarkedFontSize(size);
  markChanged();
}

function replaceMarkedFontSize(size) {
  editor.querySelectorAll('[style*="xxx-large"], font[size="7"]').forEach((element) => {
    element.removeAttribute("size");
    element.style.fontSize = size + "pt";
  });
}

function applyLineSpacing(value) {
  restoreSelection();
  findSelectedBlocks().forEach((block) => {
    block.style.lineHeight = value === DEFAULT_PARAGRAPH.lineSpacing ? "" : String(value / 100);
  });
  markChanged();
}

function findSelectedBlocks() {
  if (!state.savedRange) {
    return [];
  }
  let blocks = Array.from(editor.children).filter((block) => isBlockElement(block) && state.savedRange.intersectsNode(block));
  if (blocks.length === 0) {
    document.execCommand("formatBlock", false, "p");
    rememberSelection();
    blocks = Array.from(editor.children).filter((block) => isBlockElement(block) && state.savedRange.intersectsNode(block));
  }
  return blocks;
}

// 모두 지워 빈 화면이 되거나 문단 밖에 글자가 생기면 문단(<p>)으로 감싼다. 한글 조합 중에는 손대지 않는다.
function tidyEditor() {
  if (!editor.firstChild || (editor.childNodes.length === 1 && editor.firstChild.nodeName === "BR")) {
    renderEditorDoc(editor, createEmptyDoc());
    placeCaretAtStart();
  } else {
    const selection = getSelection();
    let node = selection.rangeCount ? selection.anchorNode : null;
    if (node && node !== editor && editor.contains(node)) {
      while (node.parentNode !== editor) {
        node = node.parentNode;
      }
      if (!isBlockElement(node)) {
        document.execCommand("formatBlock", false, "p");
      }
    }
  }
  if (state.pendingFontSize) {
    replaceMarkedFontSize(state.pendingFontSize);
  }
}

// 다른 곳에서 복사한 서식은 버리고 글자만 붙인다.
function pastePlainText(event) {
  event.preventDefault();
  const text = (event.clipboardData || window.clipboardData).getData("text/plain");
  document.execCommand("insertText", false, text.replace(/\r\n?/g, "\n"));
}

function handleEditorKeydown(event) {
  if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing) {
    event.preventDefault();
    document.execCommand("insertText", false, "\t");
  }
}

function handleShortcut(event) {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (event.key === "Escape" && !preview.hidden) {
    closePreview();
  } else if (mod && key === "s") {
    event.preventDefault();
    runSafely(event.shiftKey ? saveDocumentAs : saveDocument);
  } else if (mod && key === "o") {
    event.preventDefault();
    runSafely(openDocument);
  } else if (mod && key === "p") {
    event.preventDefault();
    printDocument();
  } else if (event.altKey && key === "n") {
    event.preventDefault();
    runSafely(newDocument);
  }
}

// ---------- 도구 모음 상태 ----------

function updateToolbarState() {
  if (!state.savedRange) {
    return;
  }
  const node = state.savedRange.startContainer;
  const element = node.nodeType === 1 ? node : node.parentElement;
  if (!element || !editor.contains(element)) {
    return;
  }
  const style = readRunStyle(element, editor);
  setSelectValue(fontNameSelect, style.font, style.font);
  setSelectValue(fontSizeSelect, String(style.size), String(style.size));
  fontColorInput.value = style.color.toLowerCase();
  setButtonActive("bold", style.bold);
  setButtonActive("italic", style.italic);
  setButtonActive("underline", style.underline);
  setButtonActive("strikeThrough", style.strike);

  let block = element;
  while (block && block !== editor && !isBlockElement(block)) {
    block = block.parentElement;
  }
  const props = readParagraphProps(block || editor, editor);
  document.querySelectorAll("[data-align]").forEach((button) => {
    button.classList.toggle("active", button.dataset.align === props.align);
  });
  setSelectValue(lineSpacingSelect, String(props.lineSpacing), props.lineSpacing + "%");
}

function setSelectValue(select, value, label) {
  if (!Array.from(select.options).some((option) => option.value === value)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = value;
}

function setButtonActive(command, active) {
  const button = document.querySelector('[data-command="' + command + '"]');
  button.classList.toggle("active", active);
  button.setAttribute("aria-pressed", String(active));
}

// ---------- 쪽 표시·상태 표시줄·확대 ----------

function scheduleRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(refreshStatus, 200);
}

function refreshStatus() {
  const counts = countDocChars(readEditorDoc(editor));
  const pages = updatePageMarks();
  document.getElementById("statusPages").textContent = "A4 · " + pages + "쪽";
  document.getElementById("statusChars").textContent = "글자 " + counts.withSpaces + "자 (공백 제외 " + counts.withoutSpaces + "자)";
  document.getElementById("statusZoom").textContent = "확대 " + Math.round(state.zoom * 100) + "%";
}

// 편집 화면에 쪽이 나뉘는 곳을 점선으로 보여 준다. 반환: 쪽 수
function updatePageMarks() {
  const cuts = computePageCuts(editor, PAGE_BODY_HEIGHT_PX);
  pageMarks.textContent = "";
  cuts.slice(1).forEach((cut, index) => {
    const mark = document.createElement("div");
    mark.className = "page-mark";
    mark.style.top = cut.start + "px";
    const label = document.createElement("span");
    label.textContent = index + 2 + "쪽";
    mark.appendChild(label);
    pageMarks.appendChild(mark);
  });
  return cuts.length;
}

function applyZoom(zoom) {
  state.zoom = zoom;
  paper.style.transform = "scale(" + zoom + ")";
  updatePaperSize();
  refreshStatus();
}

function updatePaperSize() {
  paperSizer.style.width = paper.offsetWidth * state.zoom + "px";
  paperSizer.style.height = paper.offsetHeight * state.zoom + "px";
}

// ---------- 미리보기·인쇄 ----------

function showPreview() {
  const sheets = buildPageSheets(readEditorDoc(editor));
  previewPages.replaceChildren(...sheets);
  previewInfo.textContent = "A4 · 전체 " + sheets.length + "쪽";
  preview.hidden = false;
  previewPages.scrollTop = 0;
  document.getElementById("previewClose").focus();
}

function closePreview() {
  preview.hidden = true;
  previewPages.replaceChildren();
  restoreSelection();
}

function buildPrintArea() {
  printArea.replaceChildren(...buildPageSheets(readEditorDoc(editor)));
}

function printDocument() {
  buildPrintArea();
  window.print();
}

startApp();
