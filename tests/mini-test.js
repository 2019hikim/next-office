// 아주 작은 테스트 도구. 브라우저(test.html)와 node(tests/run-tests.js) 양쪽에서 같이 쓴다.
// test 함수 안에서 await를 쓸 수 있도록 runTests는 Promise를 돌려준다.
var TESTS = [];

function test(name, fn) {
  TESTS.push({ name: name, fn: fn });
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || "값이 다름") + " · 기대: " + JSON.stringify(expected) + " · 실제: " + JSON.stringify(actual));
  }
}

function assertDeepEqual(actual, expected, message) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error((message || "내용이 다름") + " · 기대: " + e + " · 실제: " + a);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message || "조건이 참이 아님");
  }
}

async function assertRejects(fn, pattern, message) {
  try {
    await fn();
  } catch (err) {
    if (pattern && !pattern.test(err.message)) {
      throw new Error((message || "오류 내용이 다름") + " · 실제 오류: " + err.message);
    }
    return;
  }
  throw new Error((message || "오류가 나야 함") + " · 오류 없이 끝남");
}

async function runTests() {
  var results = [];
  for (var i = 0; i < TESTS.length; i++) {
    var t = TESTS[i];
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
    } catch (err) {
      results.push({ name: t.name, ok: false, error: err && err.message ? err.message : String(err) });
    }
  }
  return results;
}
