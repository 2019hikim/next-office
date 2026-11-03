// zip.js 테스트

async function deflateForTest(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

test("CRC32가 표준 검사값과 같다", () => {
  assertEqual(computeCrc32(encodeUtf8("123456789")), 0xcbf43926, "CRC32(123456789)");
});

test("ZIP에 쓴 파일을 이름과 내용 그대로 다시 읽는다", async () => {
  const zip = writeZip([
    { name: "mimetype", data: "application/hwp+zip" },
    { name: "폴더/한글 이름.txt", data: "가나다\n라마바" }
  ]);
  const files = await readZip(zip);
  assertDeepEqual(Object.keys(files), ["mimetype", "폴더/한글 이름.txt"], "파일 목록");
  assertEqual(decodeUtf8(files["폴더/한글 이름.txt"]), "가나다\n라마바", "한글 내용");
});

test("deflate로 압축한 ZIP 항목도 풀어 읽는다", async () => {
  const data = encodeUtf8("압축된 한글 본문 ".repeat(50));
  const zip = writeZip([{ name: "a.txt", data: data, deflated: await deflateForTest(data) }]);
  assertEqual(new DataView(zip.buffer).getUint16(8, true), 8, "압축 방식 번호");
  const files = await readZip(zip);
  assertEqual(decodeUtf8(files["a.txt"]), "압축된 한글 본문 ".repeat(50), "풀어 읽은 내용");
});

test("같은 내용·같은 시각이면 같은 바이트를 쓴다", () => {
  const date = new Date(2026, 10, 3, 9, 30, 0);
  const a = writeZip([{ name: "a.txt", data: "가" }], { date: date });
  const b = writeZip([{ name: "a.txt", data: "가" }], { date: date });
  assertDeepEqual(Array.from(a), Array.from(b), "바이트");
});

test("ZIP이 아닌 파일은 알기 쉬운 오류를 낸다", async () => {
  await assertRejects(() => readZip(encodeUtf8("그냥 글자 파일")), /ZIP 묶음 파일이 아닙니다/);
});
