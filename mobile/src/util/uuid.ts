function hex(n: number) {
  return n.toString(16).padStart(2, "0");
}

export function makeUuid(): string {
  const anyCrypto = globalThis.crypto as any;
  if (anyCrypto?.randomUUID) return anyCrypto.randomUUID();
  if (anyCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    anyCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const b = Array.from(bytes);
    const s = b.map(hex).join("");
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
  }

  const part = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `${part()}${part()}-${part()}-4${part().slice(1)}-${((8 + Math.random() * 4) | 0).toString(16)}${part().slice(1)}-${part()}${part()}${part()}`;
}

