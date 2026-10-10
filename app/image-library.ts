"use client";

// The image library shared by the 图片 sidebar (folders) and the 图片 list: one place owns the encrypted store handle,
// the images, the folders and the selected folder filter, so the two never disagree.

import { useCallback, useEffect, useRef, useState } from "react";
import { IMAGE_FILTER_ALL, resolveImageFilter, type ImageFilter } from "./image-folders-core";
import { normalizeFolderName, openImageStore, type ImageFolder, type ImageMeta, type ImageStore } from "./image-store";

export const LOAD_FAILED = "图片读取失败，原数据没有改动。";

// The key is derived once per session: reopening the section reuses the same store.
const storeCache = new Map<string, Promise<ImageStore>>();
export function loadStore(deviceKey: string) {
  let opened = storeCache.get(deviceKey);
  if (!opened) {
    opened = openImageStore(deviceKey);
    storeCache.set(deviceKey, opened);
    opened.catch(() => storeCache.delete(deviceKey));
  }
  return opened;
}

export function readableMessage(error: unknown, fallback: string) {
  return error instanceof Error && /[一-鿿]/.test(error.message) ? error.message : fallback;
}

export type ImageLibrary = {
  // false until the images and folders have been read.
  ready: boolean;
  loadError: string;
  retry: () => void;
  images: ImageMeta[] | null;
  folders: ImageFolder[];
  filter: ImageFilter;
  setFilter: (filter: ImageFilter) => void;
  // Throws the store's short Chinese message when the image is refused.
  addImage: (file: Blob, title: string, folder: string | null) => Promise<ImageMeta>;
  rename: (id: string, title: string) => Promise<ImageMeta>;
  remove: (id: string) => Promise<void>;
  getBlob: (id: string) => Promise<Blob>;
  getThumb: (id: string) => Promise<Blob>;
  markUsed: (id: string) => Promise<void>;
  // The folder actions show their own toast. They return whether the change was made.
  // `onError` (Settings) receives the failure message instead of the toast, to show it next to the form.
  moveImage: (id: string, folder: string | null) => Promise<boolean>;
  togglePinned: (id: string) => Promise<void>;
  createFolder: (name: string, onError?: (message: string) => void) => Promise<string | null>;
  renameFolder: (from: string, to: string, onError?: (message: string) => void) => Promise<string | null>;
  setFolderColor: (name: string, color: string, onError?: (message: string) => void) => Promise<boolean>;
  deleteFolder: (name: string, onError?: (message: string) => void) => Promise<boolean>;
};

