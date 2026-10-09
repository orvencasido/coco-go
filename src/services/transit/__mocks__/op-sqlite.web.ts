export const open = () => {
  throw new Error('op-sqlite is a native C++ module. Using TransitDatabase in-memory SQLite fallback.');
};
export default { open };
