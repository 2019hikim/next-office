// HWPX(한글 문서 ZIP 묶음) 쓰기·읽기: 문서 모델(docmodel.js) ↔ HWPX 바이트
// 쓰기: A4 한 구역에 문단 모양(정렬·줄 간격)과 글자 모양(글꼴·크기·굵게·기울임·밑줄·취소선·색)만 담는다.
// 읽기: 본문 문단의 글자, 문단 안 줄바꿈·탭, 위 모양만 가져온다. 표·그림·머리말 등은 아직 건너뛴다.

const HWPX_MIMETYPE = "application/hwp+zip";
// HWPUNIT: 1pt = 100, 1mm ≈ 283.46. A4 210×297mm, 한컴 기본 여백(왼·오 30, 위 20, 아래 15, 머리말·꼬리말 15mm)
const HWPX_PAGE = { width: 59528, height: 84186, left: 8504, right: 8504, top: 5668, bottom: 4252, header: 4252, footer: 4252, gutter: 0 };
const HWPX_LANGS = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"];
const HWPX_ALIGN_OUT = { left: "LEFT", center: "CENTER", right: "RIGHT", justify: "JUSTIFY" };
const HWPX_ALIGN_IN = { LEFT: "left", CENTER: "center", RIGHT: "right", JUSTIFY: "justify", DISTRIBUTE: "justify", DISTRIBUTE_SPACE: "justify" };
const HWPX_XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';
const HWPX_NS = [
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"',
  'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"',
  'xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph"',
  'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"',
  'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"',
  'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"',
  'xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history"',
  'xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page"',
  'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:opf="http://www.idpf.org/2007/opf/"',
  'xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart"',
  'xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"',
  'xmlns:epub="http://www.idpf.org/2007/ops"',
  'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"'
].join(" ");

// ---------- 쓰기 ----------

function writeHwpx(doc, options) {
  return writeZip(buildHwpxFiles(doc), options);
}

// ZIP에 넣을 파일 목록. mimetype은 반드시 첫 번째, 무압축이다.
function buildHwpxFiles(doc) {
  const normalized = normalizeDoc(doc);
  const styles = collectHwpxStyles(normalized);
  return [
    { name: "mimetype", data: HWPX_MIMETYPE },
    { name: "version.xml", data: buildVersionXml() },
    { name: "Contents/header.xml", data: buildHeaderXml(styles) },
    { name: "Contents/section0.xml", data: buildSectionXml(styles) },
    { name: "Preview/PrvText.txt", data: convertDocToText(normalized).replace(/\n/g, "\r\n") },
    { name: "settings.xml", data: buildSettingsXml() },
    { name: "META-INF/container.rdf", data: buildContainerRdf() },
    { name: "Contents/content.hpf", data: buildContentHpf() },
    { name: "META-INF/container.xml", data: buildContainerXml() },
    { name: "META-INF/manifest.xml", data: HWPX_XML_DECL + '<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>' }
  ];
}

function makeStyleKey(style) {
  return STYLE_KEYS.map((key) => style[key]).join("|");
}

// 문서에 쓰인 글꼴·글자 모양·문단 모양에 번호를 매긴다. 0번은 항상 기본값이다.
function collectHwpxStyles(doc) {
  const fonts = [DEFAULT_RUN_STYLE.font];
  const charPrs = [createRun("", DEFAULT_RUN_STYLE)];
  const charKeys = [makeStyleKey(DEFAULT_RUN_STYLE)];
  const paraPrs = [createParagraph([], DEFAULT_PARAGRAPH)];
  const paraKeys = [DEFAULT_PARAGRAPH.align + "|" + DEFAULT_PARAGRAPH.lineSpacing];

  function findFontId(font) {
    let id = fonts.indexOf(font);
    if (id < 0) {
      fonts.push(font);
      id = fonts.length - 1;
    }
    return id;
  }

  function findCharPrId(run) {
    findFontId(run.font);
    const key = makeStyleKey(run);
    let id = charKeys.indexOf(key);
    if (id < 0) {
      charKeys.push(key);
      charPrs.push(createRun("", run));
      id = charPrs.length - 1;
    }
    return id;
  }

  function findParaPrId(paragraph) {
    const key = paragraph.align + "|" + paragraph.lineSpacing;
    let id = paraKeys.indexOf(key);
    if (id < 0) {
      paraKeys.push(key);
      paraPrs.push(createParagraph([], paragraph));
      id = paraPrs.length - 1;
    }
    return id;
  }

  const paragraphs = doc.paragraphs.map((paragraph) => ({
    paraPrId: findParaPrId(paragraph),
    runs: paragraph.runs.map((run) => ({ charPrId: findCharPrId(run), text: run.text }))
  }));

  return {
    fonts: fonts,
    charPrs: charPrs,
    paraPrs: paraPrs,
    paragraphs: paragraphs,
    findFontId: findFontId
  };
}

