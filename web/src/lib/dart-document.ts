import JSZip from "jszip";

const DART_DOCUMENT_URL = "https://opendart.fss.or.kr/api/document.xml";
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

const BOILERPLATE_PATTERNS: RegExp[] = [
  /^금융위원회\s*\/\s*한국거래소\s*귀중/,
  /^금융감독원장\s*귀하/,
  /^주요사항보고서\s*\/\s*거래소\s*신고의무\s*사항/,
  /^위\s+사항을\s+보고합니다/,
  /^정\s*정\s*신\s*고\s*[\(（]보고[\)）]/,
  /^1\.\s*정정대상\s*공시서류\s*:/,
  /^2\.\s*정정대상\s*공시서류의\s*최초제출일\s*:/,
  /^3\.\s*정정사항/,
  /^[─━═\-─]+$/,
  /^-$/,
  /^\(-\)$/,
];

const fetchDocumentZip = async (rceptNo: string): Promise<ArrayBuffer> => {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) throw new Error("DART_API_KEY 환경변수 없음");

  const url = new URL(DART_DOCUMENT_URL);
  url.searchParams.set("crtfc_key", apiKey);
  url.searchParams.set("rcept_no", rceptNo);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`DART API 호출 실패: ${res.status} ${res.statusText}`);

  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer, 0, 4);
  const isZip = ZIP_MAGIC.every((b, i) => bytes[i] === b);
  if (!isZip) {
    throw new Error("DART document.xml: 비ZIP 응답 (status code 응답 가능성)");
  }

  return buffer;
};

const extractXmlFromZip = async (buffer: ArrayBuffer): Promise<string> => {
  const zip = await JSZip.loadAsync(buffer);

  const xmlFiles: Array<{ name: string; file: JSZip.JSZipObject }> = [];
  zip.forEach((relativePath, zipEntry) => {
    if (relativePath.toLowerCase().endsWith(".xml") && !zipEntry.dir) {
      xmlFiles.push({ name: relativePath, file: zipEntry });
    }
  });

  if (xmlFiles.length === 0) {
    const allFiles: string[] = [];
    zip.forEach((name) => allFiles.push(name));
    throw new Error(`DART ZIP에 XML 파일 없음. 포함된 파일: [${allFiles.join(", ")}]`);
  }

  const xmlContents = await Promise.all(
    xmlFiles.map(async ({ name, file }) => ({
      name,
      content: await file.async("string"),
    }))
  );

  const largest = xmlContents.reduce((a, b) => (a.content.length >= b.content.length ? a : b));
  return largest.content;
};

const removeLibraryBlocks = (xml: string): string =>
  xml.replace(/<LIBRARY>[\s\S]*?<\/LIBRARY>/g, "");

const removeEngAttributes = (xml: string): string => xml.replace(/\s+ENG="[^"]*"/g, "");

const stripTags = (xml: string): string => xml.replace(/<[^>]+>/g, "");

const cleanWhitespace = (text: string): string => {
  const lines = text.split(/\r?\n/).map((ln) => ln.trim());
  const result: string[] = [];
  let prevBlank = false;
  for (const line of lines) {
    if (!line) {
      if (!prevBlank) result.push("");
      prevBlank = true;
    } else {
      result.push(line);
      prevBlank = false;
    }
  }
  return result.join("\n").trim();
};

const removeBoilerplate = (text: string): string => {
  const lines = text.split("\n");
  const kept = lines.filter((line) => !BOILERPLATE_PATTERNS.some((pat) => pat.test(line.trim())));
  return cleanWhitespace(kept.join("\n"));
};

export const fetchDisclosureText = async (rceptNo: string): Promise<string> => {
  const buffer = await fetchDocumentZip(rceptNo);
  const xml = await extractXmlFromZip(buffer);

  const noLibrary = removeLibraryBlocks(xml);
  const noEng = removeEngAttributes(noLibrary);
  const noTags = stripTags(noEng);
  const cleaned = cleanWhitespace(noTags);
  return removeBoilerplate(cleaned);
};
