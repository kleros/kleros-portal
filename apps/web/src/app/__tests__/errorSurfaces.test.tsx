import { renderToStaticMarkup } from "react-dom/server";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import PortalError from "../(portal)/error";
import GlobalError from "../global-error";
import NotFound from "../not-found";

it("offers a home link when a page is missing", () => {
  render(<NotFound />);
  expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
});

describe("portal error boundary", () => {
  it("retries without exposing the original error or digest", async () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("secret token and internal service failure"), { digest: "private-digest" });
    const { container } = render(<PortalError error={error} reset={reset} />);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
    expect(container).not.toHaveTextContent(error.message);
    expect(container).not.toHaveTextContent(error.digest);
    const support = screen.getByRole("link", { name: "Contact support" });
    expect(support).toHaveAttribute("href", "https://t.me/kleros");
    expect(support).toHaveAttribute("rel", "noopener noreferrer");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledExactlyOnceWith();
  });
});

describe("global error boundary", () => {
  it("renders its own document with no providers or external styling", () => {
    const html = renderToStaticMarkup(<GlobalError error={new Error("private detail")} reset={() => {}} />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(html).toMatch(/^<html lang="en"><body/);
    expect(doc.querySelector("h1")?.textContent).toBe("Something went wrong");
    expect(doc.body.getAttribute("style")).toContain("background:#fafafa");
    expect(doc.querySelector("meta[name=referrer]")?.getAttribute("content")).toBe("no-referrer");
    expect(doc.querySelector("link, script")).toBeNull();
    expect(html).not.toContain("private detail");
  });

  it("calls reset when retrying a root failure", async () => {
    const reset = vi.fn();
    const frame = document.createElement("iframe");
    document.body.append(frame);
    if (!frame.contentDocument) throw new Error("Missing test document");
    const view = render(<GlobalError error={new Error("private detail")} reset={reset} />, {
      container: frame.contentDocument,
    });
    await userEvent.setup().click(view.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledExactlyOnceWith();
    expect(view.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
    view.unmount();
    frame.remove();
  });
});