function buildVersionXml() {
  return HWPX_XML_DECL +
    '<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="11, 0, 0, 0"/>';
}

function buildSettingsXml() {
  return HWPX_XML_DECL +
    '<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0">' +
    '<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>';
}

function buildContainerXml() {
  return HWPX_XML_DECL +
    '<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">' +
    '<ocf:rootfiles>' +
    '<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>' +
    '<ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/>' +
    '<ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/>' +
    '</ocf:rootfiles></ocf:container>';
}

function buildContainerRdf() {
  const pkg = "http://www.hancom.co.kr/hwpml/2016/meta/pkg#";
  return HWPX_XML_DECL +
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="' + pkg + '" rdf:resource="Contents/header.xml"/></rdf:Description>' +
    '<rdf:Description rdf:about="Contents/header.xml"><rdf:type rdf:resource="' + pkg + 'HeaderFile"/></rdf:Description>' +
    '<rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="' + pkg + '" rdf:resource="Contents/section0.xml"/></rdf:Description>' +
    '<rdf:Description rdf:about="Contents/section0.xml"><rdf:type rdf:resource="' + pkg + 'SectionFile"/></rdf:Description>' +
    '<rdf:Description rdf:about=""><rdf:type rdf:resource="' + pkg + 'Document"/></rdf:Description>' +
    '</rdf:RDF>';
}

function buildContentHpf() {
  return HWPX_XML_DECL +
    '<opf:package ' + HWPX_NS + ' version="" unique-identifier="" id="">' +
    '<opf:metadata><opf:title/><opf:language>ko</opf:language>' +
    '<opf:meta name="creator" content="text">다음오피스</opf:meta></opf:metadata>' +
    '<opf:manifest>' +
    '<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>' +
    '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>' +
    '<opf:item id="settings" href="settings.xml" media-type="application/xml"/>' +
    '</opf:manifest>' +
    '<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine>' +
    '</opf:package>';
}

function buildLangAttrs(value) {
  return HWPX_LANGS.map((lang) => lang.toLowerCase() + '="' + value + '"').join(" ");
}

function buildBorderFillXml(id) {
  const line = (name) => '<hh:' + name + ' type="NONE" width="0.1 mm" color="#000000"/>';
  return '<hh:borderFill id="' + id + '" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">' +
    '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>' +
    line("leftBorder") + line("rightBorder") + line("topBorder") + line("bottomBorder") +
    '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>';
}

function buildCharPrXml(id, style, fontId) {
  return '<hh:charPr id="' + id + '" height="' + Math.round(style.size * 100) + '" textColor="' + style.color +
    '" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">' +
    '<hh:fontRef ' + buildLangAttrs(fontId) + '/>' +
    '<hh:ratio ' + buildLangAttrs(100) + '/>' +
    '<hh:spacing ' + buildLangAttrs(0) + '/>' +
    '<hh:relSz ' + buildLangAttrs(100) + '/>' +
    '<hh:offset ' + buildLangAttrs(0) + '/>' +
    (style.italic ? '<hh:italic/>' : '') +
    (style.bold ? '<hh:bold/>' : '') +
    '<hh:underline type="' + (style.underline ? 'BOTTOM' : 'NONE') + '" shape="SOLID" color="' + style.color + '"/>' +
    '<hh:strikeout shape="' + (style.strike ? 'SOLID' : 'NONE') + '" color="' + style.color + '"/>' +
    '<hh:outline type="NONE"/>' +
    '<hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/>' +
    '</hh:charPr>';
}

function buildParaPrXml(id, paragraph) {
  const zero = (name) => '<hc:' + name + ' value="0" unit="HWPUNIT"/>';
  return '<hh:paraPr id="' + id + '" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">' +
    '<hh:align horizontal="' + HWPX_ALIGN_OUT[paragraph.align] + '" vertical="BASELINE"/>' +
    '<hh:heading type="NONE" idRef="0" level="0"/>' +
    '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>' +
    '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>' +
    '<hh:margin>' + zero("intent") + zero("left") + zero("right") + zero("prev") + zero("next") + '</hh:margin>' +
    '<hh:lineSpacing type="PERCENT" value="' + paragraph.lineSpacing + '" unit="HWPUNIT"/>' +
    '<hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>' +
    '</hh:paraPr>';
}