// `enabled` turns on once the 图片 section is first opened; nothing is read before that.
export function useImageLibrary(deviceKey: string, enabled: boolean, onToast: (message: string) => void): ImageLibrary {
  const [wanted, setWanted] = useState(false);
  if (enabled && !wanted) setWanted(true);
  const [images, setImages] = useState<ImageMeta[] | null>(null);
  const [folders, setFolders] = useState<ImageFolder[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadTick, setReloadTick] = useState(0);
  const [rawFilter, setRawFilter] = useState<ImageFilter>(IMAGE_FILTER_ALL);
  const toastRef = useRef(onToast);
  useEffect(() => { toastRef.current = onToast; });

  useEffect(() => {
    if (!wanted || !deviceKey) return;
    let cancelled = false;
    loadStore(deviceKey)
      .then(async (opened) => {
        const [list, listedFolders] = await Promise.all([opened.list(), opened.listFolders()]);
        if (cancelled) return;
        // An image added while the list was still loading is already in state: keep it.
        setImages((current) => current
          ? [...current, ...list.filter((meta) => !current.some((value) => value.id === meta.id))].sort((a, b) => b.createdAt - a.createdAt)
          : list);
        setFolders(listedFolders);
        setReady(true);
        setLoadError("");
      })
      .catch(() => { if (!cancelled) setLoadError(LOAD_FAILED); });
    return () => { cancelled = true; };
  }, [wanted, deviceKey, reloadTick]);

  const retry = useCallback(() => setReloadTick((tick) => tick + 1), []);
  // A folder that no longer exists must not stay selected.
  const filter = resolveImageFilter(rawFilter, folders);
  const toast = (message: string) => toastRef.current(message);

  const getBlob = useCallback(async (id: string) => (await loadStore(deviceKey)).getBlob(id), [deviceKey]);
  const getThumb = useCallback(async (id: string) => (await loadStore(deviceKey)).getThumb(id), [deviceKey]);
  const markUsed = useCallback(async (id: string) => (await loadStore(deviceKey)).markUsed(id), [deviceKey]);

  async function addImage(file: Blob, title: string, folder: string | null) {
    let target: ImageStore;
    try {
      // The chooser may be used before the list has finished loading: wait for the store instead of refusing.
      target = await loadStore(deviceKey);
    } catch {
      throw new Error(LOAD_FAILED);
    }
    const meta = await target.add(file, title, folder);
    setImages((current) => [meta, ...(current ?? [])]);
    return meta;
  }

  async function rename(id: string, title: string) {
    const updated = await (await loadStore(deviceKey)).rename(id, title);
    setImages((current) => current?.map((meta) => meta.id === updated.id ? updated : meta) ?? current);
    return updated;
  }

  async function remove(id: string) {
    await (await loadStore(deviceKey)).remove(id);
    setImages((current) => current?.filter((meta) => meta.id !== id) ?? current);
  }

  async function togglePinned(id: string) {
    const current = images?.find((meta) => meta.id === id);
    if (!current) return;
    try {
      const updated = await (await loadStore(deviceKey)).setPinned(id, !current.pinned);
      setImages((list) => list?.map((meta) => meta.id === updated.id ? updated : meta) ?? list);
    } catch (error) {
      toast(readableMessage(error, "收藏保存失败，图片没有改动"));
    }
  }

  async function moveImage(id: string, folder: string | null) {
    try {
      const moved = await (await loadStore(deviceKey)).moveImage(id, folder);
      setImages((current) => current?.map((meta) => meta.id === moved.id ? moved : meta) ?? current);
      toast(moved.folder ? `已移到「${moved.folder}」` : "已移到未分类");
      return true;
    } catch (error) {
      toast(readableMessage(error, "移动失败，图片没有改动"));
      return false;
    }
  }

  async function createFolder(name: string, onError = toast) {
    try {
      const next = await (await loadStore(deviceKey)).createFolder(name);
      setFolders(next);
      toast("目录已创建");
      return next[next.length - 1].name;
    } catch (error) {
      onError(readableMessage(error, "创建失败，请重试"));
      return null;
    }
  }

  async function renameFolder(from: string, to: string, onError = toast) {
    const name = normalizeFolderName(to);
    try {
      const next = await (await loadStore(deviceKey)).renameFolder(from, to);
      setFolders(next);
      setImages((current) => current?.map((meta) => meta.folder === from ? { ...meta, folder: name } : meta) ?? current);
      // Keep the folder selected under its new name.
      setRawFilter((current) => current === `folder:${from}` ? `folder:${name}` : current);
      if (name !== from) toast("目录已重命名");
      return name;
    } catch (error) {
      onError(readableMessage(error, "重命名失败，请重试"));
      return null;
    }
  }

  async function setFolderColor(name: string, color: string, onError = toast) {
    try {
      setFolders(await (await loadStore(deviceKey)).setFolderColor(name, color));
      toast("颜色已更新");
      return true;
    } catch (error) {
      onError(readableMessage(error, "颜色没有保存，请重试"));
      return false;
    }
  }

  async function deleteFolder(name: string, onError = toast) {
    try {
      setFolders(await (await loadStore(deviceKey)).deleteFolder(name));
      setImages((current) => current?.map((meta) => meta.folder === name ? { ...meta, folder: undefined } : meta) ?? current);
      setRawFilter((current) => current === `folder:${name}` ? IMAGE_FILTER_ALL : current);
      toast(`已删除目录「${name}」`);
      return true;
    } catch (error) {
      onError(readableMessage(error, "删除失败，图片没有改动"));
      return false;
    }
  }

  return { ready, loadError, retry, images, folders, filter, setFilter: setRawFilter, addImage, rename, remove, getBlob, getThumb, markUsed, moveImage, togglePinned, createFolder, renameFolder, setFolderColor, deleteFolder };
}
