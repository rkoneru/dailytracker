import { zip } from './zip.js';

// A PowerPoint deck, written by hand.
//
// Open XML is verbose but it is not complicated, and what a status pack
// actually needs is a title slide, bulleted slides and tables. That is an
// afternoon of XML rather than a megabyte of library, and it keeps the promise
// the rest of the app makes: no runtime dependencies.
//
// The file this produces opens in PowerPoint, Keynote, LibreOffice Impress and
// Google Slides. Google Slides has no import API worth the name, so "export to
// Google Slides" is the same file: you upload the .pptx to Drive and open it,
// which converts it. Saying that plainly in the UI is better than implying a
// direct integration that does not exist.

// A slide is 16:9 at the Open XML unit — 914400 EMU to the inch.
//
// The two numbers are written out rather than computed from 13.333 x 7.5:
// that rounds to 12193723, which is 1723 EMU wider than every other 16:9 deck
// in existence. It renders fine and it is wrong, and "nearly the standard
// size" is the kind of detail that turns up later as a misaligned template.
const EMU = 914400;
const W = 12192000;
const H = 6858000;

const MARGIN = Math.round(0.6 * EMU);
const BODY_TOP = Math.round(1.6 * EMU);
const CONTENT_W = W - MARGIN * 2;

const THEME = {
  ink: '1F2933',
  muted: '6B7A8C',
  rule: 'D6DEE8',
  accent: '2563EB',
  good: '16A34A',
  warn: 'D97706',
  bad: 'DC2626',
  band: 'F1F5F9',
};

export const RAG_COLOURS = { green: THEME.good, amber: THEME.warn, red: THEME.bad, grey: THEME.muted };

// Characters XML 1.0 has no representation for at all. A literal one makes the
// whole part unreadable, and the error a reader gives is "PowerPoint found a
// problem with content" with no hint which slide. Names and comments come from
// user data, so this is not theoretical.
const ILLEGAL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g');

/** XML text escaping. Every string that reaches the file goes through this. */
export function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(ILLEGAL, '');
}

function run(text, { size = 1800, bold = false, colour = THEME.ink, italic = false } = {}) {
  return `<a:r><a:rPr lang="en-GB" sz="${size}"${bold ? ' b="1"' : ''}${italic ? ' i="1"' : ''} dirty="0">`
    + `<a:solidFill><a:srgbClr val="${colour}"/></a:solidFill></a:rPr>`
    + `<a:t>${esc(text)}</a:t></a:r>`;
}

function para(runs, { align = 'l', bullet = false, indent = 0, space = 400 } = {}) {
  const step = 285750;
  const marL = bullet ? step + indent * step : indent * step;
  return `<a:p><a:pPr algn="${align}" marL="${marL}"${bullet ? ` indent="-${step}"` : ''}>`
    + `<a:spcBef><a:spcPts val="${space}"/></a:spcBef>`
    + (bullet ? '<a:buChar char="&#8226;"/>' : '<a:buNone/>')
    + `</a:pPr>${runs}</a:p>`;
}

function textBox({ id, name, x, y, cx, cy, paragraphs, anchor = 't' }) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'
    + `<p:txBody><a:bodyPr wrap="square" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>`
    + `${paragraphs}</p:txBody></p:sp>`;
}

function rect({ id, x, y, cx, cy, fill }) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Band ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
    + `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`
    + '<a:ln><a:noFill/></a:ln>'
    + '</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>';
}

function slideHeader(title, subtitle) {
  const parts = [textBox({
    id: 2, name: 'Title', x: MARGIN, y: Math.round(0.45 * EMU), cx: CONTENT_W, cy: Math.round(0.8 * EMU),
    paragraphs: para(run(title, { size: 2800, bold: true })),
  })];
  if (subtitle) {
    parts.push(textBox({
      id: 3, name: 'Subtitle', x: MARGIN, y: Math.round(1.15 * EMU), cx: CONTENT_W, cy: Math.round(0.4 * EMU),
      paragraphs: para(run(subtitle, { size: 1400, colour: THEME.muted })),
    }));
  }
  parts.push(rect({ id: 4, x: MARGIN, y: Math.round(1.5 * EMU), cx: CONTENT_W, cy: 12700, fill: THEME.rule }));
  return parts.join('');
}

