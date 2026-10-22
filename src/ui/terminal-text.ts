/** Escape input data before adding application-owned ANSI styling. */
export function terminalText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, character => {
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
}
