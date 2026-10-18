import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), upload: vi.fn(), remove: vi.fn(), storageFrom: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  db: () => ({ from: mocks.from, storage: { from: mocks.storageFrom } }),
}));

import { deletePhoto, fetchFamilyPhotos, PhotoNotFoundError, photoPath, setPhotoActive, uploadPhoto } from "./photos";

/** from(...).insert/update/delete/select/eq/order/single のどれを呼んでも、最後に result を返す鎖。 */
function query(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
  for (const name of ["select", "insert", "update", "delete", "eq", "order"]) chain[name] = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  mocks.from.mockReturnValue(chain);
  return chain;
}

const row = { id: "p1", storage_path: "f1/p1.jpg", active: true, created_at: "2026-10-18T00:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageFrom.mockReturnValue({ upload: mocks.upload, remove: mocks.remove });
  mocks.upload.mockResolvedValue({ data: {}, error: null });
  mocks.remove.mockResolvedValue({ data: [], error: null });
  vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
});

describe("photoPath", () => {
  it("{family_id}/{id}.jpg(DB の check 制約と Storage のポリシーが前提にする形)", () => {
    expect(photoPath("f1", "p1")).toBe("f1/p1.jpg");
  });
});

describe("fetchFamilyPhotos", () => {
  it("新しい順に読み、画面で使う形にする", async () => {
    const chain = query({ data: [row], error: null });
    await expect(fetchFamilyPhotos()).resolves.toEqual([{ id: "p1", storagePath: "f1/p1.jpg", active: true, createdAt: row.created_at }]);
    expect(mocks.from).toHaveBeenCalledWith("oya_photos");
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });
});

describe("uploadPhoto", () => {
  const id = "00000000-0000-4000-8000-000000000001";

  it("ファイルを家族のフォルダへ置いてから、写真の行を作る", async () => {
    const chain = query({ data: { ...row, id, storage_path: `f1/${id}.jpg` }, error: null });
    const jpeg = new Blob(["x"], { type: "image/jpeg" });
    await expect(uploadPhoto("f1", jpeg)).resolves.toMatchObject({ id, storagePath: `f1/${id}.jpg` });
    expect(mocks.storageFrom).toHaveBeenCalledWith("grandchild-photos");
    expect(mocks.upload).toHaveBeenCalledWith(`f1/${id}.jpg`, jpeg, { contentType: "image/jpeg", upsert: false });
    expect(chain.insert).toHaveBeenCalledWith({ id, family_id: "f1", storage_path: `f1/${id}.jpg` });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("ファイルを置けなければ、行は作らない", async () => {
    mocks.upload.mockResolvedValue({ data: null, error: { message: "new row violates row-level security policy" } });
    query({ data: null, error: null });
    await expect(uploadPhoto("f1", new Blob(["x"]))).rejects.toMatchObject({ message: expect.stringContaining("row-level") });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("行を作れなければ、置いたファイルを消して、元のエラーを伝える", async () => {
    query({ data: null, error: { message: "row-level security" } });
    await expect(uploadPhoto("f1", new Blob(["x"]))).rejects.toEqual({ message: "row-level security" });
    expect(mocks.remove).toHaveBeenCalledWith([`f1/${id}.jpg`]);
  });
});

describe("setPhotoActive", () => {
  it("active を変える", async () => {
    const chain = query({ data: [{ id: "p1" }], error: null });
    await setPhotoActive("p1", false);
    expect(chain.update).toHaveBeenCalledWith({ active: false });
    expect(chain.eq).toHaveBeenCalledWith("id", "p1");
  });

  it("0件(権限が無い・消えている)ならエラーにする", async () => {
    query({ data: [], error: null });
    await expect(setPhotoActive("p1", true)).rejects.toBeInstanceOf(PhotoNotFoundError);
  });
});

describe("deletePhoto", () => {
  it("行を消してから、ファイルを消す", async () => {
    const chain = query({ data: [{ id: "p1" }], error: null });
    await deletePhoto({ id: "p1", storagePath: "f1/p1.jpg" });
    expect(chain.delete).toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith(["f1/p1.jpg"]);
  });

  it("行を消せなければ(0件)、ファイルは消さない", async () => {
    query({ data: [], error: null });
    await expect(deletePhoto({ id: "p1", storagePath: "f1/p1.jpg" })).rejects.toBeInstanceOf(PhotoNotFoundError);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("ファイルの削除に失敗しても、写真は削除済みとして扱う", async () => {
    query({ data: [{ id: "p1" }], error: null });
    mocks.remove.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(deletePhoto({ id: "p1", storagePath: "f1/p1.jpg" })).resolves.toBeUndefined();
  });
});
