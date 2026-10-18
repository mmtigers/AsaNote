import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Photo } from "@/lib/db/photos";

const mocks = vi.hoisted(() => ({
  fetchFamilyPhotos: vi.fn(),
  uploadPhoto: vi.fn(),
  setPhotoActive: vi.fn(),
  deletePhoto: vi.fn(),
  getPhotoUrls: vi.fn(),
  resizeToJpeg: vi.fn(),
}));
vi.mock("@/lib/db/photos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/photos")>()),
  fetchFamilyPhotos: mocks.fetchFamilyPhotos,
  uploadPhoto: mocks.uploadPhoto,
  setPhotoActive: mocks.setPhotoActive,
  deletePhoto: mocks.deletePhoto,
}));
vi.mock("@/lib/photos", () => ({ getPhotoUrls: mocks.getPhotoUrls }));
vi.mock("@/lib/imageResize", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/imageResize")>()),
  resizeToJpeg: mocks.resizeToJpeg,
}));

import { ImageResizeError } from "@/lib/imageResize";
import { PhotoManager } from "./PhotoManager";

const active: Photo = { id: "p1", storagePath: "f/p1.jpg", active: true, createdAt: "2" };
const paused: Photo = { id: "p2", storagePath: "f/p2.jpg", active: false, createdAt: "1" };

function rejectWith(error: unknown) {
  return () => Promise.reject(error);
}

function selectFiles(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files } });
}

beforeEach(() => {
  mocks.fetchFamilyPhotos.mockResolvedValue([active, paused]);
  mocks.getPhotoUrls.mockResolvedValue(new Map([["f/p1.jpg", "https://example.test/p1.jpg"]]));
  mocks.resizeToJpeg.mockImplementation(async () => new Blob(["jpeg"], { type: "image/jpeg" }));
  mocks.uploadPhoto.mockResolvedValue(active);
  mocks.setPhotoActive.mockResolvedValue(undefined);
  mocks.deletePhoto.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PhotoManager", () => {
  it("写真の一覧と、表示に使う枚数を出す。読めない画像には案内を出す", async () => {
    render(<PhotoManager familyId="f" />);
    expect(await screen.findByText(/2枚\(表示に使う写真: 1枚\)/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "孫の写真" }).getAttribute("src")).toBe("https://example.test/p1.jpg");
    expect(screen.getByText("画像を読み込めません")).toBeTruthy();
  });

  it("写真が無いときは、それでも記録を完了できることを伝える", async () => {
    mocks.fetchFamilyPhotos.mockResolvedValue([]);
    render(<PhotoManager familyId="f" />);
    expect(await screen.findByText(/まだ写真がありません/)).toBeTruthy();
  });

  it("選んだ写真を小さくしてから、1枚ずつ追加する", async () => {
    render(<PhotoManager familyId="f" />);
    await screen.findByText(/2枚/);
    const files = [new File(["a"], "a.heic"), new File(["b"], "b.jpg")];
    selectFiles(files);
    expect(await screen.findByText("2枚の写真を追加しました。")).toBeTruthy();
    expect(mocks.resizeToJpeg).toHaveBeenNthCalledWith(1, files[0]);
    expect(mocks.uploadPhoto).toHaveBeenCalledTimes(2);
    expect(mocks.uploadPhoto).toHaveBeenCalledWith("f", expect.any(Blob));
    expect(mocks.fetchFamilyPhotos).toHaveBeenCalledTimes(2);
  });

  it("一部を追加できなかったときは、枚数と理由を伝える", async () => {
    mocks.resizeToJpeg.mockImplementationOnce(async () => new Blob(["ok"])).mockImplementationOnce(rejectWith(new ImageResizeError("unreadable")));
    render(<PhotoManager familyId="f" />);
    await screen.findByText(/2枚/);
    selectFiles([new File(["a"], "a.jpg"), new File(["b"], "b.txt")]);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("2枚のうち1枚を追加できませんでした");
    expect(alert.textContent).toContain("画像として読み込めない");
    expect(mocks.uploadPhoto).toHaveBeenCalledTimes(1);
  });

  it("権限が無ければ、サーバーの拒否を案内する", async () => {
    mocks.uploadPhoto.mockImplementation(rejectWith({ message: "not_admin" }));
    render(<PhotoManager familyId="f" />);
    await screen.findByText(/2枚/);
    selectFiles([new File(["a"], "a.jpg")]);
    expect((await screen.findByRole("alert")).textContent).toContain("家族管理者だけ");
  });

  it("使わないにする・また使う", async () => {
    render(<PhotoManager familyId="f" />);
    fireEvent.click(await screen.findByRole("button", { name: "使わないにする" }));
    await vi.waitFor(() => expect(mocks.setPhotoActive).toHaveBeenCalledWith("p1", false));
    fireEvent.click(await screen.findByRole("button", { name: "また使う" }));
    await vi.waitFor(() => expect(mocks.setPhotoActive).toHaveBeenCalledWith("p2", true));
  });

  it("削除は確認してから", async () => {
    render(<PhotoManager familyId="f" />);
    const item = (await screen.findByRole("button", { name: "また使う" })).closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: "削除する" }));
    expect(mocks.deletePhoto).not.toHaveBeenCalled();
    expect(screen.getByText(/見返せなくなります/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "削除する" }));
    await vi.waitFor(() => expect(mocks.deletePhoto).toHaveBeenCalledWith(paused));
  });
});
