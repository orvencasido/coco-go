export const DocumentDirectoryPath = '/virtual/app/documents';
export const exists = async () => false;
export const stat = async () => ({ size: 0 });
export const unlink = async () => {};
export const mkdir = async () => {};
export const copyFile = async () => {};

export default {
  DocumentDirectoryPath,
  exists,
  stat,
  unlink,
  mkdir,
  copyFile,
};