// ---------- slide kinds ----------

function titleSlide({ title, subtitle, meta = [] }) {
  return [
    rect({ id: 2, x: 0, y: 0, cx: Math.round(0.28 * EMU), cy: H, fill: THEME.accent }),
    textBox({
      id: 3, name: 'Title', x: MARGIN, y: Math.round(2.4 * EMU), cx: CONTENT_W, cy: Math.round(1.6 * EMU),
      paragraphs: para(run(title, { size: 4000, bold: true })),
    }),
    textBox({
      id: 4, name: 'Subtitle', x: MARGIN, y: Math.round(3.9 * EMU), cx: CONTENT_W, cy: Math.round(0.6 * EMU),
      paragraphs: para(run(subtitle || '', { size: 1800, colour: THEME.muted })),
    }),
    textBox({
      id: 5, name: 'Meta', x: MARGIN, y: Math.round(5.1 * EMU), cx: CONTENT_W, cy: Math.round(1.6 * EMU),
      paragraphs: meta.map((line) => para(run(line, { size: 1300, colour: THEME.muted }))).join(''),
    }),
  ].join('');
}

function bulletSlide({ title, subtitle, bullets = [] }) {
  const paragraphs = bullets.length
    ? bullets.map((item) => {
      const text = typeof item === 'string' ? item : item.text;
      const level = typeof item === 'string' ? 0 : (item.level || 0);
      return para(run(text, { size: level ? 1500 : 1700, colour: level ? THEME.muted : THEME.ink }),
        { bullet: true, indent: level, space: level ? 200 : 500 });
    }).join('')
    : para(run('Nothing recorded for this period.', { size: 1500, colour: THEME.muted, italic: true }));

  return slideHeader(title, subtitle) + textBox({
    id: 10, name: 'Body', x: MARGIN, y: BODY_TOP, cx: CONTENT_W, cy: H - BODY_TOP - MARGIN, paragraphs,
  });
}

function cell(text, { bold = false, colour = THEME.ink, fill = null } = {}) {
  return '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>'
    + `<a:p><a:pPr algn="l"/>${run(text, { size: 1100, bold, colour })}</a:p>`
    + '</a:txBody><a:tcPr marL="45720" marR="45720" marT="27432" marB="27432" anchor="ctr">'
    + (fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '')
    + '</a:tcPr></a:tc>';
}