function buildHeaderXml(styles) {
  const fontList = styles.fonts.map((font, id) =>
    '<hh:font id="' + id + '" face="' + escapeXml(font) + '" type="TTF" isEmbedded="0"/>'
  ).join("");
  const fontfaces = HWPX_LANGS.map((lang) =>
    '<hh:fontface lang="' + lang + '" fontCnt="' + styles.fonts.length + '">' + fontList + '</hh:fontface>'
  ).join("");
  const charPrs = styles.charPrs.map((style, id) => buildCharPrXml(id, style, styles.findFontId(style.font))).join("");
  const paraPrs = styles.paraPrs.map((paragraph, id) => buildParaPrXml(id, paragraph)).join("");

  return HWPX_XML_DECL +
    '<hh:head ' + HWPX_NS + ' version="1.4" secCnt="1">' +
    '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>' +
    '<hh:refList>' +
    '<hh:fontfaces itemCnt="' + HWPX_LANGS.length + '">' + fontfaces + '</hh:fontfaces>' +
    '<hh:borderFills itemCnt="2">' + buildBorderFillXml(1) + buildBorderFillXml(2) + '</hh:borderFills>' +
    '<hh:charProperties itemCnt="' + styles.charPrs.length + '">' + charPrs + '</hh:charProperties>' +
    '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>' +
    '<hh:paraProperties itemCnt="' + styles.paraPrs.length + '">' + paraPrs + '</hh:paraProperties>' +
    '<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>' +
    '</hh:refList>' +
    '<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>' +
    '<hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption>' +
    '<hh:trackchageConfig flags="56"/>' +
    '</hh:head>';
}

function buildSecPrXml() {
  const page = HWPX_PAGE;
  const noteFormat = '<hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>';
  const borderFill = (type) =>
    '<hp:pageBorderFill type="' + type + '" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">' +
    '<hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>';
  return '<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">' +
    '<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>' +
    '<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>' +
    '<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>' +
    '<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>' +
    '<hp:pagePr landscape="WIDELY" width="' + page.width + '" height="' + page.height + '" gutterType="LEFT_ONLY">' +
    '<hp:margin header="' + page.header + '" footer="' + page.footer + '" gutter="' + page.gutter + '" left="' + page.left + '" right="' + page.right + '" top="' + page.top + '" bottom="' + page.bottom + '"/>' +
    '</hp:pagePr>' +
    '<hp:footNotePr>' + noteFormat + '<hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>' +
    '<hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/>' +
    '<hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>' +
    '<hp:endNotePr>' + noteFormat + '<hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/>' +
    '<hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/>' +
    '<hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>' +
    borderFill("BOTH") + borderFill("EVEN") + borderFill("ODD") +
    '</hp:secPr>';
}

// "\n" → <hp:lineBreak/>, "\t" → <hp:tab/>
function buildTextXml(text) {
  return text.split(/(\n|\t)/).map((part) => {
    if (part === "\n") {
      return "<hp:lineBreak/>";
    }
    if (part === "\t") {
      return '<hp:tab width="4000" leader="0" type="1"/>';
    }
    return escapeXml(part);
  }).join("");
}

function buildSectionXml(styles) {
  const paragraphs = styles.paragraphs.map((paragraph, index) => {
    let body = "";
    if (index === 0) {
      const firstCharPr = paragraph.runs.length ? paragraph.runs[0].charPrId : 0;
      body += '<hp:run charPrIDRef="' + firstCharPr + '">' + buildSecPrXml() +
        '<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl></hp:run>';
    }
    paragraph.runs.forEach((run) => {
      body += '<hp:run charPrIDRef="' + run.charPrId + '"><hp:t>' + buildTextXml(run.text) + '</hp:t></hp:run>';
    });
    if (index > 0 && paragraph.runs.length === 0) {
      body += '<hp:run charPrIDRef="0"/>';
    }
    return '<hp:p id="' + index + '" paraPrIDRef="' + paragraph.paraPrId + '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' + body + '</hp:p>';
  }).join("");

  return HWPX_XML_DECL + '<hs:sec ' + HWPX_NS + '>' + paragraphs + '</hs:sec>';
}

// ---------- 읽기 ----------

async function readHwpx(bytes) {
  const files = await readZip(bytes);
  if (files["mimetype"]) {
    const mimetype = decodeUtf8(files["mimetype"]).trim();
    if (mimetype !== HWPX_MIMETYPE) {
      throw new Error("HWPX 문서가 아닙니다 (mimetype: " + mimetype + ")");
    }
  }
  if (!files["Contents/header.xml"]) {
    throw new Error("HWPX 문서가 아닙니다 (Contents/header.xml이 없습니다)");
  }
  const sectionNames = findHwpxSectionNames(files);
  if (sectionNames.length === 0) {
    throw new Error("HWPX 문서에 본문 구역(section)이 없습니다");
  }
  const header = readHwpxHeader(parseXml(decodeUtf8(files["Contents/header.xml"])));
  const paragraphs = [];
  sectionNames.forEach((name) => {
    readHwpxSection(parseXml(decodeUtf8(files[name])), header, paragraphs);
  });
  return normalizeDoc({ paragraphs: paragraphs });
}

