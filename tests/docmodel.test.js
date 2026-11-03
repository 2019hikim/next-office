// docmodel.js 테스트

test("글자 파일을 줄마다 한 문단으로 읽는다", () => {
  const doc = createDocFromText("제목\r\n첫째 문단\n\n넷째 줄");
  assertEqual(doc.paragraphs.length, 4, "문단 수");
  assertEqual(doc.paragraphs[2].runs.length, 0, "빈 줄은 빈 문단");
  assertEqual(convertDocToText(doc), "제목\n첫째 문단\n\n넷째 줄", "다시 글자로");
});

test("모양이 같은 이웃 조각은 합치고 빈 조각은 뺀다", () => {
  const doc = normalizeDoc({
    paragraphs: [{ runs: [{ text: "가" }, { text: "" }, { text: "나" }, { text: "다", bold: true }] }]
  });
  assertEqual(doc.paragraphs[0].runs.length, 2, "조각 수");
  assertEqual(doc.paragraphs[0].runs[0].text, "가나", "합친 글자");
});

test("문단이 없으면 빈 문단 하나를 만든다", () => {
  assertEqual(normalizeDoc({ paragraphs: [] }).paragraphs.length, 1, "문단 수");
  assertEqual(normalizeDoc(null).paragraphs.length, 1, "null 문서");
});

test("잘못된 모양 값은 기본값으로 바꾼다", () => {
  const doc = normalizeDoc({ paragraphs: [{ align: "middle", lineSpacing: 9999, runs: [{ text: "가", size: -3, color: "red" }] }] });
  const paragraph = doc.paragraphs[0];
  assertEqual(paragraph.align, DEFAULT_PARAGRAPH.align, "정렬");
  assertEqual(paragraph.lineSpacing, DEFAULT_PARAGRAPH.lineSpacing, "줄 간격");
  assertEqual(paragraph.runs[0].size, DEFAULT_RUN_STYLE.size, "크기");
  assertEqual(paragraph.runs[0].color, "#000000", "색");
});

test("글자 수는 공백 포함·제외를 따로 센다", () => {
  const counts = countDocChars(createDocFromText("가 나\n다\t라"));
  assertEqual(counts.withSpaces, 6, "공백 포함 (줄바꿈 제외)");
  assertEqual(counts.withoutSpaces, 4, "공백 제외");
});
