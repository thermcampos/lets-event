// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  put: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@vercel/blob", () => ({ put: mocks.put }));
vi.mock("@/lib/prisma.server", () => ({
  prisma: { user: { update: mocks.userUpdate } },
}));

import { POST } from "@/app/api/upload/avatar/route";

function uploadRequest(file?: File) {
  const form = new FormData();
  if (file) form.set("file", file);
  return new Request("https://app.test/api/upload/avatar", {
    method: "POST",
    body: form,
  });
}

const png = () => new File(["x"], "a.png", { type: "image/png" });

describe("POST /api/upload/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.put.mockResolvedValue({ url: "https://blob.test/avatars/user-1" });
    mocks.userUpdate.mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(uploadRequest(png()));
    expect(res.status).toBe(401);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no user", async () => {
    mocks.auth.mockResolvedValue({});
    const res = await POST(uploadRequest(png()));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file is provided", async () => {
    const res = await POST(uploadRequest());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No file provided" });
  });

  it("returns 400 when the file exceeds 10MB", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "b.png", {
      type: "image/png",
    });
    const res = await POST(uploadRequest(big));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too large/);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("accepts a file of exactly 10MB", async () => {
    const edge = new File([new Uint8Array(10 * 1024 * 1024)], "b.png", {
      type: "image/png",
    });
    const res = await POST(uploadRequest(edge));
    expect(res.status).toBe(200);
  });

  it("returns 400 when the file is not an image", async () => {
    const res = await POST(
      uploadRequest(new File(["x"], "a.txt", { type: "text/plain" })),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "File must be an image" });
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("uploads to blob storage and saves the url on the user", async () => {
    const res = await POST(uploadRequest(png()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://blob.test/avatars/user-1",
    });
    expect(mocks.put).toHaveBeenCalledWith("avatars/user-1", expect.any(File), {
      access: "public",
      addRandomSuffix: false,
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { image: "https://blob.test/avatars/user-1" },
    });
  });

  it("characterization: a blob upload failure is not caught and rejects", async () => {
    mocks.put.mockRejectedValue(new Error("blob down"));
    await expect(POST(uploadRequest(png()))).rejects.toThrow("blob down");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