// content.hpf의 spine 순서를 따르고, 없으면 section0, section1… 순서로 읽는다.
function findHwpxSectionNames(files) {
  const hpfName = Object.keys(files).find((name) => /content\.hpf$/i.test(name));
  if (hpfName) {
    const root = parseXml(decodeUtf8(files[hpfName]));
    const hrefs = {};
    findElements(root, "item").forEach((item) => {
      hrefs[item.attrs.id] = item.attrs.href;
    });
    const names = findElements(root, "itemref")
      .map((ref) => hrefs[ref.attrs.idref])
      .filter((href) => href && /section\d+\.xml$/i.test(href) && files[href]);
    if (names.length) {
      return names;
    }
  }
  return Object.keys(files)
    .filter((name) => /^Contents\/section\d+\.xml$/.test(name))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
}

function readHwpxHeader(root) {
  const fonts = {};
  findElements(root, "fontface").forEach((fontface) => {
    if (fontface.attrs.lang === "HANGUL") {
      findElements(fontface, "font").forEach((font) => {
        fonts[font.attrs.id] = font.attrs.face;
      });
    }
  });

  const charPrs = {};
  findElements(root, "charPr").forEach((charPr) => {
    const fontRef = findChildElement(charPr, "fontRef");
    const underline = findChildElement(charPr, "underline");
    const strikeout = findChildElement(charPr, "strikeout");
    const height = Number(charPr.attrs.height);
    charPrs[charPr.attrs.id] = createRun("", {
      font: fontRef ? fonts[fontRef.attrs.hangul] : undefined,
      size: height > 0 ? height / 100 : undefined,
      bold: Boolean(findChildElement(charPr, "bold")),
      italic: Boolean(findChildElement(charPr, "italic")),
      underline: Boolean(underline) && underline.attrs.type !== undefined && underline.attrs.type !== "NONE",
      strike: Boolean(strikeout) && strikeout.attrs.shape !== undefined && strikeout.attrs.shape !== "NONE",
      color: /^#[0-9a-fA-F]{6}$/.test(charPr.attrs.textColor || "") ? charPr.attrs.textColor : undefined
    });
  });

  const paraPrs = {};
  findElements(root, "paraPr").forEach((paraPr) => {
    const align = findChildElement(paraPr, "align");
    const lineSpacing = findElement(paraPr, "lineSpacing");
    paraPrs[paraPr.attrs.id] = createParagraph([], {
      align: align ? HWPX_ALIGN_IN[align.attrs.horizontal] : undefined,
      lineSpacing: lineSpacing && (lineSpacing.attrs.type || "PERCENT") === "PERCENT" ? Number(lineSpacing.attrs.value) : undefined
    });
  });

  const styles = {};
  findElements(root, "style").forEach((style) => {
    styles[style.attrs.id] = { paraPrId: style.attrs.paraPrIDRef, charPrId: style.attrs.charPrIDRef };
  });

  return { charPrs: charPrs, paraPrs: paraPrs, styles: styles };
}

// 구역의 맨 위 문단(hp:p)만 읽는다. 표 안의 문단처럼 깊이 들어간 문단은 아직 건너뛴다.
function readHwpxSection(root, header, paragraphs) {
  const section = root.children.find((child) => typeof child !== "string");
  if (!section) {
    return;
  }
  findChildElements(section, "p").forEach((p) => {
    const style = header.styles[p.attrs.styleIDRef] || {};
    const paraPr = header.paraPrs[p.attrs.paraPrIDRef] || header.paraPrs[style.paraPrId] || DEFAULT_PARAGRAPH;
    const runs = [];
    findChildElements(p, "run").forEach((run) => {
      const charPr = header.charPrs[run.attrs.charPrIDRef] || header.charPrs[style.charPrId] || DEFAULT_RUN_STYLE;
      findChildElements(run, "t").forEach((t) => {
        runs.push(createRun(readHwpxText(t), charPr));
      });
    });
    paragraphs.push(createParagraph(runs, paraPr));
  });
}

function readHwpxText(node) {
  return node.children.map((child) => {
    if (typeof child === "string") {
      return child;
    }
    const name = getLocalName(child.name);
    if (name === "lineBreak") {
      return "\n";
    }
    if (name === "tab") {
      return "\t";
    }
    if (name === "nbSpace" || name === "fwSpace") {
      return " ";
    }
    return "";
  }).join("");
}
