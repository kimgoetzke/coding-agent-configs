const MIN_LEFT_GUTTER = 8;
const MIN_LABEL_WIDTH = 4;

function truncatePlainText(text, maxWidth) {
  if (maxWidth <= 0) {
    return "";
  }

  const chars = [...text];
  if (chars.length <= maxWidth) {
    return text;
  }

  if (maxWidth === 1) {
    return "…";
  }

  return `${chars.slice(0, maxWidth - 1).join("")}…`;
}

export function fitSessionLabel(sessionName, width) {
  const normalized = sessionName?.trim();
  if (!normalized) {
    return "";
  }

  if (width <= 0) {
    return "";
  }

  if (width <= 2) {
    return truncatePlainText(normalized, width);
  }

  const fittedName = truncatePlainText(normalized, width - 2);
  return ` ${fittedName} `;
}

export function buildTopBand(width, sessionName) {
  const labelWidth = width > MIN_LEFT_GUTTER + MIN_LABEL_WIDTH ? width - MIN_LEFT_GUTTER : width;
  const label = fitSessionLabel(sessionName, labelWidth);
  if (!label) {
    return " ".repeat(width);
  }

  return `${" ".repeat(Math.max(0, width - label.length))}${label}`;
}
