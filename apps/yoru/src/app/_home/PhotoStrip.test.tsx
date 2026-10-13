import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { addPhoto, reportHandledError, LimitError } = vi.hoisted(() => {
  class LimitError extends Error {}
  return { addPhoto: vi.fn(), reportHandledError: vi.fn(), LimitError };
});
vi.mock("@note/core/clientErrors", () => ({ reportHandledError }));
vi.mock("@/lib/db/photos", () => ({
  addPhoto,
  getPhotoUrl: vi.fn(),
  removePhoto: vi.fn(),
  useRecordPhotos: () => [],
  PhotoLimitError: LimitError,
}));

import { PhotoStrip } from "./PhotoStrip";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function pick(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("PhotoStrip の失敗の記録(#213)", () => {
  it("縮小・保存に失敗したら、photo/process を記録する", async () => {
    const failure = new Error("canvas failed");
    addPhoto.mockRejectedValue(failure);
    const { container } = render(<PhotoStrip recordId="r1" />);

    pick(container);

    await waitFor(() => expect(reportHandledError).toHaveBeenCalledWith("photo/process", failure));
  });

  it("上限(想定どおりの案内)は記録しない", async () => {
    addPhoto.mockRejectedValue(new LimitError("上限です"));
    const { container } = render(<PhotoStrip recordId="r1" />);

    pick(container);

    await screen.findByText("上限です");
    expect(reportHandledError).not.toHaveBeenCalled();
  });
});
