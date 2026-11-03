// hwpx.js 테스트

function makeLessonDoc() {
  return createDocFromText("네트워크 실습 안내\n이번 시간에는 IP 주소를 확인합니다.\n실습이 끝나면 결과를 제출합니다.");
}

async function saveAndReopen(doc) {
  return readHwpx(writeHwpx(doc));
}

test("R3 제목과 본문 두 문단이 저장 후 다시 열어도 같다", async () => {
  const doc = makeLessonDoc();
  const reopened = await saveAndReopen(doc);
  assertEqual(reopened.paragraphs.length, 3, "문단 수");
  assertEqual(convertDocToText(reopened), convertDocToText(doc), "글자와 문단 순서");
});

test("R6 글자 모양(글꼴·크기·굵게·기울임·밑줄·취소선·색)이 유지된다", async () => {
  const doc = normalizeDoc({
    paragraphs: [{
      runs: [
        { text: "제목", font: "바탕", size: 18, bold: true, color: "#1F4E79" },
        { text: " 기울임", italic: true },
        { text: " 밑줄", underline: true, size: 11.5 },
        { text: " 취소", strike: true, font: "돋움" }
      ]
    }]
  });
  const reopened = await saveAndReopen(doc);
  assertDeepEqual(reopened, doc, "문서 전체");
});

test("R7 문단 모양(정렬·줄 간격)이 유지된다", async () => {
  const doc = normalizeDoc({
    paragraphs: [
      { align: "center", lineSpacing: 200, runs: [{ text: "가운데" }] },
      { align: "right", lineSpacing: 100, runs: [{ text: "오른쪽" }] },
      { align: "left", runs: [{ text: "왼쪽" }] },
      { align: "justify", lineSpacing: 160, runs: [{ text: "양쪽" }] }
    ]
  });
  const reopened = await saveAndReopen(doc);
  assertDeepEqual(reopened.paragraphs.map((p) => [p.align, p.lineSpacing]),
    [["center", 200], ["right", 100], ["left", 160], ["justify", 160]], "정렬과 줄 간격");
});

test("문단 안 줄바꿈·탭·XML 특수 문자·빈 문단이 유지된다", async () => {
  const doc = normalizeDoc({
    paragraphs: [
      { runs: [{ text: "첫 줄\n둘째 줄\t탭 뒤 <태그> & \"따옴표\" '홑따옴표'" }] },
      { runs: [] },
      { runs: [{ text: "  앞뒤 공백  " }] }
    ]
  });
  const reopened = await saveAndReopen(doc);
  assertDeepEqual(reopened, doc, "문서 전체");
});

test("HWPX 묶음에 필요한 부품이 있고 모두 올바른 XML이다", () => {
  const entries = buildHwpxFiles(makeLessonDoc());
  assertEqual(entries[0].name, "mimetype", "첫 파일");
  assertEqual(entries[0].data, "application/hwp+zip", "mimetype 내용");
  ["version.xml", "Contents/header.xml", "Contents/section0.xml", "Contents/content.hpf", "META-INF/container.xml"].forEach((name) => {
    const entry = entries.find((e) => e.name === name);
    assertTrue(entry, name + "가 없음");
    parseXml(entry.data);
  });
});

test("ZIP 첫 항목은 압축하지 않은 mimetype이다", () => {
  const bytes = writeHwpx(makeLessonDoc());
  const view = new DataView(bytes.buffer);
  assertEqual(view.getUint16(8, true), 0, "압축 방식");
  assertEqual(decodeUtf8(bytes.subarray(30, 38)), "mimetype", "첫 파일 이름");
  assertEqual(decodeUtf8(bytes.subarray(38, 57)), "application/hwp+zip", "첫 파일 내용");
});

test("A4 용지 크기와 기본 여백이 구역 설정에 들어간다", () => {
  const section = buildHwpxFiles(makeLessonDoc()).find((e) => e.name === "Contents/section0.xml").data;
  const pagePr = findElement(parseXml(section), "pagePr");
  assertEqual(pagePr.attrs.width, "59528", "폭");
  assertEqual(pagePr.attrs.height, "84186", "높이");
  assertEqual(findChildElement(pagePr, "margin").attrs.left, "8504", "왼쪽 여백");
});