function tableSlide({ title, subtitle, columns, rows, widths }) {
  if (!rows.length) return bulletSlide({ title, subtitle, bullets: [] });

  // Column widths default to equal shares; a caller passing weights gets them
  // normalised, so a table never has to know the slide's width in EMU.
  const weights = widths && widths.length === columns.length ? widths : columns.map(() => 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const cols = weights.map((w) => Math.round((w / totalWeight) * CONTENT_W));

  const head = `<a:tr h="370840">${columns.map((c) => cell(c, { bold: true, fill: THEME.band })).join('')}</a:tr>`;
  const body = rows.map((row) => {
    const cells = row.map((value) => {
      const text = typeof value === 'string' ? value : value.text;
      const colour = typeof value === 'string' ? THEME.ink : (value.colour || THEME.ink);
      return cell(text, { colour });
    }).join('');
    return `<a:tr h="330200">${cells}</a:tr>`;
  }).join('');

  const graphic = '<p:graphicFrame><p:nvGraphicFramePr>'
    + '<p:cNvPr id="10" name="Table"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/>'
    + '</p:nvGraphicFramePr>'
    + `<p:xfrm><a:off x="${MARGIN}" y="${BODY_TOP}"/><a:ext cx="${CONTENT_W}" cy="${Math.round(0.4 * EMU)}"/></p:xfrm>`
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">'
    + '<a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>'
    + cols.map((w) => `<a:gridCol w="${w}"/>`).join('')
    + `</a:tblGrid>${head}${body}</a:tbl>`
    + '</a:graphicData></a:graphic></p:graphicFrame>';

  return slideHeader(title, subtitle) + graphic;
}

/** Labelled numbers across the top — the shape a status pack opens with. */
function metricSlide({ title, subtitle, metrics = [], footnote = '' }) {
  const count = Math.max(1, metrics.length);
  const gap = Math.round(0.2 * EMU);
  const boxW = Math.round((CONTENT_W - gap * (count - 1)) / count);
  const boxH = Math.round(1.7 * EMU);

  const shapes = metrics.map((metric, i) => {
    const x = MARGIN + i * (boxW + gap);
    return rect({ id: 20 + i * 3, x, y: BODY_TOP, cx: boxW, cy: boxH, fill: THEME.band })
      + textBox({
        id: 21 + i * 3, name: `Metric ${i}`, x: x + Math.round(0.18 * EMU), y: BODY_TOP + Math.round(0.2 * EMU),
        cx: boxW - Math.round(0.36 * EMU), cy: boxH - Math.round(0.3 * EMU),
        paragraphs: para(run(metric.label, { size: 1100, bold: true, colour: THEME.muted }), { space: 0 })
          + para(run(metric.value, { size: 2400, bold: true, colour: metric.colour || THEME.ink }), { space: 200 })
          + (metric.sub ? para(run(metric.sub, { size: 1000, colour: THEME.muted }), { space: 100 }) : ''),
      });
  }).join('');

  const note = footnote ? textBox({
    id: 60, name: 'Footnote', x: MARGIN, y: BODY_TOP + boxH + Math.round(0.35 * EMU),
    cx: CONTENT_W, cy: Math.round(2.4 * EMU),
    paragraphs: para(run(footnote, { size: 1400, colour: THEME.muted })),
  }) : '';

  return slideHeader(title, subtitle) + shapes + note;
}

const BUILDERS = { title: titleSlide, bullets: bulletSlide, table: tableSlide, metrics: metricSlide };

function slideXml(slide) {
  const build = BUILDERS[slide.kind] || bulletSlide;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
    + '<p:cSld><p:spTree>'
    + '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
    + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
    + '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
    + build(slide)
    + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
}

// ---------- the package ----------

const NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_DOC_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PML = 'application/vnd.openxmlformats-officedocument.presentationml';

function contentTypes(count) {
  const slides = Array.from({ length: count }, (_, i) =>
    `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${PML}.slide+xml"/>`).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + `<Override PartName="/ppt/presentation.xml" ContentType="${PML}.presentation.main+xml"/>`
    + `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${PML}.slideMaster+xml"/>`
    + `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${PML}.slideLayout+xml"/>`
    + '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
    + slides
    + '</Types>';
}

function theme() {
  const colours = ['1F2933', 'FFFFFF', '404E5C', 'F1F5F9', '2563EB', '16A34A', 'D97706', 'DC2626', '7C3AED', '0891B2'];
  const scheme = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']
    .map((name, i) => `<a:${name}><a:srgbClr val="${colours[i]}"/></a:${name}>`).join('');
  const font = '<a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/>';
  const triple = (inner) => inner + inner + inner;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Project Planner">'
    + '<a:themeElements>'
    + `<a:clrScheme name="Planner">${scheme}<a:hlink><a:srgbClr val="2563EB"/></a:hlink>`
    + '<a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme>'
    + `<a:fontScheme name="Planner"><a:majorFont>${font}</a:majorFont><a:minorFont>${font}</a:minorFont></a:fontScheme>`
    + '<a:fmtScheme name="Planner">'
    + `<a:fillStyleLst>${triple('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>')}</a:fillStyleLst>`
    + `<a:lnStyleLst>${triple('<a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>')}</a:lnStyleLst>`
    + `<a:effectStyleLst>${triple('<a:effectStyle><a:effectLst/></a:effectStyle>')}</a:effectStyleLst>`
    + `<a:bgFillStyleLst>${triple('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>')}</a:bgFillStyleLst>`
    + '</a:fmtScheme></a:themeElements></a:theme>';
}

const EMPTY_TREE = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
  + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
  + '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';

function slideMaster() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ` xmlns:r="${NS_DOC_REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">`
    + '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'
    + `${EMPTY_TREE}</p:cSld>`
    + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2"'
    + ' accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6"'
    + ' hlink="hlink" folHlink="folHlink"/>'
    + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
    + '</p:sldMaster>';
}

