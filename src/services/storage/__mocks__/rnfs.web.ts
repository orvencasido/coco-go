export const DocumentDirectoryPath = '/virtual/app/documents';
export const MainBundlePath = '';
export const exists = async () => false;
export const stat = async () => ({ size: 0 });
export const unlink = async () => {};
export const mkdir = async () => {};
export const copyFile = async () => {};

function nativeOnly(): never {
  throw new Error('Model installation requires the Android or iOS app.');
}

export const downloadFile = nativeOnly;
export const stopDownload = nativeOnly;
export const moveFile = nativeOnly;
export const hash = nativeOnly;
export const getFSInfo = nativeOnly;
export const copyFileAssets = nativeOnly;

export default {
  DocumentDirectoryPath,
  exists,
  stat,
  unlink,
  mkdir,
  copyFile,
};
