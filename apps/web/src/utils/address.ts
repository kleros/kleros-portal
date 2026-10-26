/** 0x1234…abcd */
export const shortenAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