function slideLayout() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ` xmlns:r="${NS_DOC_REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`
    + ' type="blank" preserve="1">'
    + `<p:cSld name="Blank">${EMPTY_TREE}</p:cSld>`
    + '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
}

function presentation(count) {
  const ids = Array.from({ length: count }, (_, i) =>
    `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ` xmlns:r="${NS_DOC_REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">`
    + '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
    + `<p:sldIdLst>${ids}</p:sldIdLst>`
    + `<p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="${H}" cy="${W}"/>`
    + '</p:presentation>';
}

function presentationRels(count) {
  const slides = Array.from({ length: count }, (_, i) =>
    `<Relationship Id="rId${i + 2}" Type="${NS_DOC_REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<Relationships xmlns="${NS_REL}">`
    + `<Relationship Id="rId1" Type="${NS_DOC_REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>`
    + slides
    + `<Relationship Id="rId${count + 2}" Type="${NS_DOC_REL}/theme" Target="theme/theme1.xml"/>`
    + '</Relationships>';
}

function coreProps({ title, author, created }) {
  const at = created.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"'
    + ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"'
    + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + `<dc:title>${esc(title)}</dc:title>`
    + `<dc:creator>${esc(author)}</dc:creator>`
    + `<cp:lastModifiedBy>${esc(author)}</cp:lastModifiedBy>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${at}</dcterms:created>`
    + `<dcterms:modified xsi:type="dcterms:W3CDTF">${at}</dcterms:modified>`
    + '</cp:coreProperties>';
}

function appProps(count) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"'
    + ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
    + `<Application>Project Planner</Application><Slides>${count}</Slides>`
    + '</Properties>';
}

/**
 * Builds the .pptx bytes from a list of slide descriptions.
 *
 * Each slide is `{ kind, ... }` where kind is one of title, bullets, table or
 * metrics. Keeping the slide shapes to four is deliberate: a status pack is
 * made of exactly these, and every extra shape is more XML to get subtly wrong
 * in a way that only shows up as "PowerPoint found a problem with content".
 */
export function buildPptx(slides, { title = 'Project report', author = 'Project Planner', created = new Date() } = {}) {
  const count = slides.length;
  const files = {
    '[Content_Types].xml': contentTypes(count),
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + `<Relationships xmlns="${NS_REL}">`
      + `<Relationship Id="rId1" Type="${NS_DOC_REL}/officeDocument" Target="ppt/presentation.xml"/>`
      // Core properties live in the *package* relationship namespace, not the
      // officeDocument one. Readers that check reject the whole file rather
      // than ignoring one part.
      + `<Relationship Id="rId2" Type="${NS_REL}/metadata/core-properties" Target="docProps/core.xml"/>`
      + `<Relationship Id="rId3" Type="${NS_DOC_REL}/extended-properties" Target="docProps/app.xml"/>`
      + '</Relationships>',
    'docProps/core.xml': coreProps({ title, author, created }),
    'docProps/app.xml': appProps(count),
    'ppt/presentation.xml': presentation(count),
    'ppt/_rels/presentation.xml.rels': presentationRels(count),
    'ppt/theme/theme1.xml': theme(),
    'ppt/slideMasters/slideMaster1.xml': slideMaster(),
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + `<Relationships xmlns="${NS_REL}">`
      + `<Relationship Id="rId1" Type="${NS_DOC_REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`
      + `<Relationship Id="rId2" Type="${NS_DOC_REL}/theme" Target="../theme/theme1.xml"/>`
      + '</Relationships>',
    'ppt/slideLayouts/slideLayout1.xml': slideLayout(),
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + `<Relationships xmlns="${NS_REL}">`
      + `<Relationship Id="rId1" Type="${NS_DOC_REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>`
      + '</Relationships>',
  };

  slides.forEach((slide, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = slideXml(slide);
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + `<Relationships xmlns="${NS_REL}">`
      + `<Relationship Id="rId1" Type="${NS_DOC_REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`
      + '</Relationships>';
  });

  return zip(files, { date: created });
}

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
