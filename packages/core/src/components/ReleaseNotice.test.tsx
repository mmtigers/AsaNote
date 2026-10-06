import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReleaseNotice } from "./ReleaseNotice";

afterEach(cleanup);

describe("ReleaseNotice", () => {
  it("リリースが無ければ何も出さない", () => {
    const { container } = render(<ReleaseNotice latest={undefined} lastSeenVersion={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("最後に見たバージョンが最新でなければ、新着として更新日を出す", () => {
    render(<ReleaseNotice latest={{ version: "1.2.0", date: "2026-10-05" }} lastSeenVersion="1.1.0" />);
    expect(screen.getByText(/に更新しました/)).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/updates");
  });

  it("まだ何も見ていない(null)ときも、新着として出す", () => {
    render(<ReleaseNotice latest={{ version: "1.2.0", date: "2026-10-05" }} lastSeenVersion={null} />);
    expect(screen.getByText(/に更新しました/)).toBeTruthy();
  });

  it("最新を見たあとは「更新履歴」とだけ出す", () => {
    render(<ReleaseNotice latest={{ version: "1.2.0", date: "2026-10-05" }} lastSeenVersion="1.2.0" />);
    expect(screen.getByText("更新履歴")).toBeTruthy();
    expect(screen.queryByText(/に更新しました/)).toBeNull();
  });
});