test("R4 같은 문서·같은 시각이면 같은 바이트로 저장된다", () => {
  const date = new Date(2026, 10, 3, 10, 0, 0);
  const a = writeHwpx(makeLessonDoc(), { date: date });
  const b = writeHwpx(makeLessonDoc(), { date: date });
  assertDeepEqual(Array.from(a), Array.from(b), "바이트");
});

test("한컴 형식의 hp:switch 줄 간격과 여러 구역, 압축된 묶음도 읽는다", async () => {
  const header = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<hh:head xmlns:hh="h" xmlns:hp="p" xmlns:hc="c"><hh:refList>' +
    '<hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕"/><hh:font id="1" face="함초롬돋움"/></hh:fontface>' +
    '<hh:fontface lang="LATIN"><hh:font id="0" face="Arial"/></hh:fontface></hh:fontfaces>' +
    '<hh:charProperties><hh:charPr id="0" height="1000" textColor="#000000"><hh:fontRef hangul="0" latin="0"/>' +
    '<hh:underline type="NONE"/><hh:strikeout shape="NONE"/></hh:charPr>' +
    '<hh:charPr id="7" height="1400" textColor="#FF0000"><hh:fontRef hangul="1" latin="0"/><hh:bold/>' +
    '<hh:underline type="BOTTOM" shape="SOLID"/><hh:strikeout shape="NONE"/></hh:charPr></hh:charProperties>' +
    '<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="JUSTIFY"/>' +
    '<hp:switch><hp:case><hh:lineSpacing type="PERCENT" value="180"/></hp:case><hp:default><hh:lineSpacing type="PERCENT" value="180"/></hp:default></hp:switch>' +
    '</hh:paraPr><hh:paraPr id="3"><hh:align horizontal="CENTER"/><hh:lineSpacing type="FIXED" value="2000"/></hh:paraPr></hh:paraProperties>' +
    '<hh:styles><hh:style id="0" paraPrIDRef="0" charPrIDRef="0"/></hh:styles></hh:refList></hh:head>';
  const section0 = '<hs:sec xmlns:hs="s" xmlns:hp="p"><hp:p paraPrIDRef="3" styleIDRef="0"><hp:run charPrIDRef="7"><hp:secPr/><hp:t>한컴</hp:t></hp:run>' +
    '<hp:run charPrIDRef="0"><hp:t>에서<hp:lineBreak/>만든 문서</hp:t></hp:run></hp:p></hs:sec>';
  const section1 = '<hs:sec xmlns:hs="s" xmlns:hp="p"><hp:p paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>둘째 구역</hp:t></hp:run></hp:p></hs:sec>';
  const entries = [
    { name: "mimetype", data: "application/hwp+zip" },
    { name: "Contents/header.xml", data: header },
    { name: "Contents/section1.xml", data: section1 },
    { name: "Contents/section0.xml", data: section0 }
  ];
  for (const entry of entries.slice(1)) {
    entry.data = encodeUtf8(entry.data);
    entry.deflated = await deflateForTest(entry.data);
  }
  const doc = await readHwpx(writeZip(entries));
  assertEqual(doc.paragraphs.length, 2, "문단 수");
  const first = doc.paragraphs[0];
  assertEqual(first.align, "center", "정렬");
  assertEqual(first.lineSpacing, 160, "고정 줄 간격은 기본값으로");
  assertDeepEqual(first.runs[0], { text: "한컴", font: "함초롬돋움", size: 14, bold: true, italic: false, underline: true, strike: false, color: "#FF0000" }, "첫 조각");
  assertEqual(first.runs[1].text, "에서\n만든 문서", "문단 안 줄바꿈");
  assertEqual(doc.paragraphs[1].lineSpacing, 180, "hp:switch 안 줄 간격");
  assertEqual(doc.paragraphs[1].runs[0].font, "함초롬바탕", "둘째 구역 글꼴");
});

test("HWPX가 아닌 ZIP은 알기 쉬운 오류를 낸다", async () => {
  await assertRejects(() => readHwpx(writeZip([{ name: "a.txt", data: "가" }])), /HWPX 문서가 아닙니다/);
  await assertRejects(() => readHwpx(writeZip([{ name: "mimetype", data: "application/zip" }])), /mimetype/);
});
