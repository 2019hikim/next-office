// xml.js 테스트

test("XML 특수 문자를 이스케이프하고 다시 읽으면 원래 글자다", () => {
  const text = 'a < b && "c" > \'d\'';
  const root = parseXml("<t>" + escapeXml(text) + "</t>");
  assertEqual(root.children[0].children.join(""), text, "글자");
});

test("속성, 접두사 이름, 빈 태그를 읽는다", () => {
  const root = parseXml('<?xml version="1.0"?><hp:p id="3" note=\'a&amp;b\'><hp:run charPrIDRef="1"/><!-- 주석 --></hp:p>');
  const p = root.children[0];
  assertEqual(p.name, "hp:p", "이름");
  assertEqual(getLocalName(p.name), "p", "접두사 뺀 이름");
  assertEqual(p.attrs.id, "3", "id");
  assertEqual(p.attrs.note, "a&b", "엔티티가 든 속성");
  assertEqual(findChildElement(p, "run").attrs.charPrIDRef, "1", "빈 태그 속성");
});

test("숫자 엔티티와 CDATA를 글자로 읽는다", () => {
  const root = parseXml("<t>&#xAC00;&#45208;<![CDATA[<다>]]></t>");
  assertEqual(root.children[0].children.join(""), "가나<다>", "글자");
});

test("닫히지 않은 XML은 오류를 낸다", async () => {
  await assertRejects(() => parseXml("<a><b></a>"), /XML 형식 오류/);
});

test("깊은 곳의 요소도 이름으로 찾는다", () => {
  const root = parseXml("<a><b><c id='1'/></b><c id='2'/></a>");
  assertDeepEqual(findElements(root, "c").map((c) => c.attrs.id), ["1", "2"], "찾은 순서");
});
