// Physical line counting for source verification. Never imports another skill.
export const sourceLineCount = bytes => {
  const text = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
  if (!text) return 0;
  const lines = text.split(/\r\n|\n|\r/);
  return lines.length - (lines.at(-1) === '' ? 1 : 0);
};
