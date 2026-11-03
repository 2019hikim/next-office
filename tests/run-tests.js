// 실행: node tests/run-tests.js  (저장소 루트에서)
// 소스 파일은 고치지 않고 그대로 읽어 와서 테스트한다 (브라우저에서 바로 열리는 방식 유지).
// 화면(editor-dom.js) 테스트는 브라우저가 필요해서 test.html에서만 돈다.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = vm.createContext({
  console: console,
  TextEncoder: TextEncoder,
  TextDecoder: TextDecoder,
  Blob: Blob,
  Response: Response,
  CompressionStream: CompressionStream,
  DecompressionStream: DecompressionStream
});
const files = [
  "xml.js",
  "zip.js",
  "docmodel.js",
  "hwpx.js",
  "tests/mini-test.js",
  "tests/xml.test.js",
  "tests/zip.test.js",
  "tests/docmodel.test.js",
  "tests/hwpx.test.js"
];
for (const file of files) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

vm.runInContext("runTests()", context).then((results) => {
  let pass = 0;
  for (const r of results) {
    if (r.ok) {
      pass++;
      console.log("통과  " + r.name);
    } else {
      console.log("실패  " + r.name);
      console.log("      " + r.error);
    }
  }
  console.log("");
  console.log("전체 " + results.length + "개 중 통과 " + pass + "개, 실패 " + (results.length - pass) + "개");
  process.exitCode = pass === results.length ? 0 : 1;
});
