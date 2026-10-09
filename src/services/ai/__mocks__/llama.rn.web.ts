export const initLlama = async () => {
  throw new Error('llama.rn is a native C++ module not available directly in browser. Using LlamaService mock mode.');
};

export const releaseAllLlama = async () => {
  // Mock release
};

export type LlamaContext = any;
export type TokenData = any;

export default { initLlama, releaseAllLlama };
