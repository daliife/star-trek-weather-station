type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type WebkitElement = Element & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function webkitDocument(doc: Document): WebkitDocument {
  return doc;
}

export function isFullscreenSupported(doc: Document = document): boolean {
  const webkit = webkitDocument(doc);
  return Boolean(doc.fullscreenEnabled || webkit.webkitFullscreenEnabled);
}

export function isFullscreenActive(doc: Document = document): boolean {
  const webkit = webkitDocument(doc);
  return Boolean(doc.fullscreenElement || webkit.webkitFullscreenElement);
}

export async function toggleFullscreen(
  target: Element = document.documentElement,
  doc: Document = document,
): Promise<void> {
  const webkit = webkitDocument(doc);
  if (isFullscreenActive(doc)) {
    const exit = doc.exitFullscreen?.bind(doc) ?? webkit.webkitExitFullscreen?.bind(doc);
    if (!exit) return;
    await exit();
    return;
  }
  const el = target as WebkitElement;
  const enter = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  if (!enter) return;
  await enter();
}
