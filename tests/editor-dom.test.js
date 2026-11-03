// editor-dom.js 테스트 — 화면(DOM)과 계산된 스타일이 필요해서 test.html에서만 돈다.

function createTestPage(html) {
  const page = document.createElement("div");
  page.className = "page doc-body page-measure";
  if (html !== undefined) {
    page.innerHTML = html;
  }
  document.body.appendChild(page);
  return page;
}

test("화면에 그린 문서를 다시 읽으면 같은 문서다", () => {
  const doc = normalizeDoc({
    paragraphs: [
      { align: "center", lineSpacing: 200, runs: [{ text: "네트워크 실습 안내", font: "바탕", size: 18, bold: true }] },
      { runs: [{ text: "본문 " }, { text: "밑줄", underline: true, color: "#C00000" }, { text: " 취소", strike: true, italic: true }] },
      { runs: [] },
      { align: "right", runs: [{ text: "줄바꿈\n다음 줄\n" }] }
    ]
  });
  const page = createTestPage();
  renderEditorDoc(page, doc);
  const read = readEditorDoc(page);
  page.remove();
  assertDeepEqual(read, doc, "문서 전체");
});

test("문단 끝의 자리 표시 <br>은 줄바꿈으로 세지 않는다", () => {
  const page = createTestPage("<p>가나<br></p><p><br></p>");
  const doc = readEditorDoc(page);
  page.remove();
  assertEqual(doc.paragraphs.length, 2, "문단 수");
  assertEqual(convertDocToText(doc), "가나\n", "글자");
});

test("Shift+Enter 줄바꿈은 문단 안 줄바꿈으로 읽는다", () => {
  const page = createTestPage("<p>가<br>나</p>");
  const doc = readEditorDoc(page);
  page.remove();
  assertEqual(doc.paragraphs.length, 1, "문단 수");
  assertEqual(doc.paragraphs[0].runs[0].text, "가\n나", "글자");
});

test("문단 밖 글자와 div 문단도 문단으로 읽는다", () => {
  const page = createTestPage("앞 글자<p>가운데</p><div>div 문단</div>");
  const doc = readEditorDoc(page);
  page.remove();
  assertEqual(convertDocToText(doc), "앞 글자\n가운데\ndiv 문단", "글자와 문단");
});

test("겹친 태그의 굵게·기울임·밑줄·취소선과 글꼴·크기·색을 함께 읽는다", () => {
  const page = createTestPage('<p><b><u><span style="font-family: 돋움; font-size: 14pt; color: rgb(255, 0, 0); text-decoration-line: line-through;"><i>가</i></span></u></b></p>');
  const run = readEditorDoc(page).paragraphs[0].runs[0];
  page.remove();
  assertDeepEqual(run, { text: "가", font: "돋움", size: 14, bold: true, italic: true, underline: true, strike: true, color: "#FF0000" }, "글자 조각");
});

// 쪽 구간이 빈틈없이 이어지고, 쪽마다 본문 높이를 넘지 않는지 확인한다.
function checkPageCuts(page, cuts) {
  for (let i = 0; i < cuts.length; i++) {
    assertTrue(cuts[i].end - cuts[i].start <= PAGE_BODY_HEIGHT_PX + 1, (i + 1) + "쪽 높이가 본문 높이를 넘음: " + (cuts[i].end - cuts[i].start));
    if (i > 0) {
      assertEqual(cuts[i].start, cuts[i - 1].end, (i + 1) + "쪽이 앞 쪽과 이어짐");
    }
  }
  const blocks = Array.from(page.children);
  const last = blocks[blocks.length - 1];
  assertTrue(Math.abs(cuts[cuts.length - 1].end - (last.offsetTop + last.offsetHeight)) < 1, "마지막 쪽이 본문 끝까지 감");
}

test("짧은 문단이 많으면 쪽 높이에서 다음 쪽으로 넘어가고 쪽 번호가 붙는다", () => {
  const lines = [];
  for (let i = 1; i <= 120; i++) {
    lines.push(i + "번째 문단입니다.");
  }
  const doc = createDocFromText(lines.join("\n"));
  const page = createTestPage();
  renderEditorDoc(page, doc);
  const cuts = computePageCuts(page, PAGE_BODY_HEIGHT_PX);
  const blockTops = Array.from(page.children).map((block) => block.offsetTop);
  checkPageCuts(page, cuts);
  page.remove();
  assertTrue(cuts.length >= 3, "쪽 수: " + cuts.length);
  cuts.slice(1).forEach((cut, i) => {
    assertTrue(blockTops.some((top) => Math.abs(top - cut.start) < 6), (i + 2) + "쪽이 문단 사이에서 시작");
  });
  const sheets = buildPageSheets(doc);
  assertEqual(sheets.length, cuts.length, "미리보기 쪽 수");
  assertEqual(sheets[sheets.length - 1].querySelector(".sheet-number").textContent, "- " + sheets.length + " -", "마지막 쪽 번호");
});

test("한 쪽보다 긴 문단은 줄 사이에서 잘려 여러 쪽에 이어진다", () => {
  const doc = createDocFromText("긴 문단 시작. " + "학생들은 실습 순서에 따라 명령을 입력하고 결과를 기록합니다. ".repeat(120) + "긴 문단 끝.");
  const page = createTestPage();
  renderEditorDoc(page, doc);
  const cuts = computePageCuts(page, PAGE_BODY_HEIGHT_PX);
  checkPageCuts(page, cuts);
  const lineHeight = parseFloat(getComputedStyle(page.firstChild).lineHeight);
  const firstTop = page.firstChild.offsetTop;
  page.remove();
  assertTrue(cuts.length >= 2, "쪽 수: " + cuts.length);
  cuts.slice(1).forEach((cut, i) => {
    const lines = (cut.start - firstTop) / lineHeight;
    assertTrue(Math.abs(lines - Math.round(lines)) < 0.35, (i + 2) + "쪽이 줄 경계 근처에서 시작 (줄 " + lines.toFixed(2) + ")");
  });
});

test("빈 문서도 한 쪽으로 미리보기를 만든다", () => {
  const sheets = buildPageSheets(createEmptyDoc());
  assertEqual(sheets.length, 1, "쪽 수");
});
