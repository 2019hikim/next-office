// 작은 XML 도구: 글자 이스케이프와 간단한 파서 (HWPX 읽기·쓰기용)
// 브라우저(index.html)와 node(tests/run-tests.js) 양쪽에서 같이 쓴다.
// 파서 결과 노드: { name, attrs, children: [노드 | 문자열] } — name은 접두사를 포함한 원래 이름(예: "hp:t")

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXmlEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (match, entity) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[entity];
  });
}

function parseXml(text) {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const root = { name: "#document", attrs: {}, children: [] };
  const stack = [root];
  let i = 0;

  function pushText(raw) {
    if (stack.length > 1 && raw.length > 0) {
      stack[stack.length - 1].children.push(decodeXmlEntities(raw));
    }
  }

  function findEnd(marker, from) {
    const end = source.indexOf(marker, from);
    if (end === -1) {
      throw new Error("XML 형식 오류: '" + marker + "'를 찾지 못했습니다");
    }
    return end;
  }

  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt === -1) {
      pushText(source.slice(i));
      break;
    }
    pushText(source.slice(i, lt));

    if (source.startsWith("<?", lt)) {
      i = findEnd("?>", lt) + 2;
    } else if (source.startsWith("<!--", lt)) {
      i = findEnd("-->", lt) + 3;
    } else if (source.startsWith("<![CDATA[", lt)) {
      const end = findEnd("]]>", lt);
      if (stack.length > 1) {
        stack[stack.length - 1].children.push(source.slice(lt + 9, end));
      }
      i = end + 3;
    } else if (source.startsWith("<!", lt)) {
      i = findEnd(">", lt) + 1;
    } else {
      const gt = findTagEnd(source, lt);
      const raw = source.slice(lt + 1, gt);
      if (raw[0] === "/") {
        if (stack.length === 1) {
          throw new Error("XML 형식 오류: 여는 태그 없이 닫는 태그가 있습니다");
        }
        stack.pop();
      } else {
        const selfClosing = raw.endsWith("/");
        const body = selfClosing ? raw.slice(0, -1) : raw;
        const nameMatch = body.match(/^\s*([^\s/>]+)/);
        if (!nameMatch) {
          throw new Error("XML 형식 오류: 태그 이름이 없습니다");
        }
        const node = { name: nameMatch[1], attrs: parseXmlAttrs(body.slice(nameMatch[0].length)), children: [] };
        stack[stack.length - 1].children.push(node);
        if (!selfClosing) {
          stack.push(node);
        }
      }
      i = gt + 1;
    }
  }

  if (stack.length !== 1) {
    throw new Error("XML 형식 오류: 닫히지 않은 태그가 있습니다 (" + stack[stack.length - 1].name + ")");
  }
  return root;
}

// 따옴표 안의 '>'는 건너뛰고 태그 끝을 찾는다.
function findTagEnd(source, from) {
  let quote = null;
  for (let i = from + 1; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i;
    }
  }
  throw new Error("XML 형식 오류: 태그가 닫히지 않았습니다");
}

function parseXmlAttrs(text) {
  const attrs = {};
  const pattern = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = pattern.exec(text))) {
    attrs[match[1]] = decodeXmlEntities(match[3] !== undefined ? match[3] : match[4]);
  }
  return attrs;
}

// "hp:t" → "t". 접두사가 파일마다 달라도 같은 요소로 찾기 위해 쓴다.
function getLocalName(name) {
  const colon = name.indexOf(":");
  return colon === -1 ? name : name.slice(colon + 1);
}

function findChildElements(node, localName) {
  return node.children.filter((child) => typeof child !== "string" && getLocalName(child.name) === localName);
}

function findChildElement(node, localName) {
  return findChildElements(node, localName)[0] || null;
}

function findElements(node, localName) {
  const found = [];
  (function visit(current) {
    current.children.forEach((child) => {
      if (typeof child === "string") {
        return;
      }
      if (getLocalName(child.name) === localName) {
        found.push(child);
      }
      visit(child);
    });
  })(node);
  return found;
}

function findElement(node, localName) {
  return findElements(node, localName)[0] || null;
}
